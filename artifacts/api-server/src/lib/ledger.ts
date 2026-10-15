import { createHash } from "node:crypto";
import { db, campaignMovementsTable, campaignsTable } from "@workspace/db";
import { asc, desc, eq } from "drizzle-orm";

/**
 * Ledger hash-chained de movimientos (patrón Trust Pay).
 *
 * - `computeMovementHash` / `verifyChain` son FUNCIONES PURAS: la cadena se
 *   puede verificar sin tocar la DB (usadas también por los tests).
 * - `appendMovement` inserta una entrada encadenada de forma transaccional
 *   (lock del registro de campaña para serializar appendes concurrentes).
 *
 * Los montos se hashean con `toFixed(2)`: la columna es `real` (float4) y
 * Postgres puede devolver 100.1 como 100.099998…; al hashear la representación
 * canónica de 2 decimales, insert y verificación producen el mismo hash.
 * (Supone montos realistas con ≤2 decimales; para montos que excedan la
 * precisión float4 habría que migrar la columna a numeric.)
 */

/** Hash previo del primer bloque de la cadena. */
export const GENESIS_PREV = "genesis";

/**
 * Origen del ASIENTO COMPENSATORIO de una anulación contable (migración 027).
 *
 * No puede reutilizar `donation`: la base tiene un índice único por
 * (`source_type`, `source_id`) precisamente para que un origen genere UN solo
 * asiento. Con un origen propio, el reverso se enlaza a la MISMA donación (el
 * informe de integridad lo resuelve contra la tabla de donaciones) sin duplicar
 * el asiento del ingreso.
 */
export const DONATION_REVERSAL_SOURCE = "donation_reversal" as const;

export interface LedgerEntryInput {
  kind: "ingreso" | "gasto";
  amount: number;
  description: string;
  sourceType: "donation" | "expense" | typeof DONATION_REVERSAL_SOURCE;
  sourceId: number;
  createdAt: Date;
}

// Payload amplio: las filas leídas de la DB traen kind/sourceType como string.
export type LedgerPayload = Omit<LedgerEntryInput, "kind" | "sourceType"> & {
  kind: string;
  sourceType: string;
};

export interface LedgerRow extends LedgerPayload {
  id: number;
  prevHash: string;
  hash: string;
}

export function computeMovementHash(prevHash: string, e: LedgerPayload): string {
  const payload = [
    prevHash,
    e.kind,
    e.amount.toFixed(2),
    e.description,
    e.sourceType,
    e.sourceId,
    e.createdAt.toISOString(),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export interface VerifyResult {
  verified: boolean;
  brokenAt: number | null;
  rootHash: string | null;
  count: number;
}

/** Verifica la integridad de la cadena (ordenada por id). */
export function verifyChain(rows: LedgerRow[]): VerifyResult {
  if (rows.length === 0) return { verified: true, brokenAt: null, rootHash: null, count: 0 };
  let prev = GENESIS_PREV;
  for (const row of rows) {
    if (row.prevHash !== prev) {
      return { verified: false, brokenAt: row.id, rootHash: null, count: rows.length };
    }
    const expected = computeMovementHash(prev, row);
    if (row.hash !== expected) {
      return { verified: false, brokenAt: row.id, rootHash: null, count: rows.length };
    }
    prev = row.hash;
  }
  return { verified: true, brokenAt: null, rootHash: prev, count: rows.length };
}

/** Resultado agregado de verificar todas las cadenas de la base. */
export interface CampaignChainsResult extends VerifyResult {
  /** Número de cadenas (campañas con movimientos) verificadas. */
  campaigns: number;
}

/**
 * Verifica la cadena POR CAMPAÑA y agrega el resultado.
 *
 * La cadena de hashes es INDEPENDIENTE por campaña: `appendMovement` enlaza cada
 * asiento con el último de la MISMA campaña y `verifyLedger(campaignId)` verifica
 * una sola. Verificar todas las filas como si fueran una única cadena global da
 * un falso «cadena rota» en cuanto hay movimientos de dos campañas, así que el
 * informe de integridad debe agrupar por campaña antes de verificar.
 *
 * `rootHash` solo tiene sentido con UNA cadena: con varias es ambiguo y se
 * devuelve `null` (la UI muestra el número de cadenas verificadas).
 */
export function verifyCampaignChains(
  rows: readonly (LedgerRow & { campaignId: number })[],
): CampaignChainsResult {
  const groups = new Map<number, LedgerRow[]>();
  for (const row of rows) {
    const list = groups.get(row.campaignId);
    if (list) list.push(row);
    else groups.set(row.campaignId, [row]);
  }

  let verified = true;
  let brokenAt: number | null = null;
  const roots: string[] = [];
  for (const list of groups.values()) {
    const result = verifyChain(list);
    if (!result.verified) {
      verified = false;
      if (brokenAt === null) brokenAt = result.brokenAt;
    } else if (result.rootHash) {
      roots.push(result.rootHash);
    }
  }

  return {
    verified,
    brokenAt,
    rootHash: groups.size === 1 ? roots[0] ?? null : null,
    count: rows.length,
    campaigns: groups.size,
  };
}

// Cliente compatible con db y con el cliente transaccional de drizzle.
interface LedgerClient {
  select: typeof db.select;
  insert: typeof db.insert;
}

/** Inserta una entrada encadenada. Se pasa `tx` (transacción) o `db`. */
export async function appendMovement(
  client: LedgerClient,
  campaignId: number,
  entry: LedgerEntryInput,
): Promise<void> {
  // Lock del registro de campaña: serializa los appends de esa campaña para
  // que dos escrituras concurrentes no hereden el mismo prev_hash.
  await client
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId))
    .for("update");

  const [last] = await client
    .select({ hash: campaignMovementsTable.hash })
    .from(campaignMovementsTable)
    .where(eq(campaignMovementsTable.campaignId, campaignId))
    .orderBy(desc(campaignMovementsTable.id))
    .limit(1)
    .for("update");
  const prevHash = last?.hash ?? GENESIS_PREV;
  const hash = computeMovementHash(prevHash, entry);
  await client.insert(campaignMovementsTable).values({
    campaignId,
    kind: entry.kind,
    amount: entry.amount,
    description: entry.description,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    prevHash,
    hash,
    createdAt: entry.createdAt,
  });
}

/** Verifica la cadena completa de una campaña contra la DB. */
export async function verifyLedger(campaignId: number): Promise<VerifyResult> {
  const rows = await db
    .select()
    .from(campaignMovementsTable)
    .where(eq(campaignMovementsTable.campaignId, campaignId))
    .orderBy(asc(campaignMovementsTable.id));
  return verifyChain(rows);
}
