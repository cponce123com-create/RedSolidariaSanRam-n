import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";
const { default: routes } = await import("./dist/routes/index.mjs");

test("publishing and queue actions reject anonymous users and read-only supervisors before touching DB", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.headers["x-test-role"];
    req.log = { error() {}, warn() {} };
    if (role) req.session = { adminUser: { id: 1, username: "test", role } };
    next();
  });
  app.use("/api", routes);
  const server = app.listen(0);
  await new Promise(r => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    for (const [method, path] of [["POST", "/news"], ["PUT", "/news/1"], ["POST", "/campaigns"], ["PATCH", "/campaigns/1/status"], ["POST", "/admin/integrations/facebook/publications/news/1"]]) {
      for (const [role, expected] of [[null, 401], ["supervisor", 403]]) {
        const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(role ? { "x-test-role": role } : {}) }, body: "{}" });
        assert.equal(response.status, expected, `${method} ${path} ${role}`);
      }
    }
    for (const role of ["administrador", "moderador", "superadmin"]) {
      const response = await fetch(`${base}/admin/integrations/facebook/publications/invalid/0`, { method: "POST", headers: { "x-test-role": role } });
      assert.equal(response.status, 400, "authorized roles reach validation without a DB query");
    }
    assert.equal((await fetch(`${base}/admin/integrations/facebook/publications/donation/0`, { headers: { "x-test-role": "moderador" } })).status, 403);
    assert.equal((await fetch(`${base}/admin/integrations/facebook/publications/donation/0`, { method: "POST", headers: { "x-test-role": "moderador" } })).status, 403);
    assert.equal((await fetch(`${base}/admin/integrations/facebook/publications/donation/0`, { headers: { "x-test-role": "supervisor" } })).status, 400, "finance readers reach validation");
    assert.equal((await fetch(`${base}/admin/integrations/facebook/publications/donation/0`, { method: "POST", headers: { "x-test-role": "supervisor" } })).status, 403);
  } finally { await new Promise(r => server.close(r)); }
});

test("donation draft preview is private, validates templates, and never publishes or queries the DB", async () => {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { const role = req.headers['x-test-role']; if (role) req.session = { adminUser: { id: 1, username: 'test', role } }; next(); });
  app.use('/api', routes);
  const server = app.listen(0); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/admin/integrations/facebook/donation-preview`;
  const payload = { amount: 50, collaborationType: 'dinero', campaignId: null, campaignTitle: null, recognitionName: null, publicationTemplate: 'impacto', publicationImageUrl: null };
  const post = (role, body) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(role ? { 'x-test-role': role } : {}) }, body: JSON.stringify(body) });
  try {
    for (const [role, status] of [[null,401],['moderador',403],['supervisor',403]]) assert.equal((await post(role, payload)).status, status);
    for (const role of ['administrador','superadmin']) {
      const result = await post(role, payload); assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'private, no-store');
      const content = await result.json(); assert.match(content.message, /50[.,]00/); assert.match(content.message, /persona solidaria/);
      assert.equal(content.imageUrl, null); assert.ok(!content.message.includes('/admin'));
    }
    assert.equal((await post('superadmin', { ...payload, publicationTemplate: 'unknown' })).status, 400);
  } finally { await new Promise(r => server.close(r)); }
});
