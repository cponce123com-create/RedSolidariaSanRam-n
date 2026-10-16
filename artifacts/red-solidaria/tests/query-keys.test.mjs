// Claves de consulta e invalidación por entidad (Fase 1 — sincronización).
//
// Regresión cubierta: el panel invalidaba `queryKey[0] === "/api/campaigns"`
// mientras el cliente generado por Orval guarda el detalle como UN SOLO STRING
// (`["/api/campaigns/5"]`), así que el detalle público nunca se refrescaba.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  ADMIN_ALLIES_KEY,
  ADMIN_CAMPAIGNS_KEY,
  ADMIN_DONATIONS_KEY,
  ADMIN_SETTINGS_KEY,
  ALLIES_KEY,
  CAMPAIGNS_KEY,
  DONATIONS_KEY,
  SETTINGS_KEY,
  isAllyQueryKey,
  isCampaignQueryKey,
  isDonationQueryKey,
  isEntityQueryKey,
  isSettingsQueryKey,
} = await import("./dist/query-keys.mjs");

const {
  invalidateAllyQueries,
  invalidateCampaignQueries,
  invalidateDonationQueries,
  invalidateEntities,
} = await import("./dist/query-invalidation.mjs");

/** QueryClient de prueba: guarda los filtros y evalúa sus predicados. */
function fakeQueryClient() {
  const filters = [];
  return {
    filters,
    invalidateQueries(next) {
      filters.push(next);
      return Promise.resolve();
    },
  };
}

function matched(client, key) {
  return client.filters.some((f) => f.predicate({ queryKey: key }));
}

test("constantes de claves: valores estables", () => {
  assert.equal(CAMPAIGNS_KEY, "/api/campaigns");
  assert.equal(ADMIN_CAMPAIGNS_KEY, "/api/admin/campaigns");
  assert.equal(DONATIONS_KEY, "/api/donations");
  assert.equal(ADMIN_DONATIONS_KEY, "/api/admin/donations");
  assert.equal(ALLIES_KEY, "/api/allies");
  assert.equal(ADMIN_ALLIES_KEY, "/api/admin/allies");
  assert.equal(SETTINGS_KEY, "settings");
  assert.equal(ADMIN_SETTINGS_KEY, "admin-settings");
});

test("isCampaignQueryKey: lista, clave compuesta, detalle y subrecursos", () => {
  // Claves reales del proyecto.
  assert.equal(isCampaignQueryKey(["/api/campaigns"]), true);
  assert.equal(isCampaignQueryKey(["/api/campaigns", { status: "all" }]), true);
  assert.equal(isCampaignQueryKey(["/api/campaigns", 5, "transparency"]), true);
  assert.equal(isCampaignQueryKey(["/api/campaigns/5"]), true); // cliente Orval
  assert.equal(isCampaignQueryKey(["/api/campaigns/5", "donors"]), true);
  assert.equal(isCampaignQueryKey(["/api/campaigns/5", "updates"]), true);
  assert.equal(isCampaignQueryKey(["/api/campaigns/5", "images"]), true);
  assert.equal(isCampaignQueryKey(["/api/admin/campaigns", 5, "expenses"]), true);
  assert.equal(isCampaignQueryKey(["/api/admin/campaigns", 5, "leftovers"]), true);
  // No debe confundir otras entidades ni claves parecidas.
  assert.equal(isCampaignQueryKey(["/api/campaigns-archivadas"]), false);
  assert.equal(isCampaignQueryKey(["/api/donations"]), false);
  assert.equal(isCampaignQueryKey(["/api/allies"]), false);
  assert.equal(isCampaignQueryKey(["settings"]), false);
  assert.equal(isCampaignQueryKey([42]), false);
  assert.equal(isCampaignQueryKey([]), false);
});

test("isDonationQueryKey / isAllyQueryKey / isSettingsQueryKey", () => {
  assert.equal(isDonationQueryKey(["/api/donations"]), true);
  assert.equal(isDonationQueryKey(["/api/donations/stats"]), true);
  assert.equal(isDonationQueryKey(["/api/donations/7/proofs"]), true);
  assert.equal(isDonationQueryKey(["/api/admin/donations/duplicates"]), true);
  assert.equal(isDonationQueryKey(["/api/campaigns/5/donations"]), false);

  assert.equal(isAllyQueryKey(["/api/allies"]), true);
  assert.equal(isAllyQueryKey(["/api/admin/allies"]), true);
  assert.equal(isAllyQueryKey(["/api/allies/3"]), true);
  assert.equal(isAllyQueryKey(["/api/news"]), false);

  assert.equal(isSettingsQueryKey(["settings"]), true);
  assert.equal(isSettingsQueryKey(["admin-settings"]), true);
  assert.equal(isSettingsQueryKey(["settings-x"]), false);
});

test("isEntityQueryKey: consulta por varias entidades", () => {
  assert.equal(isEntityQueryKey(["/api/campaigns/5"], ["campaigns"]), true);
  assert.equal(isEntityQueryKey(["/api/campaigns/5"], ["allies"]), false);
  assert.equal(
    isEntityQueryKey(["/api/campaigns/5"], ["donations", "campaigns"]),
    true,
  );
  assert.equal(isEntityQueryKey(["settings"], ["campaigns", "settings"]), true);
});

test("REGRESIÓN: editar una campaña refresca el detalle público", () => {
  const client = fakeQueryClient();
  invalidateCampaignQueries(client);
  // El detalle (clave de un solo string) es el caso que fallaba.
  assert.equal(matched(client, ["/api/campaigns/5"]), true);
  assert.equal(matched(client, ["/api/campaigns/5", "donors"]), true);
  assert.equal(matched(client, ["/api/campaigns", { status: "all" }]), true);
  assert.equal(matched(client, ["/api/campaigns", 5, "transparency"]), true);
  assert.equal(matched(client, ["/api/admin/campaigns", 5, "expenses"]), true);
  // La portada lee la configuración: también debe refrescarse.
  assert.equal(matched(client, ["settings"]), true);
  assert.equal(matched(client, ["admin-settings"]), true);
  // No se invalida lo que no depende de la campaña.
  assert.equal(matched(client, ["/api/donations"]), false);
  assert.equal(matched(client, ["/api/allies"]), false);
});

test("aprobar una donación refresca el monto y la transparencia", () => {
  const client = fakeQueryClient();
  invalidateDonationQueries(client);
  assert.equal(matched(client, ["/api/donations"]), true);
  assert.equal(matched(client, ["/api/donations/stats"]), true);
  assert.equal(matched(client, ["/api/campaigns/5"]), true);
  assert.equal(matched(client, ["/api/campaigns", 5, "transparency"]), true);
  assert.equal(matched(client, ["/api/allies"]), false);
});

test("el panel de aliados refresca la página pública de aliados", () => {
  const client = fakeQueryClient();
  invalidateAllyQueries(client);
  assert.equal(matched(client, ["/api/admin/allies"]), true);
  assert.equal(matched(client, ["/api/allies"]), true);
  assert.equal(matched(client, ["/api/campaigns"]), false);
});

test("invalidateEntities: una sola consulta con predicado para varias entidades", () => {
  const client = fakeQueryClient();
  invalidateEntities(client, ["campaigns", "donations"]);
  assert.equal(client.filters.length, 1);
  assert.equal(matched(client, ["/api/campaigns/9"]), true);
  assert.equal(matched(client, ["/api/donations"]), true);
  assert.equal(matched(client, ["settings"]), false);
});

// ─── V15: entidades que faltaban (mascotas, noticias, testimonios, FAQ,
//     reportes e identidad institucional) ────────────────────────────────────

test("V15: predicados de mascotas, noticias, testimonios, FAQ, reportes e identidad", async () => {
  const {
    isPetQueryKey,
    isNewsQueryKey,
    isTestimonialQueryKey,
    isFaqQueryKey,
    isReportQueryKey,
    isIdentityQueryKey,
  } = await import("./dist/query-keys.mjs");

  assert.equal(isPetQueryKey(["/api/pets"]), true);
  assert.equal(isPetQueryKey(["/api/admin/pets"]), true);
  assert.equal(isPetQueryKey(["/api/admin/pets", "available"]), true);
  assert.equal(isPetQueryKey(["/api/admin/pets/5"]), true);
  assert.equal(isPetQueryKey(["/api/admin/adoption-requests"]), true);
  assert.equal(isPetQueryKey(["/api/news"]), false);

  assert.equal(isNewsQueryKey(["/api/news"]), true);
  assert.equal(isNewsQueryKey(["/api/news/5"]), true);
  assert.equal(isNewsQueryKey(["/api/news-archivadas"]), false);

  assert.equal(isTestimonialQueryKey(["/api/testimonials"]), true);
  assert.equal(isTestimonialQueryKey(["/api/admin/testimonials"]), true);

  assert.equal(isFaqQueryKey(["/api/faq"]), true);
  assert.equal(isFaqQueryKey(["/api/admin/faq"]), true);

  assert.equal(isReportQueryKey(["/api/reports"]), true);
  assert.equal(isReportQueryKey(["/api/admin/reports"]), true);
  assert.equal(isReportQueryKey(["/api/admin/reports/5"]), true);

  assert.equal(isIdentityQueryKey(["institutional-identity"]), true);
  assert.equal(isIdentityQueryKey(["admin-institutional-identity"]), true);
  assert.equal(isIdentityQueryKey(["settings"]), false);
});

test("V15: invalidar mascotas refresca panel, web pública y solicitudes", async () => {
  const { invalidatePetQueries, invalidateNewsQueries, invalidateIdentityQueries } =
    await import("./dist/query-invalidation.mjs");

  const client = fakeQueryClient();
  invalidatePetQueries(client);
  assert.equal(matched(client, ["/api/admin/pets"]), true);
  assert.equal(matched(client, ["/api/admin/pets", "available"]), true);
  assert.equal(matched(client, ["/api/pets"]), true);
  assert.equal(matched(client, ["/api/admin/pets/5"]), true);
  assert.equal(matched(client, ["/api/admin/adoption-requests"]), true);
  assert.equal(matched(client, ["/api/news"]), false);

  const newsClient = fakeQueryClient();
  invalidateNewsQueries(newsClient);
  assert.equal(matched(newsClient, ["/api/news"]), true);
  assert.equal(matched(newsClient, ["/api/news/5"]), true);
  assert.equal(matched(newsClient, ["/api/admin/pets"]), false);

  const identityClient = fakeQueryClient();
  invalidateIdentityQueries(identityClient);
  assert.equal(matched(identityClient, ["institutional-identity"]), true);
  assert.equal(matched(identityClient, ["admin-institutional-identity"]), true);
  assert.equal(matched(identityClient, ["settings"]), true);
  assert.equal(matched(identityClient, ["/api/campaigns"]), false);
});
