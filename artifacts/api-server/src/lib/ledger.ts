import { createHash } from "node:crypto";
import { db, campaignMovementsTable, campaignsTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";

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

export interface LedgerEntryInput {
  kind: "ingreso" | "gasto";
  amount: number;
  description: string;
  sourceType: "donation" | "expense";
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
    .orderBy(asc(campaignMovementsTable.id))
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
