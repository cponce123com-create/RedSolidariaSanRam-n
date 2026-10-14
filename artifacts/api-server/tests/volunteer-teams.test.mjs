// Equipos y participación del voluntariado (funciones puras, sin DB).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  PARTICIPATION_HOURS_MAX,
  VOLUNTEER_ACTIVITY_TYPES,
  activityTypeLabel,
  canManageVolunteerTeams,
  isActivityType,
  summarizeParticipation,
  validateParticipation,
  validateTeam,
} = await import("./dist/lib/volunteer-teams.mjs");

test("tipos de actividad y etiquetas", () => {
  assert.deepEqual(Object.values(VOLUNTEER_ACTIVITY_TYPES).sort(), [
    "apoyo",
    "brigada",
    "evento",
    "otro",
    "taller",
  ]);
  assert.equal(activityTypeLabel("brigada"), "Brigada");
  assert.equal(activityTypeLabel("apoyo"), "Apoyo operativo");
  assert.equal(activityTypeLabel("otro"), "Otro");
  assert.equal(activityTypeLabel("x"), "x");
  assert.equal(isActivityType("evento"), true);
  assert.equal(isActivityType("fiesta"), false);
});

test("validateTeam: exige un nombre razonable y normaliza", () => {
  const short = validateTeam({ name: "ab" });
  assert.equal(short.ok, false);
  assert.match(short.message, /al menos 3/);

  const long = validateTeam({ name: "x".repeat(81) });
  assert.equal(long.ok, false);
  assert.match(long.message, /no puede superar/);

  const ok = validateTeam({ name: "  Brigada Verde  ", description: "  ", color: " #22c55e " });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, {
    name: "Brigada Verde",
    description: null,
    color: "#22c55e",
  });
});

test("validateParticipation: exige tipo, título y fecha válida", () => {
  const badType = validateParticipation({ activityType: "x", title: "Brigada", participatedAt: "2026-10-01" });
  assert.equal(badType.ok, false);
  assert.match(badType.message, /Tipo de actividad/);

  const badTitle = validateParticipation({ activityType: "brigada", title: "ab", participatedAt: "2026-10-01" });
  assert.equal(badTitle.ok, false);
  assert.match(badTitle.message, /al menos 3/);

  const badDate = validateParticipation({ activityType: "brigada", title: "Brigada", participatedAt: "no-es-fecha" });
  assert.equal(badDate.ok, false);
  assert.match(badDate.message, /fecha de participación no es válida/);
});

test("validateParticipation: no acepta fechas futuras", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const future = new Date("2026-12-01T12:00:00Z");
  const result = validateParticipation({
    activityType: "brigada",
    title: "Brigada futura",
    participatedAt: future.toISOString(),
    now,
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /futuro/);

  // El mismo día (con desfase de zona) sí se acepta.
  const today = validateParticipation({
    activityType: "brigada",
    title: "Brigada de hoy",
    participatedAt: "2026-10-14T23:00:00Z",
    now,
  });
  assert.equal(today.ok, true);
});

test("validateParticipation: horas opcionales y acotadas", () => {
  const ok = validateParticipation({
    activityType: "taller",
    title: "Taller de primeros auxilios",
    hours: "3.5",
    participatedAt: "2026-10-01",
    campaignId: "7",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.hours, 3.5);
  assert.equal(ok.value.campaignId, 7);

  const sinHoras = validateParticipation({
    activityType: "evento",
    title: "Evento de aniversario",
    hours: "",
    participatedAt: "2026-10-01",
  });
  assert.equal(sinHoras.ok, true);
  assert.equal(sinHoras.value.hours, null);
  assert.equal(sinHoras.value.campaignId, null);

  for (const bad of [0, -2, PARTICIPATION_HOURS_MAX + 1, "muchas"]) {
    const result = validateParticipation({
      activityType: "apoyo",
      title: "Apoyo operativo",
      hours: bad,
      participatedAt: "2026-10-01",
    });
    assert.equal(result.ok, false, `horas inválidas aceptadas: ${bad}`);
  }
});

test("summarizeParticipation: cuenta, acumula horas y toma la última fecha", () => {
  const summary = summarizeParticipation([
    { hours: 2, participatedAt: "2026-10-01T10:00:00Z" },
    { hours: 3.5, participatedAt: "2026-10-10T10:00:00Z" },
    { hours: null, participatedAt: "2026-10-05T10:00:00Z" },
  ]);
  assert.equal(summary.count, 3);
  assert.equal(summary.totalHours, 5.5);
  assert.equal(summary.lastAt, "2026-10-10T10:00:00.000Z");
});

test("summarizeParticipation: tolera listas vacías y datos sucios", () => {
  assert.deepEqual(summarizeParticipation(undefined), { count: 0, totalHours: 0, lastAt: null });
  assert.deepEqual(summarizeParticipation([]), { count: 0, totalHours: 0, lastAt: null });
  const summary = summarizeParticipation([
    { hours: -5, participatedAt: "fecha-mala" },
    { hours: Number.NaN, participatedAt: null },
  ]);
  assert.equal(summary.count, 2);
  assert.equal(summary.totalHours, 0);
  assert.equal(summary.lastAt, null);
});

test("permisos: comunidad y administración gestionan equipos", () => {
  assert.equal(canManageVolunteerTeams("administrador"), true);
  assert.equal(canManageVolunteerTeams("moderador"), true);
  assert.equal(canManageVolunteerTeams("superadmin"), true);
  assert.equal(canManageVolunteerTeams("supervisor"), false);
  assert.equal(canManageVolunteerTeams(null), false);
});
