import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// PGlite is only used by the local scratch runner; CI uses PostgreSQL 16.
const usePglite = process.env.NOTIFICATIONS_PGLITE_MODULE;
const connectionString = process.env.NOTIFICATIONS_TEST_DATABASE_URL;
const loadSql = async (relative) => {
  const source = await readFile(new URL(relative, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
};

test("important notifications: transitions, privacy, dedupe, grouping and transaction rollback", {
  skip: !connectionString && !usePglite,
}, async () => {
  let client;
  if (usePglite) {
    const { PGlite } = await import(usePglite);
    client = new PGlite();
  } else {
    const { default: pg } = await import("pg");
    client = new pg.Client({ connectionString });
    await client.connect();
  }
  const schema = `notice_test_${Date.now()}`;
  const query = (sql, args) => client.query(sql, args);
  try {
    await query(`CREATE SCHEMA ${schema}`);
    await query(`SET search_path TO ${schema}`);
    // Isolated fixture schema: never writes into production tables.
    await query("CREATE TABLE campaigns(id serial PRIMARY KEY, title text, status text, is_demo boolean DEFAULT false)");
    await query("CREATE TABLE community_reports(id serial PRIMARY KEY, title text, status text, urgency text)");
    await query("CREATE TABLE donations(id serial PRIMARY KEY, campaign_id integer, status text)");
    const { notificationMigrationSql } = await loadSql("../src/notification-migration.ts");
    // Both drivers accept multiple SQL statements via exec/simple query.
    if (usePglite) await client.exec(notificationMigrationSql);
    else await query(notificationMigrationSql);
    await query("INSERT INTO campaigns(title,status) VALUES ('Campaña real','draft')");
    assert.equal((await query("SELECT * FROM public_notifications")).rows.length, 0);
    await query("UPDATE campaigns SET status='active' WHERE id=1");
    await query("UPDATE campaigns SET title='Título corregido' WHERE id=1");
    assert.equal((await query("SELECT * FROM public_notifications WHERE kind='campaign'")).rows.length, 1);
    await query("INSERT INTO donations(campaign_id,status) VALUES (1,'pending')");
    assert.equal((await query("SELECT * FROM public_notifications WHERE kind='donation'")).rows.length, 0);
    await query("UPDATE donations SET status='approved' WHERE id=1");
    await query("UPDATE donations SET status='reconciled' WHERE id=1");
    assert.equal((await query("SELECT * FROM public_notifications WHERE kind='donation'")).rows.length, 1);
    await query("INSERT INTO donations(campaign_id,status) VALUES (1,'approved')");
    const { notificationFeedSql } = await loadSql("../../../artifacts/api-server/src/lib/notification-feed-sql.ts");
    let feed = (await query(notificationFeedSql, [0])).rows;
    assert.equal(feed.filter(n => n.kind === 'donation').length, 1);
    assert.equal(feed.find(n => n.kind === 'donation').count, 2);
    // The feed only selects generic metadata, never donor names or receipts.
    assert.deepEqual(Object.keys(feed[0]).sort(), ['campaign_id','campaign_title','count','created_at','id','key','kind'].sort());
    await query("UPDATE donations SET status='annulled' WHERE id=1");
    assert.equal((await query(notificationFeedSql, [0])).rows.find(n => n.kind === 'donation').count, 1);
    await query("INSERT INTO community_reports(title,status,urgency) VALUES ('Privado','pending','critical')");
    assert.equal((await query(notificationFeedSql, [0])).rows.some(n => n.kind === 'urgent'), false);
    await query("UPDATE community_reports SET status='approved' WHERE id=1");
    assert.equal((await query(notificationFeedSql, [0])).rows.filter(n => n.kind === 'urgent').length, 1);
    await query("UPDATE community_reports SET status='archived' WHERE id=1");
    assert.equal((await query(notificationFeedSql, [0])).rows.some(n => n.kind === 'urgent'), false);
    await query("UPDATE campaigns SET status='completed' WHERE id=1");
    assert.equal((await query(notificationFeedSql, [0])).rows.filter(n => n.kind === 'result').length, 1);
    await query("UPDATE campaigns SET status='archived' WHERE id=1");
    assert.equal((await query(notificationFeedSql, [0])).rows.length, 0);
    await query("INSERT INTO campaigns(title,status,is_demo) VALUES ('Demo','active',true)");
    assert.equal((await query(notificationFeedSql, [0])).rows.length, 0);
    await query("BEGIN");
    await query("INSERT INTO campaigns(title,status) VALUES ('Nunca publicada','active')");
    await query("ROLLBACK");
    assert.equal((await query(notificationFeedSql, [0])).rows.length, 0);
    await query("DELETE FROM campaigns WHERE id=1");
    assert.equal((await query("SELECT * FROM public_notifications WHERE campaign_id=1")).rows.length, 0);
  } finally {
    await query(`DROP SCHEMA ${schema} CASCADE`);
    if (usePglite) await client.close(); else await client.end();
  }
});
