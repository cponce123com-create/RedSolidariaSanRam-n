import { describe, it, expect } from "vitest";
import {
  canonicalStableStringify,
  computeEventHash,
  formatLedgerNumber,
  GENESIS_PREV,
  verifyChain,
  type AidEventInput,
  type AidEventRow,
} from "./ledger";

function event(overrides: Partial<AidEventInput> = {}): AidEventInput {
  return {
    eventType: "REQUEST_CREATED",
    actorDid: "did:plc:abc123",
    resourceRef: "at://did:plc:abc123/app.patchwork.aid/3kz9x",
    payload: { category: "food", urgent: true, quantity: 2 },
    createdAt: new Date("2026-08-10T10:00:00.000Z"),
    ...overrides,
  };
}

// Construye una cadena válida secuencial (mismo algoritmo que appendEvent hará en wave 2).
function buildChain(events: AidEventInput[]): AidEventRow[] {
  let prev = GENESIS_PREV;
  return events.map((e, i) => {
    const row: AidEventRow = {
      ...e,
      id: i + 1,
      chainKey: `aid:${e.resourceRef}`,
      prevHash: prev,
      hash: computeEventHash(prev, e),
    };
    prev = row.hash;
    return row;
  });
}

describe("canonicalStableStringify", () => {
  it("ordena las claves alfabéticamente (recursivo)", () => {
    expect(canonicalStableStringify({ b: 1, a: 2, c: { y: 1, x: 2 } })).toBe(
      '{"a":2,"b":1,"c":{"x":2,"y":1}}',
    );
  });

  it("normaliza números: enteros sin decimales, sin notación científica, -0 → 0", () => {
    expect(formatLedgerNumber(100)).toBe("100");
    expect(formatLedgerNumber(100.5)).toBe("100.5");
    expect(formatLedgerNumber(1e-7)).toBe("0.0000001000".replace(/0+$/, "").replace(/\.$/, ""));
    expect(formatLedgerNumber(-0)).toBe("0");
    expect(canonicalStableStringify({ amount: 100.5 })).toBe('{"amount":100.5}');
  });

  it("trata undefined como null (determinista)", () => {
    expect(canonicalStableStringify({ a: undefined, b: 1 })).toBe('{"a":null,"b":1}');
  });

  it("rechaza valores no-JSON (funciones, NaN)", () => {
    expect(() => canonicalStableStringify({ fn: () => 1 })).toThrow();
    expect(() => formatLedgerNumber(Number.NaN)).toThrow();
  });
});

describe("computeEventHash", () => {
  it("es determinista y de 64 hex", () => {
    const h = computeEventHash(GENESIS_PREV, event());
    expect(h).toBe(computeEventHash(GENESIS_PREV, event()));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cambia ante cualquier alteración del evento", () => {
    const base = computeEventHash(GENESIS_PREV, event());
    expect(computeEventHash(GENESIS_PREV, event({ eventType: "OFFER_MADE" }))).not.toBe(base);
    expect(computeEventHash(GENESIS_PREV, event({ actorDid: "did:plc:otro" }))).not.toBe(base);
    expect(computeEventHash(GENESIS_PREV, event({ resourceRef: "at://otro" }))).not.toBe(base);
    expect(computeEventHash(GENESIS_PREV, event({ payload: { category: "medicine" } }))).not.toBe(base);
    expect(computeEventHash(GENESIS_PREV, event({ createdAt: new Date("2026-08-11T10:00:00Z") }))).not.toBe(base);
    expect(computeEventHash("prev-distinto", event())).not.toBe(base);
  });

  it("mismos datos con orden de claves distinto → mismo hash (canónico)", () => {
    const a = computeEventHash(GENESIS_PREV, event({ payload: { category: "food", urgent: true } }));
    const b = computeEventHash(GENESIS_PREV, event({ payload: { urgent: true, category: "food" } }));
    expect(a).toBe(b);
  });
});

describe("verifyChain", () => {
  it("cadena válida → verified con rootHash = último hash", () => {
    const rows = buildChain([
      event(),
      event({ eventType: "OFFER_MADE", resourceRef: "at://offer/1" }),
      event({ eventType: "REQUEST_ACCEPTED", resourceRef: "at://offer/1" }),
    ]);
    const result = verifyChain(rows);
    expect(result.verified).toBe(true);
    expect(result.rootHash).toBe(rows[2].hash);
    expect(result.count).toBe(3);
    expect(result.brokenAt).toBeNull();
  });

  it("payload manipulado → brokenAt señala la fila", () => {
    const rows = buildChain([event(), event({ eventType: "OFFER_MADE", resourceRef: "at://offer/1" })]);
    rows[1].payload = { category: "medicine" }; // tamper
    const result = verifyChain(rows);
    expect(result.verified).toBe(false);
    expect(result.brokenAt).toBe(rows[1].id);
    expect(result.rootHash).toBeNull();
  });

  it("enlace roto (prevHash alterado) → brokenAt", () => {
    const rows = buildChain([event(), event({ eventType: "OFFER_MADE", resourceRef: "at://offer/1" })]);
    rows[1].prevHash = "0".repeat(64);
    const result = verifyChain(rows);
    expect(result.verified).toBe(false);
    expect(result.brokenAt).toBe(rows[1].id);
  });

  it("borrar una entrada intermedia rompe la cadena", () => {
    const rows = buildChain([
      event(),
      event({ eventType: "OFFER_MADE", resourceRef: "at://offer/1" }),
      event({ eventType: "REQUEST_ACCEPTED", resourceRef: "at://offer/1" }),
    ]);
    const result = verifyChain([rows[0], rows[2]]); // DELETE físico del medio
    expect(result.verified).toBe(false);
    expect(result.brokenAt).toBe(rows[2].id);
  });

  it("cadena vacía → verified sin rootHash", () => {
    const result = verifyChain([]);
    expect(result.verified).toBe(true);
    expect(result.rootHash).toBeNull();
    expect(result.count).toBe(0);
  });
});
