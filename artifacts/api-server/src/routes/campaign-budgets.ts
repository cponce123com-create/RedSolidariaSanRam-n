import { Router, type IRouter } from "express";
import { db, campaignBudgetsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { toIsoSafe } from "../lib/date-format";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { adminActionLimiter } from "../middleware/rate-limit";
import { hasPgErrorCode } from "../lib/pg-errors";

// Presupuesto por categoría de una campaña (Fase 2.5 del Prompt Maestro):
// previsión administrada por rubro frente a los gastos reales, que siguen
// viviendo en `campaign_expenses` (única fuente del dinero gastado).
//
// El monto NO es dinero recaudado: solo una previsión. El saldo y el avance se
// derivan en el frontend con la función pura `buildBudget`.
const adminOnly = [requireAdmin, requireRole(ROLES.ADMIN)];

const router: IRouter = Router();

const MAX_CATEGORY = 60;
const MAX_NOTES = 300;

interface BudgetPayload {
  category: string;
  plannedAmount: number;
  notes: string | null;
  isPublic: boolean;
}

type ParseResult =
  | { ok: true; data: BudgetPayload }
  | { ok: false; message: string };

function optionalText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * Valida el cuerpo de una partida con mensajes accionables: el panel muestra
 * este texto tal cual, así que no se devuelve un 400 genérico.
 */
function parseBudgetPayload(body: unknown): ParseResult {
  const raw = (body ?? {}) as Record<string, unknown>;

  const category = optionalText(raw.category, MAX_CATEGORY);
  if (!category) {
    return { ok: false, message: "La categoría del presupuesto es obligatoria." };
  }

  const amount =
    typeof raw.plannedAmount === "number" ? raw.plannedAmount : Number(raw.plannedAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    return {
      ok: false,
      message: "El monto presupuestado debe ser un número mayor o igual a 0.",
    };
  }

  return {
    ok: true,
    data: {
      category,
      plannedAmount: amount,
      notes: optionalText(raw.notes, MAX_NOTES),
      isPublic: raw.isPublic === undefined ? true : Boolean(raw.isPublic),
    },
  };
}

// Público: SOLO partidas publicadas. El filtro va en SQL para que las privadas
// NUNCA salgan por este endpoint anónimo.
router.get("/campaigns/:id/budgets", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const budgets = await db
      .select()
      .from(campaignBudgetsTable)
      .where(
        and(
          eq(campaignBudgetsTable.campaignId, campaignId),
          eq(campaignBudgetsTable.isPublic, true),
        ),
      )
      .orderBy(asc(campaignBudgetsTable.category));
    res.json(budgets.map(formatBudget));
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign budgets");
    res.status(500).json({ error: "server_error", message: "Failed to get budgets" });
  }
});

// Admin: TODAS las partidas (públicas y privadas) para gestión interna.
router.get(
  "/admin/campaigns/:id/budgets",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const budgets = await db
        .select()
        .from(campaignBudgetsTable)
        .where(eq(campaignBudgetsTable.campaignId, campaignId))
        .orderBy(asc(campaignBudgetsTable.category));
      res.json(budgets.map(formatBudget));
    } catch (err) {
      req.log.error({ err }, "Failed to get campaign budgets (admin)");
      res.status(500).json({ error: "server_error", message: "Failed to get budgets" });
    }
  },
);

router.post(
  "/campaigns/:id/budgets",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    const campaignId = Number(req.params.id);
    const parsed = parseBudgetPayload(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: "validation_error", message: parsed.message });
    }
    try {
      const [budget] = await db
        .insert(campaignBudgetsTable)
        .values({ ...parsed.data, campaignId })
        .returning();
      return res.status(201).json(formatBudget(budget));
    } catch (err) {
      // Índice único (campaign_id, lower(category)): no se duplican partidas.
      if (hasPgErrorCode(err, "23505")) {
        return res.status(409).json({
          error: "duplicate_category",
          message: `Ya existe una partida de presupuesto para «${parsed.data.category}» en esta campaña. Edítala en lugar de crear otra.`,
        });
      }
      req.log.error({ err }, "Failed to create campaign budget");
      return res.status(500).json({ error: "server_error", message: "No se pudo guardar la partida." });
    }
  },
);

router.put(
  "/campaigns/:id/budgets/:budgetId",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    const campaignId = Number(req.params.id);
    const budgetId = Number(req.params.budgetId);
    try {
      // PUT con MERGE: se parte de la fila guardada para que un cambio parcial
      // (p. ej. la visibilidad) no borre la categoría ni el monto.
      const [existing] = await db
        .select()
        .from(campaignBudgetsTable)
        .where(
          and(
            eq(campaignBudgetsTable.id, budgetId),
            eq(campaignBudgetsTable.campaignId, campaignId),
          ),
        );
      if (!existing) {
        return res.status(404).json({ error: "not_found", message: "Partida no encontrada" });
      }
      const parsed = parseBudgetPayload({ ...existing, ...(req.body ?? {}) });
      if (!parsed.ok) {
        return res.status(400).json({ error: "validation_error", message: parsed.message });
      }
      const [budget] = await db
        .update(campaignBudgetsTable)
        .set(parsed.data)
        .where(
          and(
            eq(campaignBudgetsTable.id, budgetId),
            eq(campaignBudgetsTable.campaignId, campaignId),
          ),
        )
        .returning();
      if (!budget) {
        return res.status(404).json({ error: "not_found", message: "Partida no encontrada" });
      }
      return res.json(formatBudget(budget));
    } catch (err) {
      if (hasPgErrorCode(err, "23505")) {
        return res.status(409).json({
          error: "duplicate_category",
          message: "Ya existe otra partida con esa categoría en esta campaña.",
        });
      }
      req.log.error({ err }, "Failed to update campaign budget");
      return res.status(500).json({ error: "server_error", message: "No se pudo actualizar la partida." });
    }
  },
);

router.delete(
  "/campaigns/:id/budgets/:budgetId",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const budgetId = Number(req.params.budgetId);
      await db
        .delete(campaignBudgetsTable)
        .where(
          and(
            eq(campaignBudgetsTable.id, budgetId),
            eq(campaignBudgetsTable.campaignId, campaignId),
          ),
        );
      res.status(204).send();
    } catch (err) {
      req.log.error({ err }, "Failed to delete campaign budget");
      res.status(500).json({ error: "server_error", message: "Failed to delete budget" });
    }
  },
);

export function formatBudget(b: typeof campaignBudgetsTable.$inferSelect) {
  return {
    id: b.id,
    campaignId: b.campaignId,
    category: b.category,
    plannedAmount: b.plannedAmount,
    notes: b.notes,
    isPublic: b.isPublic,
    createdAt: toIsoSafe(b.createdAt),
  };
}

export default router;
