import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { checkFacebookConnection } from "./dist/lib/facebook.mjs";
import facebookRouter from "./dist/routes/facebook.mjs";

const token = "fake-token-for-tests-only";
const env = { FACEBOOK_PAGE_ID: "914513275073067", FACEBOOK_PAGE_ACCESS_TOKEN: token };
const page = { id: env.FACEBOOK_PAGE_ID, name: "Red Solidaria San Ramón" };
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status });

test("missing or invalid configuration never calls Meta", async () => {
  const noRequest = async () => { throw new Error("must not call Meta"); };
  assert.equal((await checkFacebookConnection({}, noRequest)).status, "not_configured");
  assert.equal((await checkFacebookConnection({ FACEBOOK_PAGE_ID: env.FACEBOOK_PAGE_ID }, noRequest)).status, "not_configured");
  assert.equal((await checkFacebookConnection({ ...env, FACEBOOK_PAGE_ID: "not-an-id" }, noRequest)).status, "invalid_configuration");
});

test("identity check is GET-only, uses a bearer header, and only returns whitelisted page fields", async () => {
  let calls = 0;
  const result = await checkFacebookConnection(env, async (url, options) => {
    calls++;
    assert.equal(String(url), "https://graph.facebook.com/v27.0/me?fields=id,name");
    assert.ok(!String(url).includes(token));
    assert.equal(options.method, "GET");
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return reply({ ...page, access_token: token, secret: token });
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "connected");
  assert.deepEqual(result.page, page);
  assert.equal(result.publishingVerified, false);
  assert.ok(!JSON.stringify(result).includes(token));
});

test("a user token or another Page cannot pass the expected Page identity", async () => {
  const result = await checkFacebookConnection(env, async () => reply({ id: "123", name: "Other identity" }));
  assert.equal(result.status, "wrong_page");
  assert.equal(result.page, undefined);
});

test("expired/revoked tokens and missing permissions return safe actionable states", async () => {
  for (const [code, status] of [[190, "invalid_token"], [200, "permission_denied"], [10, "permission_denied"], [999, "unavailable"]]) {
    const result = await checkFacebookConnection(env, async () => reply({ error: { code, message: token } }, 400));
    assert.equal(result.status, status);
    assert.ok(!JSON.stringify(result).includes(token));
  }
});

test("network failures and invalid payloads never disclose credentials or claim connection", async () => {
  for (const request of [async () => { throw new Error(token); }, async () => new Response("not-json"), async () => reply({ id: page.id }), async () => reply(null)]) {
    const result = await checkFacebookConnection(env, request);
    assert.equal(result.status, "unavailable");
    assert.ok(!JSON.stringify(result).includes(token));
  }
});

test("diagnostic route requires superadmin and returns a private response", async () => {
  const app = express();
  app.use((req, _res, next) => {
    const role = req.headers["x-test-role"];
    if (role) req.session = { adminUser: { id: 1, role } };
    next();
  });
  app.use("/api", facebookRouter);
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/admin/integrations/facebook/status`;
  const previousId = process.env.FACEBOOK_PAGE_ID;
  const previousToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const realFetch = globalThis.fetch;
  let metaCalls = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://graph.facebook.com/")) { metaCalls++; return reply(page); }
    return realFetch(url, init);
  };
  try {
    process.env.FACEBOOK_PAGE_ID = env.FACEBOOK_PAGE_ID;
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = token;
    assert.equal((await realFetch(base)).status, 401);
    for (const role of ["moderador", "administrador", "supervisor"]) {
      assert.equal((await realFetch(base, { headers: { "x-test-role": role } })).status, 403);
    }
    assert.equal(metaCalls, 0);
    const response = await realFetch(base, { headers: { "x-test-role": "superadmin" } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json();
    assert.equal(body.status, "connected");
    assert.deepEqual(body.page, page);
    assert.ok(!JSON.stringify(body).includes(token));
    assert.equal(metaCalls, 1);
  } finally {
    globalThis.fetch = realFetch;
    if (previousId === undefined) delete process.env.FACEBOOK_PAGE_ID;
    else process.env.FACEBOOK_PAGE_ID = previousId;
    if (previousToken === undefined) delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    else process.env.FACEBOOK_PAGE_ACCESS_TOKEN = previousToken;
    await new Promise(resolve => server.close(resolve));
  }
});
