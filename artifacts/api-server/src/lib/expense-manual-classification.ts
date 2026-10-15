import { db, expenseClassificationsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import type { ManualClassificationInput } from "./expense-cleanup";

/**
 * Clasificación MANUAL de gastos (V11) — persistencia y validación.
 *
 * El superadmin declara qué es un gasto (DEMO, real o pendiente) cuando la
 * deducción automática no basta —típicamente en gastos HUÉRFANOS, cuya campaña ya
 * no existe—. La declaración se guarda en `expense_classifications` y sobrevive al
 * borrado del gasto: es la prueba de por qué se destruyó.
 *
 * La validación es PURA y se prueba aparte; el acceso a la base está aislado aquí.
 */

export const MANUAL_CLASSIFICATIONS = ["demo", "real", "pending"] as const;
export type ManualClassification = (typeof MANUAL_CLASSIFICATIONS)[number];

export const MANUAL_CLASSIFICATION_LABEL: Record<ManualClassification, string> = {
  demo: "DEMO confirmado",
  real: "Real",
  pending: "Pendiente de revisión",
};

/** Motivo mínimo: una declaración sin motivo no vale para la auditoría. */
export const MIN_CLASSIFICATION_REASON = 10;
const MAX_EVIDENCE = 500;

export interface ClassificationRequest {
  classification: ManualClassification;
  reason: string;
  evidence: string | null;
}

export type ClassificationValidation =
  | { ok: true; value: ClassificationRequest }
  | { ok: false; code: string; message: string };

/** Valida la forma de la petición de clasificación. Puro. */
export function validateClassificationRequest(body: unknown): ClassificationValidation {
  const raw = (body ?? {}) as Record<string, unknown>;
  const classification = typeof raw.classification === "string" ? raw.classification.trim() : "";
  if (!MANUAL_CLASSIFICATIONS.includes(classification as ManualClassification)) {
    return {
      ok: false,
      code: "invalid_classification",
      message: `Clasificación no válida. Usa: ${MANUAL_CLASSIFICATIONS.join(", ")}.`,
    };
  }
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (reason.length < MIN_CLASSIFICATION_REASON) {
    return {
      ok: false,
      code: "reason_required",
      message: `Indica el motivo (mínimo ${MIN_CLASSIFICATION_REASON} caracteres): queda en la auditoría.`,
    };
  }
  const evidence = typeof raw.evidence === "string" ? raw.evidence.trim() : "";
  if (evidence.length > MAX_EVIDENCE) {
    return {
      ok: false,
      code: "evidence_too_long",
      message: `La evidencia no puede superar ${MAX_EVIDENCE} caracteres.`,
    };
  }
  return {
    ok: true,
    value: {
      classification: classification as ManualClassification,
      reason,
      evidence: evidence.length > 0 ? evidence : null,
    },
  };
}

/** Clasificaciones registradas para un conjunto de gastos (vacío = sin declarar). */
export async function readManualClassifications(
  expenseIds: readonly number[],
): Promise<Map<number, ManualClassificationInput>> {
  const result = new Map<number, ManualClassificationInput>();
  if (expenseIds.length === 0) return result;

  const rows = await db
    .select()
    .from(expenseClassificationsTable)
    .where(inArray(expenseClassificationsTable.expenseId, [...expenseIds]));

  for (const row of rows) {
    result.set(row.expenseId, {
      classification: row.classification as ManualClassification,
      reason: row.reason,
      evidence: row.evidence,
      classifiedBy: row.classifiedBy,
      classifiedAt: row.updatedAt,
    });
  }
  return result;
}

/** Todas las clasificaciones registradas (para el listado completo). */
export async function readAllManualClassifications(): Promise<
  Map<number, ManualClassificationInput>
> {
  const rows = await db.select().from(expenseClassificationsTable);
  const result = new Map<number, ManualClassificationInput>();
  for (const row of rows) {
    result.set(row.expenseId, {
      classification: row.classification as ManualClassification,
      reason: row.reason,
      evidence: row.evidence,
      classifiedBy: row.classifiedBy,
      classifiedAt: row.updatedAt,
    });
  }
  return result;
}

export interface UpsertClassificationInput extends ClassificationRequest {
  expenseId: number;
  classifiedBy: string | null;
  classifiedById: string | null;
}

/** Guarda (o reemplaza) la declaración de un gasto. Idempotente por gasto. */
export async function upsertManualClassification(input: UpsertClassificationInput): Promise<void> {
  await db
    .insert(expenseClassificationsTable)
    .values({
      expenseId: input.expenseId,
      classification: input.classification,
      reason: input.reason,
      evidence: input.evidence,
      classifiedBy: input.classifiedBy,
      classifiedById: input.classifiedById,
    })
    .onConflictDoUpdate({
      target: expenseClassificationsTable.expenseId,
      set: {
        classification: input.classification,
        reason: input.reason,
        evidence: input.evidence,
        classifiedBy: input.classifiedBy,
        classifiedById: input.classifiedById,
        updatedAt: new Date(),
      },
    });
}
