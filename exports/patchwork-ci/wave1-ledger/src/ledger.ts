/**
 * Ledger de Confianza para Mutual Aid — wave 1 (funciones puras).
 *
 * Adaptación del patrón Trust Pay (Red Solidaria) al dominio de patchwork:
 * en vez de dinero, cada evento de un ciclo de ayuda (request → offer →
 * acceptance → fulfillment → proof → completion → feedback) se encadena con
 * SHA-256 a su predecesor. Cualquier edición/borrado en la DB rompe la cadena
 * y la verificación pública lo detecta.
 *
 * Contrato:
 * - `computeEventHash` / `verifyChain` / `canonicalStableStringify` son PURAS:
 *   testeables sin DB y reutilizables por services/api, indexer y
 *   moderation-worker.
 * - Hashear SIEMPRE la representación canónica del payload (orden de claves
 *   ordenado + números sin notación científica): el mismo evento producido
 *   por dos clientes distintos debe generar el mismo hash.
 * - Append-only: nunca UPDATE/DELETE; un error se revierte con una entrada
 *   compensatoria (p. ej. CANCELLED con referencia al evento erróneo).
 *
 * TODO wave 2: `appendEvent` transaccional (FOR UPDATE por chain_key) y
 * tabla `aid_events` (ver ledger-mutual-aid-design.md §2 y §4).
 */

import { createHash } from "node:crypto";

/** Hash previo del primer evento de cada cadena. */
export const GENESIS_PREV = "genesis";

export const AID_EVENT_TYPES = [
  "REQUEST_CREATED",
  "OFFER_MADE",
  "REQUEST_ACCEPTED",
  "FULFILLMENT_REPORTED",
  "PROOF_ATTACHED",
  "COMPLETED",
  "CANCELLED",
  "FEEDBACK",
  "MODERATED",
] as const;
export type AidEventType = (typeof AID_EVENT_TYPES)[number];

export interface AidEventPayload {
  [key: string]: unknown;
}

export interface AidEventInput {
  eventType: string; // AidEventType | string (las filas de la DB llegan como string)
  actorDid: string;
  resourceRef: string; // at-uri del recurso (request/offer/record)
  payload: AidEventPayload | null;
  createdAt: Date;
}

export interface AidEventRow extends AidEventInput {
  id: number;
  chainKey: string;
  prevHash: string;
  hash: string;
}

export interface VerifyResult {
  verified: boolean;
  brokenAt: number | null; // id de la primera entrada rota
  rootHash: string | null; // hash de la última entrada (anclable en AT)
  count: number;
}

// ─── Canonicalización ─────────────────────────────────────────────────────────

/**
 * Número a representación fija sin notación científica.
 * - enteros → String(n) (sin decimales)
 * - no enteros → hasta 10 decimales fijos, sin ceros finales
 * - -0 → "0"
 * Nota: montos/cantidades deben redondearse ANTES de hashear (p. ej. centavos
 * enteros o toFixed(2)), igual que en Trust Pay (la columna float4 introducía
 * ruido que se eliminaba hasheando la representación canónica de 2 decimales).
 */
export function formatLedgerNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error("Non-finite number in ledger payload");
  }
  if (Object.is(n, -0)) return "0";
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return String(n);
  return n.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Serialización canónica y estable de un valor JSON:
 * - claves de objetos ORDENADAS alfabéticamente (recursivo)
 * - números normalizados (sin notación científica, sin -0)
 * - undefined se trata como null (determinista; JSON.stringify lo omitiría
 *   en objetos, lo que rompería la estabilidad entre clientes)
 */
export function canonicalStableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      return formatLedgerNumber(value);
    case "boolean":
      return value ? "true" : "false";
    case "object":
      if (Array.isArray(value)) {
        return `[${value.map(canonicalStableStringify).join(",")}]`;
      }
      const obj = value as Record<string, unknown>;
      return `{${Object.keys(obj)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonicalStableStringify(obj[k])}`)
        .join(",")}}`;
    default:
      throw new Error(`Unsupported value in ledger payload: ${typeof value}`);
  }
}

// ─── Hash y verificación ──────────────────────────────────────────────────────

/** Hash SHA-256 del evento encadenado al prevHash dado. */
export function computeEventHash(prevHash: string, e: AidEventInput): string {
  const payload = [
    prevHash,
    e.eventType,
    e.actorDid,
    e.resourceRef,
    canonicalStableStringify(e.payload ?? null),
    e.createdAt.toISOString(),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Verifica la integridad de una cadena (filas ordenadas por id ASC).
 * - prev_hash de cada fila debe encadenar con el hash anterior
 * - el hash de cada fila debe recomputarse idéntico desde su contenido
 * Devuelve verified=false y brokenAt=id de la primera entrada rota.
 */
export function verifyChain(rows: AidEventRow[]): VerifyResult {
  if (rows.length === 0) {
    return { verified: true, brokenAt: null, rootHash: null, count: 0 };
  }
  let prev = GENESIS_PREV;
  for (const row of rows) {
    if (row.prevHash !== prev) {
      return { verified: false, brokenAt: row.id, rootHash: null, count: rows.length };
    }
    const expected = computeEventHash(prev, row);
    if (row.hash !== expected) {
      return { verified: false, brokenAt: row.id, rootHash: null, count: rows.length };
    }
    prev = row.hash;
  }
  return { verified: true, brokenAt: null, rootHash: prev, count: rows.length };
}
