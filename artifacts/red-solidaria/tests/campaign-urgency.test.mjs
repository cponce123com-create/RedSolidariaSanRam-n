import { test } from "node:test";
import assert from "node:assert/strict";
import {
  URGENCY_THRESHOLD_DAYS,
  daysUntilEnd,
  isUrgent,
  formatCountdownParts,
  mostUrgentCampaign,
} from "./dist/campaign-urgency.mjs";

const DAY_MS = 86_400_000;
// Hora fija para tests deterministas (martes 11 ago 2026 12:00 UTC)
const NOW = new Date("2026-08-11T12:00:00Z").getTime();
const at = (offsetMs) => new Date(NOW + offsetMs).toISOString();

test("daysUntilEnd: sin endDate o fecha inválida devuelve null", () => {
  assert.equal(daysUntilEnd(undefined, NOW), null);
  assert.equal(daysUntilEnd(null, NOW), null);
  assert.equal(daysUntilEnd("fecha inválida", NOW), null);
});

test("daysUntilEnd: cuenta días hacia arriba (ceil) y permite negativos", () => {
  assert.equal(daysUntilEnd(at(0), NOW), 0);
  assert.equal(daysUntilEnd(at(DAY_MS), NOW), 1);
  assert.equal(daysUntilEnd(at(7 * DAY_MS), NOW), 7);
  assert.equal(daysUntilEnd(at(-DAY_MS), NOW), -1);
  // 12 horas → ceil(0.5) = 1 día
  assert.equal(daysUntilEnd(at(DAY_MS / 2), NOW), 1);
});

test("isUrgent: campaña activa con cierre dentro del umbral", () => {
  const campaign = { status: "active", endDate: at(3 * DAY_MS) };
  assert.equal(isUrgent(campaign, URGENCY_THRESHOLD_DAYS, NOW), true);
});

test("isUrgent: límites exactos (hoy y día 7)", () => {
  assert.equal(isUrgent({ status: "active", endDate: at(0) }, 7, NOW), true);
  assert.equal(isUrgent({ status: "active", endDate: at(7 * DAY_MS) }, 7, NOW), true);
  assert.equal(isUrgent({ status: "active", endDate: at(8 * DAY_MS) }, 7, NOW), false);
});

test("isUrgent: nunca urgente sin endDate, vencida o inactiva", () => {
  assert.equal(isUrgent({ status: "active" }, 7, NOW), false);
  assert.equal(isUrgent({ status: "active", endDate: at(-DAY_MS) }, 7, NOW), false);
  assert.equal(isUrgent({ status: "completed", endDate: at(DAY_MS) }, 7, NOW), false);
  assert.equal(isUrgent({ status: "paused", endDate: at(DAY_MS) }, 7, NOW), false);
});

test("formatCountdownParts: descompone, trunca fracciones y clampa negativos", () => {
  assert.deepEqual(formatCountdownParts(0), { days: 0, hours: 0, minutes: 0, seconds: 0 });
  const ms = (1 * 86_400 + 2 * 3_600 + 3 * 60 + 4) * 1000;
  assert.deepEqual(formatCountdownParts(ms), { days: 1, hours: 2, minutes: 3, seconds: 4 });
  assert.deepEqual(formatCountdownParts(-5000), { days: 0, hours: 0, minutes: 0, seconds: 0 });
  assert.deepEqual(formatCountdownParts(1500), { days: 0, hours: 0, minutes: 0, seconds: 1 });
});

test("mostUrgentCampaign: elige la que cierra antes y omite pasadas/sin fecha", () => {
  assert.equal(mostUrgentCampaign([], NOW), null);

  const far = { id: 1, status: "active", endDate: at(10 * DAY_MS) };
  const near = { id: 2, status: "active", endDate: at(2 * DAY_MS) };
  const overdue = { id: 3, status: "active", endDate: at(-DAY_MS) };
  const noDate = { id: 4, status: "active" };

  assert.equal(mostUrgentCampaign([far, near], NOW), near);
  assert.equal(mostUrgentCampaign([far, overdue, noDate], NOW), far);
  assert.equal(mostUrgentCampaign([overdue, noDate], NOW), null);
});
