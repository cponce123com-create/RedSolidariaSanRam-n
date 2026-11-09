import { test } from "node:test";
import assert from "node:assert/strict";
import { facebookMessage, facebookPublishConfiguration, sendFacebookPublication } from "./dist/lib/facebook-publisher.mjs";

const env = { FACEBOOK_PAGE_ID: "914513275073067", FACEBOOK_PAGE_ACCESS_TOKEN: "test-secret-not-real", SITE_URL: "https://redsolidariasanram-n.onrender.com" };
const news = { kind: "news", id: 10, title: "Una noticia", summary: "Lo que hacemos" };
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
function meta(write) {
  return async (url, options) => options.method === "GET"
    ? response({ id: env.FACEBOOK_PAGE_ID, name: "Red Solidaria San Ramón" }) : write(url, options);
}

test("publication requires valid credentials, public HTTPS site URL and activation", () => {
  assert.equal(facebookPublishConfiguration(env).enabled, true);
  for (const override of [{ SITE_URL: "http://site.example" }, { SITE_URL: "https://site.example/private" }, { SITE_URL: "https://localhost" }, { FACEBOOK_PAGE_ID: "url" }, { FACEBOOK_PAGE_ACCESS_TOKEN: "" }, { FACEBOOK_AUTO_PUBLISH_ENABLED: "false" }]) {
    assert.equal(facebookPublishConfiguration({ ...env, ...override }).enabled, false);
  }
});

test("message uses the right public detail URL and removes markup", () => {
  assert.equal(facebookMessage(news, env.SITE_URL).link, `${env.SITE_URL}/noticias/10`);
  assert.equal(facebookMessage({ ...news, kind: "campaign", summary: "<p>Campaña</p>" }, env.SITE_URL).link, `${env.SITE_URL}/campanas/10`);
  assert.ok(!facebookMessage({ ...news, title: "<b>Título</b>" }, env.SITE_URL).message.includes("<b>"));
});

test("text publication uses one POST and keeps the secret out of URL/body/result", async () => {
  let writes = 0;
  const result = await sendFacebookPublication(news, env, meta(async (url, options) => {
    writes++;
    assert.equal(url, `https://graph.facebook.com/v27.0/${env.FACEBOOK_PAGE_ID}/feed`);
    assert.equal(options.headers.Authorization, `Bearer ${env.FACEBOOK_PAGE_ACCESS_TOKEN}`);
    assert.ok(!options.body.toString().includes(env.FACEBOOK_PAGE_ACCESS_TOKEN));
    assert.equal(options.body.get("link"), `${env.SITE_URL}/noticias/10`);
    assert.equal(options.redirect, "error");
    return response({ id: "914513275073067_123" });
  }));
  assert.equal(writes, 1);
  assert.equal(result.kind, "published");
  assert.equal(result.postUrl, "https://www.facebook.com/914513275073067_123");
  assert.ok(!JSON.stringify(result).includes(env.FACEBOOK_PAGE_ACCESS_TOKEN));
});

test("image publication sends a photo with caption and website link", async () => {
  const result = await sendFacebookPublication({ ...news, imageUrl: "https://images.example/photo.jpg" }, env, meta(async (url, options) => {
    assert.ok(url.endsWith("/photos"));
    assert.equal(options.body.get("url"), "https://images.example/photo.jpg");
    assert.ok(options.body.get("caption").includes(`${env.SITE_URL}/noticias/10`));
    return response({ id: "123", post_id: "914513275073067_456" });
  }));
  assert.equal(result.postId, "914513275073067_456");
});

test("wrong identity prevents any write", async () => {
  let writes = 0;
  const result = await sendFacebookPublication(news, env, async (_url, options) => {
    if (options.method === "POST") writes++;
    return response({ id: "999", name: "Otra página" });
  });
  assert.equal(result.kind, "failed");
  assert.equal(writes, 0);
});

test("timeouts, invalid responses and server errors are uncertain, never blind retries", async () => {
  for (const write of [async () => { throw new Error(env.FACEBOOK_PAGE_ACCESS_TOKEN); }, async () => response({}), async () => response({ error: { code: 2 } }, 500), async () => new Response("broken")]) {
    const result = await sendFacebookPublication(news, env, meta(write));
    assert.equal(result.kind, "uncertain");
    assert.ok(!JSON.stringify(result).includes(env.FACEBOOK_PAGE_ACCESS_TOKEN));
  }
});

test("explicit throttling can retry, token or permission rejection needs intervention", async () => {
  for (const [http, code, expected] of [[429, 4, "retry"], [400, 613, "retry"], [400, 190, "failed"], [403, 200, "failed"], [400, 100, "failed"]]) {
    const result = await sendFacebookPublication(news, env, meta(async () => response({ error: { code, message: env.FACEBOOK_PAGE_ACCESS_TOKEN } }, http)));
    assert.equal(result.kind, expected);
    assert.ok(!JSON.stringify(result).includes(env.FACEBOOK_PAGE_ACCESS_TOKEN));
  }
});

test("configuration diagnosis names only missing settings, never secrets", () => {
  const config = facebookPublishConfiguration({ ...env, SITE_URL: "", FACEBOOK_AUTO_PUBLISH_ENABLED: "false" });
  assert.equal(config.enabled, false);
  assert.ok(config.issues.some(x => x.includes('SITE_URL')));
  assert.ok(config.issues.some(x => x.includes('pausada')));
  assert.ok(!JSON.stringify(config.issues).includes(env.FACEBOOK_PAGE_ACCESS_TOKEN));
});
test("Meta rejection preserves safe numeric codes while withholding its raw message", async () => {
  const result = await sendFacebookPublication(news, env, meta(async () => response({ error: { code: 190, error_subcode: 463, message: env.FACEBOOK_PAGE_ACCESS_TOKEN } }, 400)));
  assert.equal(result.kind, 'failed'); assert.match(result.message, /190/); assert.match(result.message, /463/);
  assert.match(result.message, /FACEBOOK_PAGE_ACCESS_TOKEN/);
  assert.ok(!result.message.includes(env.FACEBOOK_PAGE_ACCESS_TOKEN));
});
