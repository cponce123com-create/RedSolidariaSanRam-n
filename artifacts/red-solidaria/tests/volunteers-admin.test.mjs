// Panel de voluntariado: presentación y URL (funciones puras, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  VOLUNTEER_STATUS_BADGE,
  VOLUNTEER_STATUS_LABEL,
  VOLUNTEER_STATUS_TABS,
  buildVolunteersUrl,
  decisionSummary,
  trackingLink,
  volunteerStatusBadge,
  volunteerStatusLabel,
} = await import("./dist/volunteers-admin.mjs");

test("etiquetas y distintivos de estado", () => {
  assert.equal(volunteerStatusLabel("pending"), "Pendiente");
  assert.equal(volunteerStatusLabel("rejected"), "No procede");
  assert.equal(volunteerStatusLabel("otro"), "otro");
  assert.match(volunteerStatusBadge("approved"), /green/);
  assert.match(volunteerStatusBadge("desconocido"), /secondary/);
  assert.equal(VOLUNTEER_STATUS_LABEL.contacted, "Contactado");
  assert.equal(Object.keys(VOLUNTEER_STATUS_BADGE).length, 5);
});

test("pestañas: cubren todo el ciclo de vida", () => {
  const values = VOLUNTEER_STATUS_TABS.map((t) => t.value);
  assert.deepEqual(values, ["all", "pending", "reviewing", "approved", "contacted", "rejected"]);
});

test("buildVolunteersUrl: sin filtros devuelve la ruta base", () => {
  assert.equal(buildVolunteersUrl(), "/api/admin/volunteers");
  assert.equal(buildVolunteersUrl({}), "/api/admin/volunteers");
  // «all» no se envía al servidor.
  assert.equal(buildVolunteersUrl({ status: "all" }), "/api/admin/volunteers");
});

test("buildVolunteersUrl: añade estado, búsqueda (recortada) y límite", () => {
  const url = buildVolunteersUrl({ status: "pending", search: "  Ana  ", limit: 50 });
  assert.match(url, /^\/api\/admin\/volunteers\?/);
  assert.match(url, /status=pending/);
  assert.match(url, /search=Ana/);
  assert.match(url, /limit=50/);
  assert.doesNotMatch(url, /\+/);
});

test("trackingLink: enlace público de seguimiento", () => {
  assert.equal(
    trackingLink("abc123", "https://redsolidaria.org"),
    "https://redsolidaria.org/voluntariado/estado/abc123",
  );
  // Sin origen explícito (entorno sin window) devuelve la ruta relativa.
  assert.equal(trackingLink("abc123"), "/voluntariado/estado/abc123");
});

test("decisionSummary: solo hay traza cuando la decisión está tomada", () => {
  assert.equal(
    decisionSummary({ status: "pending", approvedBy: null, approvedAt: null }),
    null,
  );
  assert.equal(
    decisionSummary({ status: "reviewing", approvedBy: "ana", approvedAt: "2026-10-14T10:00:00Z" }),
    null,
  );
  assert.equal(
    decisionSummary({ status: "approved", approvedBy: "ana", approvedAt: null }),
    "Decidido por ana",
  );
  const summary = decisionSummary({
    status: "rejected",
    approvedBy: "luis",
    approvedAt: "2026-10-14T10:00:00Z",
  });
  assert.match(summary, /^Decidido por luis el /);
  assert.equal(
    decisionSummary({ status: "approved", approvedBy: null, approvedAt: "fecha-invalida" }),
    "Decidido por —",
  );
});
