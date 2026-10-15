import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import { db, campaignsTable, campaignExpensesTable, campaignMovementsTable, campaignPurgeBackupsTable } from "@workspace/db";
import { asc, inArray, sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { adminActionLimiter, reauthLimiter } from "../middleware/rate-limit";
import { logAuditAction } from "../middleware/auth-utils";
import { AUDIT_ACTIONS, AUDIT_RESOURCES, auditContext } from "../lib/audit";
import { verifySuperadminReauth } from "../lib/admin-reauth";
import { canonicalJson, normalizeForHash } from "../lib/campaign-demo-purge";
import { classifyDemoData, type DemoClassification, type DemoWorld } from "../lib/demo-classification";
import { CONFIRMED_DONATION_STATUSES } from "../lib/donor-identity";
import { roundMoney } from "../lib/funding";
import { verifyChain, type LedgerRow } from "../lib/ledger";
import { readProtectedCampaignIds } from "../lib/protected-campaigns";
import { toSafeAmount } from "../lib/amount-format";
import {
  MANUAL_CLASSIFICATION_LABEL,
  readAllManualClassifications,
  upsertManualClassification,
  validateClassificationRequest,
} from "../lib/expense-manual-classification";
import {
  compareFinancialSnapshots,
  diagnoseExpense,
  planExpensePurge,
  summarizeExpenses,
  type ExpenseDiagnosis,
  type ExpenseMovementRow,
  type FinancialSnapshot,
} from "../lib/expense-cleanup";

/**
 * Mantenimiento → GASTOS DEMO (V10.1).
 *
 * Es la herramienta que faltaba: ver los gastos que siguen en la base, consultar
 * las dependencias de cada uno, seleccionar los ficticios y ELIMINARLOS de verdad
 * (transacción + respaldo + auditoría), comprobando antes y después las cifras.
 *
 * Solo el superadmin. Nada se elimina sin `confirm`, `reason` (10+ caracteres) y
 * reautenticación. La clasificación y el veredicto los produce
 * `lib/expense-cleanup.ts` (puro): aquí solo se leen filas y se ejecuta.
 */
const router: IRouter = Router();

const superadminOnly = [requireAdmin, requireRole(ROLES.SUPERADMIN)];
const MIN_REASON = 10;

/** Instantánea de los gastos con su campaña, sus asientos y su clasificación. */
async function loadExpenseDiagnoses(): Promise<{
  diagnoses: ExpenseDiagnosis[];
  movementsByCampaign: Map<number, ExpenseMovementRow[]>;
  campaignById: Map<number, { id: number; title: string; status: string; isDemo: boolean }>;
}> {
  const protectedCampaignIds = await readProtectedCampaignIds();

  const [campaignRows, expenseRows, movementRows, manualClassifications] = await Promise.all([
    db
      .select({
        id: campaignsTable.id,
        title: campaignsTable.title,
        status: campaignsTable.status,
        isDemo: campaignsTable.isDemo,
      })
      .from(campaignsTable),
    db.select().from(campaignExpensesTable).orderBy(asc(campaignExpensesTable.id)),
    db.select().from(campaignMovementsTable).orderBy(asc(campaignMovementsTable.id)),
    // La declaración manual manda sobre la deducción automática (migración 029).
    readAllManualClassifications(),
  ]);

  const campaignById = new Map(
    campaignRows.map((row) => [
      row.id,
      { id: row.id, title: row.title, status: row.status, isDemo: row.isDemo === true },
    ]),
  );

  // Clasificación: MISMA fuente de verdad que el inventario (no se duplica la
  // regla). Se construye un mundo parcial con lo que la clasificación necesita.
  const partialWorld: DemoWorld = {
    campaigns: campaignRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      isDemo: row.isDemo === true,
      raised: null,
    })),
    donations: [],
    expenses: expenseRows.map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      description: row.description,
      amount: toSafeAmount(row.amount),
      date: row.date,
      receiptUrl: row.receiptUrl,
    })),
    movements: [],
    donors: [],
    pets: [],
    adoptionRequests: [],
    allies: [],
    news: [],
    reports: [],
    certificates: [],
    volunteers: [],
    evidence: [],
    images: [],
    protectedCampaignIds,
  };
  const inventory = classifyDemoData(partialWorld);
  const classificationByExpense = new Map<number, DemoClassification>(
    inventory.records
      .filter((record) => record.table === "campaign_expenses")
      .map((record) => [record.id, record.classification]),
  );

  const movementsByCampaign = new Map<number, ExpenseMovementRow[]>();
  for (const row of movementRows) {
    const movement: ExpenseMovementRow = {
      id: row.id,
      campaignId: row.campaignId,
      kind: row.kind,
      amount: toSafeAmount(row.amount),
      description: row.description,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      createdAt: row.createdAt,
      prevHash: row.prevHash,
      hash: row.hash,
    };
    const list = movementsByCampaign.get(row.campaignId) ?? [];
    list.push(movement);
    movementsByCampaign.set(row.campaignId, list);
  }

  const diagnoses = expenseRows.map((row) =>
    diagnoseExpense({
      expense: {
        id: row.id,
        campaignId: row.campaignId,
        description: row.description,
        amount: toSafeAmount(row.amount),
        date: row.date,
        category: row.category,
        responsible: row.responsible,
        observations: row.observations,
        receiptUrl: row.receiptUrl,
        receiptType: row.receiptType,
        isPublic: row.isPublic,
        createdAt: row.createdAt,
      },
      campaign: campaignById.get(row.campaignId) ?? null,
      classification: classificationByExpense.get(row.id) ?? "pending",
      protectedCampaignIds,
      campaignMovements: movementsByCampaign.get(row.campaignId) ?? [],
      manualClassification: manualClassifications.get(row.id) ?? null,
    }),
  );

  return { diagnoses, movementsByCampaign, campaignById };
}

/** Comprobación financiera completa (Fase 7): cifras, asientos y cadenas. */
async function financialSnapshot(): Promise<FinancialSnapshot> {
  const [expenseResult, donationResult, movementRows] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(e.amount), 0)::float8 AS total
      FROM campaign_expenses e
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(d.amount), 0)::float8 AS total
      FROM donations d
      WHERE d.status IN ('approved','reconciled')
    `),
    db.select().from(campaignMovementsTable).orderBy(asc(campaignMovementsTable.id)),
  ]);

  const [pendingResult, orphanResult] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM donations d
      WHERE d.status IN ('approved','reconciled')
        AND NOT EXISTS (
          SELECT 1 FROM campaign_movements m
          WHERE m.source_type = 'donation' AND m.source_id = d.id
        )
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM campaign_movements m
      WHERE (m.source_type = 'donation' AND NOT EXISTS (SELECT 1 FROM donations d WHERE d.id = m.source_id))
         OR (m.source_type = 'expense' AND NOT EXISTS (SELECT 1 FROM campaign_expenses e WHERE e.id = m.source_id))
    `),
  ]);

  const expenseAgg = expenseResult.rows[0];
  const donationAgg = donationResult.rows[0];
  const pendingWithoutEntry = pendingResult.rows[0];
  const orphanMovements = orphanResult.rows[0];

  const byCampaign = new Map<number, LedgerRow[]>();
  for (const row of movementRows) {
    const list = byCampaign.get(row.campaignId) ?? [];
    list.push({
      id: row.id,
      kind: row.kind,
      amount: toSafeAmount(row.amount),
      description: row.description,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      createdAt: row.createdAt,
      prevHash: row.prevHash,
      hash: row.hash,
    });
    byCampaign.set(row.campaignId, list);
  }
  const brokenChains: number[] = [];
  for (const [campaignId, rows] of byCampaign) {
    if (!verifyChain(rows).verified) brokenChains.push(campaignId);
  }

  const expensesTotal = roundMoney(expenseAgg?.total ?? 0);
  const donationsTotal = roundMoney(donationAgg?.total ?? 0);
  return {
    generatedAt: new Date().toISOString(),
    expensesCount: Number(expenseAgg?.count ?? 0),
    expensesTotal,
    donationsCount: Number(donationAgg?.count ?? 0),
    donationsTotal,
    balance: roundMoney(donationsTotal - expensesTotal),
    movementsCount: movementRows.length,
    discrepancies:
      Number(pendingWithoutEntry?.count ?? 0) + Number(orphanMovements?.count ?? 0),
    chainsVerified: brokenChains.length === 0,
    brokenChains,
  };
}

/** GET /admin/maintenance/expenses — la tabla completa con su veredicto. */
router.get("/admin/maintenance/expenses", ...superadminOnly, adminActionLimiter, async (req, res) => {
  try {
    const { diagnoses } = await loadExpenseDiagnoses();
    const campaignFilter = Number(req.query.campaignId);
    const onlyDeletable = req.query.onlyDeletable === "true";
    const filtered = diagnoses.filter((diagnosis) => {
      if (Number.isInteger(campaignFilter) && campaignFilter > 0 && diagnosis.campaignId !== campaignFilter) {
        return false;
      }
      if (onlyDeletable && !diagnosis.deletable) return false;
      return true;
    });
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({
      generatedAt: new Date().toISOString(),
      expenses: filtered,
      summary: summarizeExpenses(diagnoses),
      filters: { campaignId: Number.isInteger(campaignFilter) ? campaignFilter : null, onlyDeletable },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load expense diagnostics");
    return res.status(500).json({ error: "server_error", message: "No se pudieron leer los gastos" });
  }
});

/** GET /admin/maintenance/expenses/:id — diagnóstico individual (Fase 2). */
router.get("/admin/maintenance/expenses/:id", ...superadminOnly, adminActionLimiter, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
  }
  try {
    const { diagnoses } = await loadExpenseDiagnoses();
    const diagnosis = diagnoses.find((item) => item.id === id);
    if (!diagnosis) {
      return res.status(404).json({ error: "not_found", message: "El gasto no existe" });
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.json(diagnosis);
  } catch (err) {
    req.log.error({ err }, "Failed to load expense diagnosis");
    return res.status(500).json({ error: "server_error", message: "No se pudo diagnosticar el gasto" });
  }
});

/** GET /admin/maintenance/financial-check — comprobación financiera actual. */
router.get("/admin/maintenance/financial-check", ...superadminOnly, adminActionLimiter, async (req, res) => {
  try {
    res.setHeader("Cache-Control", "private, no-store");
    return res.json(await financialSnapshot());
  } catch (err) {
    req.log.error({ err }, "Failed to build financial snapshot");
    return res.status(500).json({ error: "server_error", message: "No se pudo comprobar las cifras" });
  }
});

/**
 * POST /admin/maintenance/expenses/classify — declaración manual (Fase 1).
 *
 * El superadmin declara qué es cada gasto. Es lo que desbloquea los HUÉRFANOS: sin
 * campaña no hay declaración DEMO posible, así que hasta ahora quedaban en «revisión
 * manual» para siempre. La declaración se guarda en PostgreSQL (sobrevive a
 * reinicios y al borrado del gasto) con motivo, evidencia, responsable y fecha, y
 * queda auditada.
 *
 * NO habilita nada por sí sola: `diagnoseExpense` vuelve a decidir después, y las
 * protecciones objetivas (campaña protegida, documento propio, cadena del libro)
 * siguen mandando.
 */
router.post(
  "/admin/maintenance/expenses/classify",
  ...superadminOnly,
  reauthLimiter,
  adminActionLimiter,
  async (req, res) => {
    const body = (req.body ?? {}) as {
      ids?: unknown;
      password?: unknown;
      totpCode?: unknown;
    };
    const ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.map((value) => Number(value)).filter((id) => Number.isInteger(id) && id > 0))]
      : [];
    if (ids.length === 0) {
      return res.status(400).json({ error: "validation_error", message: "Selecciona al menos un gasto." });
    }
    const parsed = validateClassificationRequest(body);
    if (!parsed.ok) {
      return res.status(400).json({ error: "validation_error", code: parsed.code, message: parsed.message });
    }

    try {
      const before = await loadExpenseDiagnoses();
      const missing = ids.filter((id) => !before.diagnoses.some((diagnosis) => diagnosis.id === id));
      if (missing.length > 0) {
        return res.status(404).json({
          error: "not_found",
          message: `Gastos inexistentes: ${missing.join(", ")}.`,
        });
      }

      const sessionUser = req.session?.adminUser ?? null;
      const reauth = await verifySuperadminReauth({
        userId: sessionUser?.id ?? null,
        username: sessionUser?.username ?? null,
        password: typeof body.password === "string" ? body.password : "",
        totpCode: typeof body.totpCode === "string" ? body.totpCode : null,
      });
      if (!reauth.ok) {
        await logAuditAction({
          ...auditContext(req),
          action: AUDIT_ACTIONS.adminReauthFailed,
          resource: AUDIT_RESOURCES.campaigns,
          details: { operation: "expense_classify", code: reauth.code, expenseIds: ids },
        });
        return res.status(401).json({ error: "unauthorized", code: reauth.code, message: reauth.message });
      }

      for (const id of ids) {
        await upsertManualClassification({
          expenseId: id,
          classification: parsed.value.classification,
          reason: parsed.value.reason,
          evidence: parsed.value.evidence,
          classifiedBy: sessionUser?.username ?? null,
          classifiedById: sessionUser ? String(sessionUser.id) : null,
        });
      }

      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.expenseClassified,
        resource: AUDIT_RESOURCES.campaigns,
        details: {
          classification: parsed.value.classification,
          classificationLabel: MANUAL_CLASSIFICATION_LABEL[parsed.value.classification],
          reason: parsed.value.reason,
          evidence: parsed.value.evidence,
          expenseIds: ids,
        },
      });

      // Se devuelve el diagnóstico ACTUALIZADO para que la interfaz refresque las
      // acciones disponibles sin adivinar.
      const after = await loadExpenseDiagnoses();
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({
        ok: true,
        classified: ids.length,
        classification: parsed.value.classification,
        classificationLabel: MANUAL_CLASSIFICATION_LABEL[parsed.value.classification],
        expenses: after.diagnoses.filter((diagnosis) => ids.includes(diagnosis.id)),
        summary: summarizeExpenses(after.diagnoses),
      });
    } catch (err) {
      req.log.error({ err }, "Failed to classify expenses");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudieron clasificar los gastos" });
    }
  },
);

/**
 * POST /admin/maintenance/expenses/purge — vista previa y eliminación real.
 *
 * Con `preview: true` devuelve exactamente qué se borraría (y qué no, con su
 * motivo). Con `preview: false` exige `confirm`, `reason` y reautenticación, y
 * elimina en UNA transacción: primero el respaldo verificable, luego los asientos
 * de prueba (si los hay) y por último los gastos.
 */
router.post(
  "/admin/maintenance/expenses/purge",
  ...superadminOnly,
  reauthLimiter,
  adminActionLimiter,
  async (req, res) => {
    const body = (req.body ?? {}) as {
      ids?: unknown;
      preview?: unknown;
      confirm?: unknown;
      reason?: unknown;
      password?: unknown;
      totpCode?: unknown;
    };
    const ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.map((value) => Number(value)).filter((id) => Number.isInteger(id) && id > 0))]
      : [];
    if (ids.length === 0) {
      return res.status(400).json({ error: "validation_error", message: "Selecciona al menos un gasto." });
    }

    try {
      const { diagnoses, campaignById } = await loadExpenseDiagnoses();
      const selected = diagnoses.filter((diagnosis) => ids.includes(diagnosis.id));
      const missing = ids.filter((id) => !diagnoses.some((diagnosis) => diagnosis.id === id));
      if (missing.length > 0) {
        return res.status(404).json({
          error: "not_found",
          message: `Gastos inexistentes: ${missing.join(", ")}.`,
        });
      }

      const plan = planExpensePurge(selected);

      // ─── Vista previa ───────────────────────────────────────────────────────
      if (body.preview === true) {
        res.setHeader("Cache-Control", "private, no-store");
        return res.json({
          preview: true,
          selected: selected.length,
          plan,
          summary: summarizeExpenses(selected),
          before: await financialSnapshot(),
        });
      }

      // ─── Validación de la ejecución ─────────────────────────────────────────
      if (body.confirm !== true) {
        return res.status(400).json({
          error: "validation_error",
          code: "confirmation_required",
          message: "Eliminar gastos exige confirmación explícita (confirm: true).",
        });
      }
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (reason.length < MIN_REASON) {
        return res.status(400).json({
          error: "validation_error",
          code: "reason_required",
          message: `Indica el motivo (mínimo ${MIN_REASON} caracteres): queda en la auditoría.`,
        });
      }
      if (plan.blocked.length > 0) {
        return res.status(409).json({
          error: "conflict",
          code: "expenses_not_deletable",
          message: `Hay ${plan.blocked.length} gasto(s) que NO se pueden eliminar. Quítalos de la selección o resuélvelos antes.`,
          blocked: plan.blocked.map((diagnosis) => ({
            id: diagnosis.id,
            campaignTitle: diagnosis.campaignTitle,
            action: diagnosis.action,
            actionLabel: diagnosis.actionLabel,
            blockers: diagnosis.blockers,
            reasons: diagnosis.reasons,
          })),
        });
      }

      const sessionUser = req.session?.adminUser ?? null;
      const reauth = await verifySuperadminReauth({
        userId: sessionUser?.id ?? null,
        username: sessionUser?.username ?? null,
        password: typeof body.password === "string" ? body.password : "",
        totpCode: typeof body.totpCode === "string" ? body.totpCode : null,
      });
      if (!reauth.ok) {
        await logAuditAction({
          ...auditContext(req),
          action: AUDIT_ACTIONS.adminReauthFailed,
          resource: AUDIT_RESOURCES.campaigns,
          details: { operation: "expense_purge", code: reauth.code, expenseIds: ids },
        });
        return res.status(401).json({ error: "unauthorized", code: reauth.code, message: reauth.message });
      }

      const before = await financialSnapshot();
      const performedBy = sessionUser?.username ?? null;
      const performedById = sessionUser ? String(sessionUser.id) : null;

      // ─── Transacción: respaldo + borrado ────────────────────────────────────
      const result = await db.transaction(async (tx) => {
        const expenseIds = plan.deletable.map((diagnosis) => diagnosis.id);
        const movementIds = plan.movementIdsToDelete;
        const backupIds: number[] = [];

        // 0. REVALIDACIÓN DENTRO DE LA TRANSACCIÓN. Entre la vista previa y este
        //    momento pudo cambiar algo (un asiento nuevo, una protección, un
        //    borrado ajeno): si es así no se escribe NADA y se avisa. Se lee con
        //    `tx`, así que la comprobación y el borrado son la misma foto.
        const currentExpenses = await tx
          .select({ id: campaignExpensesTable.id })
          .from(campaignExpensesTable)
          .where(inArray(campaignExpensesTable.id, expenseIds));
        if (currentExpenses.length !== expenseIds.length) {
          return { stale: "Alguno de los gastos seleccionados ya no existe. Recarga la tabla." };
        }

        const currentMovements = await tx
          .select({
            id: campaignMovementsTable.id,
            sourceType: campaignMovementsTable.sourceType,
          })
          .from(campaignMovementsTable)
          .where(inArray(campaignMovementsTable.sourceId, expenseIds));
        const currentMovementIds = currentMovements
          .filter((row) => row.sourceType === "expense")
          .map((row) => row.id)
          .sort((a, b) => a - b);
        const plannedMovementIds = [...movementIds].sort((a, b) => a - b);
        if (currentMovementIds.join(",") !== plannedMovementIds.join(",")) {
          return {
            stale:
              "Los asientos del libro cambiaron desde la vista previa. Recarga la tabla y vuelve a intentarlo.",
          };
        }

        const protectedNow = await readProtectedCampaignIds();
        const stillProtected = plan.totals.byCampaign
          .map((group) => group.campaignId)
          .filter((campaignId) => protectedNow.includes(campaignId));
        if (stillProtected.length > 0) {
          return {
            stale: `Hay campañas PROTEGIDAS en la selección (${stillProtected.join(", ")}): no se toca nada.`,
          };
        }

        // 1. Respaldo verificable POR CAMPAÑA, antes de borrar nada.
        for (const group of plan.totals.byCampaign) {
          const groupDiagnoses = plan.deletable.filter(
            (diagnosis) => diagnosis.campaignId === group.campaignId,
          );
          const groupExpenseIds = groupDiagnoses.map((diagnosis) => diagnosis.id);
          const groupMovementIds = groupDiagnoses.flatMap((diagnosis) =>
            diagnosis.ledgerMovements.map((movement) => movement.id),
          );

          const expenseRows = await tx
            .select()
            .from(campaignExpensesTable)
            .where(inArray(campaignExpensesTable.id, groupExpenseIds));
          const movementRows =
            groupMovementIds.length > 0
              ? await tx
                  .select()
                  .from(campaignMovementsTable)
                  .where(inArray(campaignMovementsTable.id, groupMovementIds))
              : [];
          const campaign = campaignById.get(group.campaignId) ?? null;

          const snapshot = {
            kind: "expense_purge",
            campaignId: group.campaignId,
            campaignTitle: campaign?.title ?? group.campaignTitle,
            reason,
            performedBy,
            purgedAt: new Date().toISOString(),
            expenses: expenseRows,
            movements: movementRows,
          };
          const manifestHash = createHash("sha256")
            .update(canonicalJson(normalizeForHash(snapshot)))
            .digest("hex");

          await tx.insert(campaignPurgeBackupsTable).values({
            campaignId: group.campaignId,
            campaignTitle: campaign?.title ?? group.campaignTitle,
            campaignStatus: campaign?.status ?? "unknown",
            manifestHash,
            snapshot,
            reason,
            performedBy,
            performedById,
          }).returning({ id: campaignPurgeBackupsTable.id }).then((rows) => {
            for (const row of rows) backupIds.push(row.id);
          });
        }

        // 2. Borrado: los asientos PRIMERO (por las claves ajenas) y luego los
        //    gastos. Nunca al revés.
        if (movementIds.length > 0) {
          await tx
            .delete(campaignMovementsTable)
            .where(inArray(campaignMovementsTable.id, movementIds));
        }
        await tx
          .delete(campaignExpensesTable)
          .where(inArray(campaignExpensesTable.id, expenseIds));

        return { deletedExpenses: expenseIds.length, deletedMovements: movementIds.length, backupIds };
      });

      const after = await financialSnapshot();

      if ("stale" in result) {
        return res.status(409).json({
          error: "conflict",
          code: "purge_stale",
          message: result.stale,
        });
      }

      const comparison = compareFinancialSnapshots(before, after, {
        expensesCount: result.deletedExpenses,
        expensesTotal: plan.totals.amount,
        movementsCount: result.deletedMovements,
      });

      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.expenseDemoPurged,
        resource: AUDIT_RESOURCES.campaigns,
        details: {
          reason,
          expenseIds: plan.deletable.map((diagnosis) => diagnosis.id),
          movementIds: plan.movementIdsToDelete,
          amount: plan.totals.amount,
          byCampaign: plan.totals.byCampaign,
          comparison: { delta: comparison.delta, matchesPurged: comparison.matchesPurged },
        },
      });

      return res.json({
        ok: true,
        deleted: result,
        comparison,
        byCampaign: plan.totals.byCampaign,
        // Las cifras nuevas, para que la interfaz no tenga que adivinar.
        after,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to purge demo expenses");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudieron eliminar los gastos" });
    }
  },
);

/**
 * GET /admin/maintenance/orphans — Fase 5.
 *
 * Registros cuyo identificador de campaña ya no corresponde a ninguna campaña.
 * Con las claves ajenas actuales no debería haber ninguno, así que se informa del
 * recuento real (0 es un resultado, no un error) y se clasifica lo que aparezca:
 * NUNCA se borra por el hecho de estar huérfano.
 */
router.get("/admin/maintenance/orphans", ...superadminOnly, adminActionLimiter, async (req, res) => {
  try {
    const [expenseResult, donationResult] = await Promise.all([
      db.execute(sql`
        SELECT e.id, e.campaign_id AS "campaignId", e.description, e.amount::float8 AS amount, e.date
        FROM campaign_expenses e
        LEFT JOIN campaigns c ON c.id = e.campaign_id
        WHERE c.id IS NULL
        ORDER BY e.id
      `),
      db.execute(sql`
        SELECT d.id, d.campaign_id AS "campaignId", d.email, d.amount::float8 AS amount, d.status
        FROM donations d
        LEFT JOIN campaigns c ON c.id = d.campaign_id
        WHERE d.campaign_id IS NOT NULL AND c.id IS NULL
        ORDER BY d.id
      `),
    ]);

    res.setHeader("Cache-Control", "private, no-store");
    return res.json({
      generatedAt: new Date().toISOString(),
      expenses: expenseResult.rows,
      donations: donationResult.rows,
      // La clave ajena `campaign_expenses.campaign_id` es NOT NULL y no admite
      // borrado en cascada, así que un gasto huérfano solo puede aparecer si se
      // desactivan las restricciones: se deja explícito para que nadie las toque.
      note: "Ningún registro se elimina por estar huérfano: requiere clasificación DEMO confirmada y autorización expresa.",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load orphan records");
    return res.status(500).json({ error: "server_error", message: "No se pudo buscar huérfanos" });
  }
});

export default router;
