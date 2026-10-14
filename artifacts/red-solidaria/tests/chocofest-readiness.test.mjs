// Estado de organización del evento e información ampliada (funciones puras).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  CHOCOFEST_2026,
  CHOCOFEST_SETTING_KEYS,
  eventReadiness,
  resolveEventDetails,
} = await import("./dist/chocofest.mjs");

/** Entrada con TODO cumplido; cada test apaga lo que quiere comprobar. */
const full = (overrides = {}) => ({
  campaign: {
    description: "Descripción del evento",
    goal: 5000,
    status: "active",
    startDate: "2026-12-20",
    imageUrl: "https://cdn.example/portada.jpg",
  },
  isProtagonist: true,
  donationCount: 3,
  imageCount: 4,
  updateCount: 2,
  expenseCount: 5,
  budgetCount: 2,
  itemCount: 6,
  ...overrides,
});

test("eventReadiness: con todo cumplido está listo al 100%", () => {
  const r = eventReadiness(full());
  assert.equal(r.ready, true);
  assert.equal(r.percent, 100);
  assert.equal(r.done, r.total);
  assert.ok(r.total >= 10);
  for (const check of r.checks) assert.equal(check.ok, true, `${check.key} debería estar ok`);
});

test("eventReadiness: sin campaña no hay nada cumplido (no inventa estado)", () => {
  const r = eventReadiness({
    campaign: null,
    isProtagonist: false,
    donationCount: 0,
    imageCount: 0,
    updateCount: 0,
    expenseCount: 0,
    budgetCount: 0,
    itemCount: 0,
  });
  assert.equal(r.ready, false);
  assert.equal(r.done, 0);
  assert.equal(r.percent, 0);
});

test("REGRESIÓN: el cronograma depende de las novedades reales", () => {
  // Antes este punto estaba fijado en `false` aunque hubiera novedades.
  const conNovedades = eventReadiness(full({ updateCount: 1 }));
  assert.equal(conNovedades.checks.find((c) => c.key === "timeline").ok, true);

  const sinNovedades = eventReadiness(full({ updateCount: 0 }));
  assert.equal(sinNovedades.checks.find((c) => c.key === "timeline").ok, false);
});

test("eventReadiness: cada punto refleja su dato real", () => {
  const r = eventReadiness(
    full({
      campaign: {
        description: "   ", // solo espacios = sin presentación
        goal: 0, // sin meta
        status: "draft", // no publicado
        startDate: null,
        imageUrl: null,
      },
      isProtagonist: false,
      donationCount: 0,
      imageCount: 0,
      updateCount: 2,
      expenseCount: 0,
      budgetCount: 0,
      itemCount: 0,
    }),
  );
  const byKey = Object.fromEntries(r.checks.map((c) => [c.key, c.ok]));
  assert.equal(byKey.published, false);
  assert.equal(byKey.protagonist, false);
  assert.equal(byKey.presentation, false);
  assert.equal(byKey.goal, false);
  assert.equal(byKey.dates, false);
  assert.equal(byKey.cover, false);
  assert.equal(byKey.donations, false);
  assert.equal(byKey.gallery, false);
  assert.equal(byKey.transparency, false);
  assert.equal(byKey.budget, false);
  assert.equal(byKey.inventory, false);
  // Lo único que sí existe: las novedades del cronograma.
  assert.equal(byKey.timeline, true);
  assert.equal(r.done, 1);
  assert.equal(r.ready, false);
});

test("eventReadiness: una campaña pausada sigue siendo visible al público", () => {
  const r = eventReadiness(
    full({ campaign: { ...full().campaign, status: "paused" } }),
  );
  assert.equal(r.checks.find((c) => c.key === "published").ok, true);
});

test("eventReadiness: tolera datos ausentes y porcentajes redondeados", () => {
  const sinCampaña = eventReadiness({
    campaign: undefined,
    isProtagonist: false,
    donationCount: 0,
    imageCount: 0,
    updateCount: 0,
    expenseCount: 0,
    budgetCount: 0,
    itemCount: 0,
  });
  assert.equal(sinCampaña.percent, 0);

  // 9 de 12 puntos cumplidos = 75%.
  const mitad = eventReadiness({
    campaign: full().campaign,
    isProtagonist: true,
    donationCount: 1,
    imageCount: 1,
    updateCount: 1,
    expenseCount: 0,
    budgetCount: 0,
    itemCount: 0,
  });
  assert.equal(mitad.done, 9);
  assert.equal(mitad.percent, 75);
});

test("claves de settings del evento: incluyen objetivos y responsables", () => {
  assert.deepEqual(CHOCOFEST_SETTING_KEYS, {
    place: "chocofest_2026_place",
    schedule: "chocofest_2026_schedule",
    motto: "chocofest_2026_motto",
    objectives: "chocofest_2026_objectives",
    organizers: "chocofest_2026_organizers",
  });
});

test("resolveEventDetails: información ampliada con respaldos marcados", () => {
  const vacio = resolveEventDetails(undefined);
  assert.equal(vacio.place, CHOCOFEST_2026.location);
  assert.equal(vacio.motto, CHOCOFEST_2026.provisionalMotto);
  assert.equal(vacio.schedule, "");
  // Sin objetivos definidos no se inventa texto.
  assert.equal(vacio.objectives, "");
  // El equipo responsable cae en el organizador por defecto.
  assert.equal(vacio.organizers, CHOCOFEST_2026.organizer);

  const configurado = resolveEventDetails({
    [CHOCOFEST_SETTING_KEYS.place]: "  Plaza de Armas  ",
    [CHOCOFEST_SETTING_KEYS.schedule]: "4:00 p. m.",
    [CHOCOFEST_SETTING_KEYS.motto]: "Compartir es la fiesta",
    [CHOCOFEST_SETTING_KEYS.objectives]: "Atender a los niños del distrito",
    [CHOCOFEST_SETTING_KEYS.organizers]: "Equipo Red Solidaria",
  });
  assert.equal(configurado.place, "Plaza de Armas");
  assert.equal(configurado.schedule, "4:00 p. m.");
  assert.equal(configurado.motto, "Compartir es la fiesta");
  assert.equal(configurado.objectives, "Atender a los niños del distrito");
  assert.equal(configurado.organizers, "Equipo Red Solidaria");
});
