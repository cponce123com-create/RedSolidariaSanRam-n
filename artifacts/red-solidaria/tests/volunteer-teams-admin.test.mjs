// Equipos y participación: presentación y utilidades (funciones puras).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  VOLUNTEER_ACTIVITY_LABEL,
  VOLUNTEER_ACTIVITY_TYPES,
  activityTypeLabel,
  buildMembershipsUrl,
  buildParticipationsUrl,
  countActiveTeams,
  formatHours,
  teamOptionsFor,
} = await import("./dist/volunteer-teams-admin.mjs");

test("tipos de actividad y etiquetas", () => {
  assert.deepEqual([...VOLUNTEER_ACTIVITY_TYPES], ["brigada", "evento", "taller", "apoyo", "otro"]);
  assert.equal(activityTypeLabel("brigada"), "Brigada");
  assert.equal(activityTypeLabel("apoyo"), "Apoyo operativo");
  assert.equal(activityTypeLabel("otro"), "Otro");
  assert.equal(activityTypeLabel("desconocido"), "desconocido");
  assert.equal(VOLUNTEER_ACTIVITY_LABEL.taller, "Taller");
});

test("URLs de los recursos del voluntario", () => {
  assert.equal(buildMembershipsUrl(7), "/api/admin/volunteers/7/teams");
  assert.equal(buildParticipationsUrl(7), "/api/admin/volunteers/7/participations");
});

test("formatHours: legible y determinista", () => {
  assert.equal(formatHours(3), "3 h");
  assert.equal(formatHours(3.5), "3.5 h");
  assert.equal(formatHours(2.005), "2.01 h");
  assert.equal(formatHours(null), "—");
  assert.equal(formatHours(undefined), "—");
  assert.equal(formatHours(0), "—");
  assert.equal(formatHours(-2), "—");
  assert.equal(formatHours(Number.NaN), "—");
});

test("teamOptionsFor: solo equipos activos donde no está ya", () => {
  const teams = [
    { id: 1, name: "Brigada", isActive: true },
    { id: 2, name: "Difusión", isActive: true },
    { id: 3, name: "Archivado", isActive: false },
  ];
  const memberships = [
    { teamId: 1, active: true },
    { teamId: 2, active: false },
  ];
  const options = teamOptionsFor(teams, memberships);
  assert.deepEqual(options.map((t) => t.id), [2]);
});

test("teamOptionsFor: tolera listas ausentes", () => {
  assert.deepEqual(teamOptionsFor(undefined, undefined), []);
  assert.deepEqual(teamOptionsFor(null, null), []);
  assert.deepEqual(teamOptionsFor([], []), []);
});

test("countActiveTeams: cuenta solo las pertenencias vigentes", () => {
  assert.equal(countActiveTeams(undefined), 0);
  assert.equal(countActiveTeams([]), 0);
  assert.equal(
    countActiveTeams([
      { active: true },
      { active: false },
      { active: true },
    ]),
    2,
  );
});
