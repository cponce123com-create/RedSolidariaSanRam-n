# Ledger de Confianza para Mutual Aid — diseño (patchwork)

**Fuente del patrón:** ledger hash-chained implementado en Red Solidaria
(Trust Pay) para trazabilidad verificable de fondos. Aquí se adapta al dominio
de patchwork: en vez de dinero, el "valor" es el **cumplimiento de la ayuda**
(pedidos, ofertas, entrega, evidencia, feedback).

**Por qué encaja:** patchwork ya tiene el ethos de integridad verificable
(fixtures deterministas, releases con signed-digest, evidencia operacional).
Un ledger inmutable de eventos de ayuda lleva esa propiedad al producto, y la
infraestructura AT Protocol da el canal de anclaje "público" sin necesitar una
blockchain.

---

## 1. Concepto

Cada **ciclo de ayuda** genera una cadena de eventos inmutables:

```
aid_request → offer → acceptance → fulfillment → proof → completion → feedback
```

Cada evento se encadena al anterior con SHA-256 (`prev_hash`). Si alguien
edita o borra un evento en la DB, la cadena se rompe y la verificación pública
lo detecta (`brokenAt`). El **root hash** de cada cadena (y de la cadena
global) se ancla periódicamente en el AT Protocol como un record público con
firma — integridad verificable por cualquiera, sin servidor de confianza.

## 2. Modelo de datos (Postgres — encaja con sus projections)

```sql
CREATE TABLE aid_events (
    id            serial PRIMARY KEY,
    chain_key     text NOT NULL,          -- "aid:<request_uri>" agrupa la cadena
    event_type    text NOT NULL,          -- REQUEST_CREATED|OFFER_MADE|REQUEST_ACCEPTED|
                                          -- FULFILLMENT_REPORTED|PROOF_ATTACHED|COMPLETED|
                                          -- CANCELLED|FEEDBACK|MODERATED
    actor_did     text NOT NULL,          -- DID del actor (identidad AT real)
    resource_ref  text NOT NULL,          -- URI/at-uri del recurso (request/offer/record)
    payload       jsonb NOT NULL,         -- contenido mínimo del evento (ver §5)
    prev_hash     text NOT NULL,
    hash          text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_aid_events_chain ON aid_events(chain_key, id);
-- Un evento de negocio genera EXACTAMENTE una entrada (anti-duplicado):
CREATE UNIQUE INDEX idx_aid_events_source ON aid_events(event_type, resource_ref);
```

Append-only: **nunca UPDATE/DELETE**. Un error de registro se revierte con una
entrada compensatoria (p. ej. `FULFILLMENT_REPORTED` erróneo → `CANCELLED` con
referencia), dejando evidencia en la cadena.

## 3. Hash y canonicalización (lecciones de Trust Pay)

```ts
// packages/shared/src/ledger.ts (puro, testeable sin DB)
export function computeEventHash(prevHash: string, e: AidEventInput): string {
  // payload CANÓNICO: claves ordenadas + números con representación fija
  // (en Trust Pay el montón float4 se hasheaba con toFixed(2); aquí:
  // canonicalStableStringify(payload) con claves ordenadas y números
  // serializados sin notación científica).
  const canonical = canonicalStableStringify(e.payload);
  const payload = [prevHash, e.eventType, e.actorDid, e.resourceRef, canonical, e.createdAt.toISOString()].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function verifyChain(rows: AidEventRow[]): {
  verified: boolean; brokenAt: number | null; rootHash: string | null; count: number;
}
```

Regla de oro: **hashear siempre la representación canónica**, nunca el objeto
tal cual (orden de claves, floats, timezones). La función de verificación debe
poder re-computar la cadena leyendo solo la DB.

## 4. Escrituras y concurrencia (lección aprendida)

- Las escrituras viven en `services/api` dentro de **la misma transacción** que
  la mutación de negocio (aceptar oferta = UPDATE + `appendEvent`): si falla el
  ledger, revierte todo.
- Serializar appendes por `chain_key`: `SELECT id FROM aid_requests WHERE uri=$1 FOR UPDATE`
  (o lock de la fila del request) antes de leer `prev_hash` — dos eventos
  concurrentes no deben heredar el mismo hash.
- Unicidad por `(event_type, resource_ref)` como red de seguridad adicional.

## 5. Privacidad (crítico para ayuda mutua)

El ledger público NO almacena PII. `payload` solo contiene:
- referencias (at-uris), montos/cantidades si aplica, estado, ids de media
- **hash de datos sensibles**: si hay datos personales (dirección, teléfono),
  se guarda `data_sha256` y el dato real queda fuera del ledger

`MODERATED`: el moderation-worker encadena sus decisiones como eventos
(`resource_ref` = record moderado) — auditoría de moderación inmutable.

## 6. Anclaje en AT Protocol (el "blockchain" sin blockchain)

1. Job diario (`services/indexer` o un script) calcula el root hash global de
   `aid_events` (verificación completa + root).
2. Publica un **record AT** (lexicon custom `app.patchwork.ledgerAnchor` o un
   post con formato fijo) firmado con el DID del servicio, conteniendo
   `{ rootHash, count, anchoredAt, prevAnchorUri }` (encadena anclajes).
3. Verificación pública: cualquiera re-computa la cadena desde la DB pública y
   compara contra el último anchor del firehose. La inmutabilidad de AT (PLC +
   repo firmado) es la prueba de existencia fechada.

Alternativa ligera para el alpha: publicar el root hash como post normal del
DID del servicio (visible en el firehose público) y migrar al lexicon custom
cuando sea "buyer-ready".

## 7. Dónde vive en el monorepo

| Pieza | Ubicación |
|---|---|
| Tipos de eventos + canonicalización + `computeEventHash`/`verifyChain` (puros) | `packages/shared/src/ledger.ts` (+ tests Vitest) |
| Migración + tabla `aid_events` | `services/api` (migraciones existentes) |
| Hooks en mutaciones (accept/fulfill/complete/feedback) | `services/api` (transacciones) |
| Entradas de moderación encadenadas | `services/moderation-worker` |
| Endpoints públicos `/v1/aid/:uri/events` + `/events/verify` + `/ledger/root` | `services/api` |
| Job de anclaje AT (root hash → record firmado) | `services/indexer` o `scripts/` |
| UI: timeline "evidencia verificable" por request + badge de integridad | `apps/web` |

## 8. Tests (patrón probado en Red Solidaria, 65 tests)

- Hash determinista + cambia ante alteración de cualquier campo
- `verifyChain`: cadena válida → `verified` con rootHash = último hash
- Tamper: modificar monto/payload → `brokenAt` señala la fila; enlace roto →
  `brokenAt`; DELETE intermedio → `brokenAt`
- Canonicalización: mismo objeto serializado distinto (orden de claves) → mismo hash
- Endpoints: montados (nunca 404) + verificación end-to-end con Postgres real

## 9. Roadmap sugerido

1. **Wave actual:** tipos + funciones puras en `packages/shared` + tests
2. **Siguiente:** tabla + hooks en las mutaciones principales (REQUEST/ACCEPTED/FULFILLMENT)
3. **Luego:** endpoint de verificación + UI timeline
4. **Al final:** anclaje AT + lexicon custom (cuando sea buyer-ready)

---

*Diseño adaptado de la implementación Trust Pay de Red Solidaria
(`campaign_movements` + `ledger.ts` + `/movements/verify`), validada
end-to-end: detección de manipulación, no-duplicación y verificación pública.*
