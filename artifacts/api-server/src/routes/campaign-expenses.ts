import { Router, type IRouter } from "express";
import { db, campaignExpensesTable, campaignMovementsTable, campaignsTable, insertCampaignExpenseSchema } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { diagnoseExpense } from "../lib/expense-cleanup";
import { isOwnDocument } from "../lib/demo-classification";
import { readProtectedCampaignIds } from "../lib/protected-campaigns";
import { toSafeAmount } from "../lib/amount-format";
import { logAuditAction } from "../middleware/auth-utils";
import { AUDIT_ACTIONS, AUDIT_RESOURCES, auditContext } from "../lib/audit";
import { adminActionLimiter } from "../middleware/rate-limit";
import { toIsoSafe } from "../lib/date-format";
import { appendMovement } from "../lib/ledger";
import { closedCampaignError, isCampaignClosed } from "./campaign-closure";

const router: IRouter = Router();

// Dinero: solo administrador o superadmin.
const adminOnly = [requireAdmin, requireRole(ROLES.ADMIN)];

/**
 * V14-2.3: una campaña con CIERRE FINANCIERO FIRMADO no admite escrituras contables.
 *
 * Se aplica de una vez a las tres rutas de gastos con un `router.use` con el mismo
 * patrón: solo intercepta los métodos que CAMBIAN estado (las lecturas siguen
 * funcionando, que es lo que necesita el panel para consultar). El motivo del bloqueo
 * lo explica `closedCampaignError()`, que incluye la salida: reabrir (superadmin) o
 * registrar un asiento compensatorio.
 */
router.use("/campaigns/:id/expenses", async (req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    next();
    return;
  }
  const campaignId = Number(req.params.id);
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    next();
    return;
  }
  try {
    if (await isCampaignClosed(campaignId)) {
      res.status(409).json(closedCampaignError());
      return;
    }
    next();
  } catch (err) {
    // Ante un fallo al comprobar el cierre se RECHAZA la escritura: si no se puede
    // saber si la campaña está cerrada, no se toca su contabilidad.
    req.log.error({ err, campaignId }, "Failed to check campaign closure state");
    res.status(503).json({
      error: "server_error",
      code: "closure_check_failed",
      message: "No se pudo comprobar el estado de cierre de la campaña. Inténtalo de nuevo.",
    });
  }
});

// Público: SOLO gastos publicados (is_public=true). El filtro va en SQL para
// que las filas privadas (responsable, observaciones, comprobantes) NUNCA
// salgan por este endpoint anónimo (antes devolvía TODAS salvo
// ?publicOnly=true, con caché pública). El panel admin usa
// GET /admin/campaigns/:id/expenses.
router.get("/campaigns/:id/expenses", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const expenses = await db
      .select()
      .from(campaignExpensesTable)
      .where(
        and(
          eq(campaignExpensesTable.campaignId, campaignId),
          eq(campaignExpensesTable.isPublic, true),
        ),
      )
      .orderBy(desc(campaignExpensesTable.createdAt));
    res.json(expenses.map(formatExpense));
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign expenses");
    res.status(500).json({ error: "server_error", message: "Failed to get expenses" });
  }
});

// Admin: TODOS los gastos (públicos y privados) para gestión interna.
// Protegido por el gate global /admin/* (index.ts) y por adminOnly.
router.get(
  "/admin/campaigns/:id/expenses",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const expenses = await db
        .select()
        .from(campaignExpensesTable)
        .where(eq(campaignExpensesTable.campaignId, campaignId))
        .orderBy(desc(campaignExpensesTable.createdAt));
      res.json(expenses.map(formatExpense));
    } catch (err) {
      req.log.error({ err }, "Failed to get campaign expenses (admin)");
      res.status(500).json({ error: "server_error", message: "Failed to get expenses" });
    }
  },
);

router.post(
  "/campaigns/:id/expenses",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const data = insertCampaignExpenseSchema.parse({ ...req.body, campaignId });
      const expense = await db.transaction(async (tx) => {
        const [exp] = await tx.insert(campaignExpensesTable).values(data).returning();
        // Ledger Trust Pay: los gastos PÚBLICOS quedan encadenados en el
        // ledger inmutable. Ediciones/deletes posteriores no tocan la cadena
        // (append-only); el auditor ve el registro original.
        if (exp.isPublic) {
          await appendMovement(tx, campaignId, {
            kind: "gasto",
            amount: exp.amount,
            description: exp.description,
            sourceType: "expense",
            sourceId: exp.id,
            createdAt: new Date(exp.createdAt),
          });
        }
        return exp;
      });
      return res.status(201).json(formatExpense(expense));
    } catch (err) {
      // API-06: validación (Zod) → 400; cualquier otro fallo (incluido el asiento
      // en el libro) → 500. Un fallo de infraestructura no es un dato mal enviado.
      if (err instanceof Error && err.name === "ZodError") {
        return res.status(400).json({ error: "validation_error", message: "Invalid expense data" });
      }
      req.log.error({ err }, "Failed to create campaign expense");
      return res.status(500).json({ error: "server_error", message: "No se pudo registrar el gasto." });
    }
  },
);

router.put(
  "/campaigns/:id/expenses/:expenseId",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const expenseId = Number(req.params.expenseId);
      const data = insertCampaignExpenseSchema.parse({ ...req.body, campaignId });

      const [existing] = await db
        .select()
        .from(campaignExpensesTable)
        .where(
          and(
            eq(campaignExpensesTable.id, expenseId),
            eq(campaignExpensesTable.campaignId, campaignId),
          ),
        );
      if (!existing) return res.status(404).json({ error: "not_found", message: "Expense not found" });

      // V10.1: un gasto CONTABILIZADO no se puede editar en lo que el asiento
      // firmó (importe, fecha y categoría van en el hash de la cadena). Cambiarlos
      // dejaría el libro descuadrado sin dejar rastro. Para corregirlo hay que
      // anular y volver a registrar.
      const [entry] = await db
        .select({ id: campaignMovementsTable.id })
        .from(campaignMovementsTable)
        .where(
          and(
            eq(campaignMovementsTable.sourceType, "expense"),
            eq(campaignMovementsTable.sourceId, expenseId),
          ),
        );
      if (
        entry &&
        (Number(data.amount) !== toSafeAmount(existing.amount) ||
          data.date !== existing.date ||
          data.category !== existing.category)
      ) {
        return res.status(409).json({
          error: "conflict",
          code: "expense_counted",
          movementId: entry.id,
          message: `Este gasto está contabilizado (asiento #${entry.id}): su importe, fecha y categoría no se pueden cambiar sin descuadrar el libro. Anúlalo y registra el correcto.`,
        });
      }

      const [expense] = await db
        .update(campaignExpensesTable)
        .set(data)
        .where(and(eq(campaignExpensesTable.id, expenseId), eq(campaignExpensesTable.campaignId, campaignId)))
        .returning();
      if (!expense) return res.status(404).json({ error: "not_found", message: "Expense not found" });
      return res.json(formatExpense(expense));
    } catch (err) {
      // API-06: validación (Zod) → 400; cualquier otro fallo → 500.
      if (err instanceof Error && err.name === "ZodError") {
        return res.status(400).json({ error: "validation_error", message: "Invalid expense data" });
      }
      req.log.error({ err }, "Failed to update campaign expense");
      return res.status(500).json({ error: "server_error", message: "No se pudo actualizar el gasto." });
    }
  },
);

// ─── DELETE: eliminar un gasto ───────────────────────────────────────────────
// V10.1: antes era un borrado ciego disponible para cualquier administrador y sin
// comprobar el libro. Ahora se DIAGNOSTICA el gasto (misma lógica pura que el
// gestor de mantenimiento) y solo se permite destruir lo que es ficticio:
//
//   · ficticio SIN asiento        → 204 (eliminación definitiva).
//   · ficticio CON asiento        → 409: la retirada del asiento exige respaldo y
//     verificación de la cadena → se hace desde Mantenimiento → Gastos DEMO.
//   · real sin asiento            → 409: se corrige (le falta el asiento), no se borra.
//   · real contabilizado          → 409: se anula con asiento compensatorio.
//   · campaña protegida (ChocoFest)→ 409: se conserva.
router.delete(
  "/campaigns/:id/expenses/:expenseId",
  requireAdmin,
  requireRole(ROLES.SUPERADMIN),
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const expenseId = Number(req.params.expenseId);

      const [expense] = await db
        .select()
        .from(campaignExpensesTable)
        .where(
          and(
            eq(campaignExpensesTable.id, expenseId),
            eq(campaignExpensesTable.campaignId, campaignId),
          ),
        );
      if (!expense) {
        return res.status(404).json({ error: "not_found", message: "El gasto no existe" });
      }

      const [[campaign], movements, protectedCampaignIds] = await Promise.all([
        db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId)),
        db
          .select()
          .from(campaignMovementsTable)
          .where(eq(campaignMovementsTable.campaignId, campaignId)),
        readProtectedCampaignIds(),
      ]);

      const diagnosis = diagnoseExpense({
        expense,
        campaign: campaign
          ? { id: campaign.id, title: campaign.title, status: campaign.status, isDemo: campaign.isDemo === true }
          : null,
        // Misma regla que el inventario: declarada DEMO o documento propio.
        classification:
          campaign?.isDemo === true ? "demo" : isOwnDocument(expense.receiptUrl) ? "real" : "pending",
        protectedCampaignIds,
        campaignMovements: movements,
      });

      if (!diagnosis.deletable) {
        return res.status(409).json({
          error: "conflict",
          code: diagnosis.action === "purge_with_ledger" ? "requires_controlled_purge" : "not_deletable",
          action: diagnosis.action,
          actionLabel: diagnosis.actionLabel,
          blockers: diagnosis.blockers,
          message: `${diagnosis.actionLabel}: ${diagnosis.reasons.join(" ")}`,
          hint:
            diagnosis.action === "purge_with_ledger"
              ? "Usa Mantenimiento → Gastos DEMO: hace respaldo verificable y comprueba la cadena."
              : "No se destruye: corrige o anula el gasto según su estado contable.",
        });
      }

      await db
        .delete(campaignExpensesTable)
        .where(
          and(
            eq(campaignExpensesTable.id, expenseId),
            eq(campaignExpensesTable.campaignId, campaignId),
          ),
        );

      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.expenseDemoPurged,
        resource: AUDIT_RESOURCES.campaigns,
        resourceId: String(expenseId),
        details: {
          campaignId,
          amount: expense.amount,
          description: expense.description,
          action: diagnosis.action,
          reason: typeof req.body?.reason === "string" ? req.body.reason.trim() : null,
        },
      });

      return res.status(204).send();
    } catch (err) {
      req.log.error({ err }, "Failed to delete campaign expense");
      return res.status(500).json({ error: "server_error", message: "Failed to delete expense" });
    }
  },
);

export function formatExpense(e: typeof campaignExpensesTable.$inferSelect) {
  return {
    id: e.id,
    campaignId: e.campaignId,
    description: e.description,
    category: e.category,
    amount: e.amount,
    date: e.date,
    responsible: e.responsible,
    observations: e.observations,
    receiptUrl: e.receiptUrl,
    receiptType: e.receiptType,
    isPublic: e.isPublic,
    createdAt: toIsoSafe(e.createdAt),
  };
}

export default router;
