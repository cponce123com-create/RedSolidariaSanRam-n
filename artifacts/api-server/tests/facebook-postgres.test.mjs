import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

const databaseUrl = process.env.FACEBOOK_OUTBOX_TEST_DATABASE_URL;
if (!databaseUrl) {
  test("Facebook outbox PostgreSQL integration (requires dedicated test database)", { skip: true }, () => {});
} else {
  const pg = createRequire(new URL("../../../lib/db/package.json", import.meta.url))("pg");
  const target = new URL(databaseUrl);
  if (!["127.0.0.1", "localhost"].includes(target.hostname) || !target.pathname.endsWith("_test")) throw new Error("Use a dedicated local database ending in _test");
  process.env.DATABASE_URL ??= databaseUrl;
  const { facebookMigrationSql } = await import("../../../lib/db/src/facebook-migration.ts");
  const { processFacebookOutbox, readFacebookPublication, requestFacebookPublication } = await import("./dist/lib/facebook-outbox.mjs");
  const schema = `fb_test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Pool({ connectionString: databaseUrl });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const database = new pg.Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  await database.query(`CREATE TABLE news(id serial PRIMARY KEY,title text,summary text,image_url text);
    CREATE TABLE campaigns(id serial PRIMARY KEY,title text,description text,image_url text,status text,is_demo boolean DEFAULT false);`);
  // Existing content is not sent just because the integration was deployed.
  await database.query("INSERT INTO news(title,summary) VALUES('Historical','Old content')");
  await database.query(facebookMigrationSql);
  assert.equal((await database.query("SELECT * FROM facebook_publications")).rowCount, 0);
  beforeEach(async () => { await database.query("TRUNCATE facebook_publications,news,campaigns RESTART IDENTITY"); });
  after(async () => { await database.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  const env = { FACEBOOK_PAGE_ID: "914513275073067", FACEBOOK_PAGE_ACCESS_TOKEN: "test-only", SITE_URL: "https://example.org" };
  const addNews = async () => (await database.query("INSERT INTO news(title,summary) VALUES('Nueva noticia','Resumen') RETURNING id")).rows[0].id;
  const published = async content => ({ kind: "published", postId: `914513275073067_${content.id}`, postUrl: `https://www.facebook.com/914513275073067_${content.id}` });

  test("source insert and queue insert commit or roll back together", async () => {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO news(title,summary) VALUES('Rollback','No publicar')");
      await client.query("ROLLBACK");
      assert.equal((await database.query("SELECT * FROM facebook_publications")).rowCount, 0);
    } finally { client.release(); }
    const id = await addNews();
    assert.equal((await readFacebookPublication("news", id, database)).status, "pending");
  });

  test("draft and demo campaigns do not queue; activating queues once and editing never duplicates", async () => {
    await database.query("INSERT INTO campaigns(title,description,status,is_demo) VALUES('Draft','Texto','draft',false),('Demo','Texto','active',true)");
    assert.equal((await database.query("SELECT * FROM facebook_publications")).rowCount, 0);
    await database.query("UPDATE campaigns SET status='active' WHERE id=1");
    let sends = 0;
    await processFacebookOutbox(database, async c => { sends++; return published(c); }, env);
    await database.query("UPDATE campaigns SET title='Cambio',status='active' WHERE id=1");
    await processFacebookOutbox(database, async c => { sends++; return published(c); }, env);
    assert.equal(sends, 1);
    assert.equal((await readFacebookPublication("campaign", 1, database)).status, "published");
  });

  test("two workers claim disjoint jobs and restart does not resend successes", async () => {
    for (let i = 0; i < 5; i++) await addNews();
    const sent = [];
    const send = async c => { sent.push(c.id); await new Promise(r => setTimeout(r, 10)); return published(c); };
    await Promise.all([processFacebookOutbox(database, send, env), processFacebookOutbox(database, send, env)]);
    await processFacebookOutbox(database, send, env);
    assert.equal(sent.length, 5);
    assert.equal(new Set(sent).size, 5);
  });

  test("a lost response or abandoned job never retries without explicit review", async () => {
    const id = await addNews();
    let calls = 0;
    await processFacebookOutbox(database, async () => { calls++; return { kind: "uncertain", message: "Review first" }; }, env);
    await processFacebookOutbox(database, async c => { calls++; return published(c); }, env);
    assert.equal(calls, 1);
    assert.equal((await requestFacebookPublication("news", id, false, database)).ok, false);
    assert.equal((await requestFacebookPublication("news", id, true, database)).ok, true);
    await processFacebookOutbox(database, published, env);
    assert.equal((await readFacebookPublication("news", id, database)).status, "published");
    assert.equal((await requestFacebookPublication("news", id, true, database)).ok, false);
    const abandoned = await addNews();
    await database.query("UPDATE facebook_publications SET status='processing',last_attempt_at=now()-interval '5 minutes' WHERE source_id=$1", [abandoned]);
    await processFacebookOutbox(database, async () => { throw new Error("must not send"); }, env);
    assert.equal((await readFacebookPublication("news", abandoned, database)).status, "uncertain");
  });

  test("deleted or withdrawn content is cancelled; reactivation can enqueue it again", async () => {
    const id = await addNews();
    await database.query("DELETE FROM news WHERE id=$1", [id]);
    await processFacebookOutbox(database, async () => { throw new Error("must not send deleted content"); }, env);
    assert.equal((await readFacebookPublication("news", id, database)).status, "cancelled");
    await database.query("INSERT INTO campaigns(title,description,status) VALUES('Campaña','Texto','active')");
    await database.query("UPDATE campaigns SET status='draft' WHERE id=1");
    await processFacebookOutbox(database, async () => { throw new Error("must not send draft"); }, env);
    assert.equal((await readFacebookPublication("campaign", 1, database)).status, "cancelled");
    await database.query("UPDATE campaigns SET status='active' WHERE id=1");
    assert.equal((await readFacebookPublication("campaign", 1, database)).status, "pending");
  });

  test("safe retries have a limit, attempts remain monotonic, and configuration can pause delivery", async () => {
    const id = await addNews();
    let calls = 0;
    const rateLimited = async () => { calls++; return { kind: "retry", message: "rate limited" }; };
    await processFacebookOutbox(database, rateLimited, { ...env, FACEBOOK_AUTO_PUBLISH_ENABLED: "false" });
    assert.equal(calls, 0);
    for (let i = 0; i < 5; i++) {
      await database.query("UPDATE facebook_publications SET next_attempt_at=now()");
      await processFacebookOutbox(database, rateLimited, env);
    }
    assert.equal(calls, 5);
    const failed = await readFacebookPublication("news", id, database);
    assert.equal(failed.status, "failed");
    await requestFacebookPublication("news", id, false, database);
    await processFacebookOutbox(database, published, env);
    assert.equal((await readFacebookPublication("news", id, database)).attempts, 6);
  });
}
