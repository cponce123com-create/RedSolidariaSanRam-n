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
  const { donationPublicationMigrationSql } = await import("../../../lib/db/src/donation-publication-migration.ts");
  const { facebookMigrationSql } = await import("../../../lib/db/src/facebook-migration.ts");
  const { facebookContentMigrationSql } = await import("../../../lib/db/src/facebook-content-migration.ts");
  const schema = `fb_test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Pool({ connectionString: databaseUrl });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const scopedUrl = new URL(databaseUrl); scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = scopedUrl.href;
  const { processFacebookOutbox, readFacebookContent, readFacebookPublication, requestFacebookPublication } = await import("./dist/lib/facebook-outbox.mjs");

  const database = new pg.Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  await database.query(`CREATE TABLE news(id serial PRIMARY KEY,title text,summary text,image_url text);
    CREATE TABLE campaigns(id serial PRIMARY KEY,title text,description text,image_url text,status text,is_demo boolean DEFAULT false);
    CREATE TABLE donations(id serial PRIMARY KEY,campaign_id integer,first_name text DEFAULT 'Nombre privado',last_name text DEFAULT 'Apellido privado',
      email text DEFAULT 'private@example.org',phone text DEFAULT '987654321',receipt_url text DEFAULT 'https://private.example/receipt',admin_note text,
      anonymous boolean NOT NULL DEFAULT false,amount numeric DEFAULT 50,collaboration_type text DEFAULT 'dinero',status text DEFAULT 'pending',fulfillment_status text DEFAULT 'pendiente_coordinacion');
    CREATE TABLE donation_consents(id serial PRIMARY KEY,donation_id integer,scope text,granted boolean,created_at timestamptz DEFAULT now());
    CREATE TABLE donation_items(id serial PRIMARY KEY,donation_id integer,product text,quantity numeric,received_quantity numeric,unit text);
    CREATE TABLE pets(id serial PRIMARY KEY,name text,description text,photos text[],status text DEFAULT 'reviewing',contact_phone text);
    CREATE TABLE community_reports(id serial PRIMARY KEY,title text,description text,photos text[],status text DEFAULT 'pending',reporter_phone text);
    CREATE TABLE campaign_updates(id serial PRIMARY KEY,campaign_id integer,title text,content text);`);
  // Minimal real schema needed by the registration route, including RETURNING columns.
  await database.query(`
    ALTER TABLE donations ADD COLUMN donor_id integer, ADD COLUMN payment_method text DEFAULT 'cash',
      ADD COLUMN message text, ADD COLUMN public_proof boolean DEFAULT false, ADD COLUMN receipt_note text,
      ADD COLUMN reconciled_at timestamp, ADD COLUMN reconciled_by text, ADD COLUMN voided_at timestamp,
      ADD COLUMN voided_by text, ADD COLUMN void_reason text, ADD COLUMN tracking_code text,
      ADD COLUMN dedupe_token text UNIQUE, ADD COLUMN received_at timestamp, ADD COLUMN fulfillment_updated_at timestamp,
      ADD COLUMN fulfillment_updated_by text, ADD COLUMN contact_consent boolean DEFAULT false,
      ADD COLUMN org_name text, ADD COLUMN created_at timestamp NOT NULL DEFAULT now();
    ALTER TABLE donation_consents ADD COLUMN donor_id integer, ADD COLUMN version text,
      ADD COLUMN reason text, ADD COLUMN recorded_by text;
    ALTER TABLE donation_items ADD COLUMN description text, ADD COLUMN estimated_value numeric DEFAULT 0,
      ADD COLUMN photo_url text, ADD COLUMN photo_public_id text, ADD COLUMN created_at timestamp DEFAULT now();
    CREATE TABLE donors(id serial PRIMARY KEY,type text DEFAULT 'individual',name text,email text UNIQUE,phone text,
      is_recurring boolean DEFAULT false,notes text,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now());
    CREATE TABLE donation_proofs(id serial PRIMARY KEY,donation_id integer,image_url text,public_id text,mime_type text,created_at timestamp DEFAULT now());
  `);
  await database.query(donationPublicationMigrationSql);
  await database.query(donationPublicationMigrationSql);
  // Existing content is not sent just because the integration was deployed.
  await database.query("INSERT INTO news(title,summary) VALUES('Historical','Old content')");
  await database.query(facebookMigrationSql);
  assert.equal((await database.query("SELECT * FROM facebook_publications")).rowCount, 0);
  await database.query("INSERT INTO donations(status) VALUES('approved')");
  await database.query(facebookContentMigrationSql);
  await database.query(facebookContentMigrationSql);
  await database.query("UPDATE donations SET admin_note='Cambio privado'");
  assert.equal((await database.query("SELECT * FROM facebook_publications")).rowCount, 0, "migration and private edits never backfill old donations");
  beforeEach(async () => { await database.query("TRUNCATE facebook_publications,news,campaigns,donations,donation_consents,donation_items,donors,donation_proofs,pets,community_reports,campaign_updates RESTART IDENTITY"); });
  after(async () => { await database.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  const env = { FACEBOOK_PAGE_ID: "914513275073067", FACEBOOK_PAGE_ACCESS_TOKEN: "test-only", SITE_URL: "https://example.org" };
  const addNews = async () => (await database.query("INSERT INTO news(title,summary) VALUES('Nueva noticia','Resumen') RETURNING id")).rows[0].id;
  const published = async content => ({ kind: "published", postId: `914513275073067_${content.id}`, postUrl: `https://www.facebook.com/914513275073067_${content.id}` });

  test("registration saves a private proof, public photo consent and template atomically; duplicate retries reuse the same record", async () => {
    const { default: express } = await import("express");
    const { default: router } = await import("./dist/routes/donations.mjs");
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.session = { adminUser: { id: 1, username: "test", role: "superadmin" } }; req.log = { error: (...args) => console.error(...args) }; next(); });
    app.use("/api", router);
    const server = app.listen(0); await new Promise(r => server.once("listening", r));
    const url = `http://127.0.0.1:${server.address().port}/api/donations`;
    const body = { firstName: "Carlos", lastName: "Ponce", email: "registro@example.org", amount: 50,
      paymentMethod: "yape", anonymous: false, contactConsent: true, orgName: "Equipo solidario",
      proofImageUrl: "https://res.cloudinary.com/test/image/upload/private-proof.jpg", proofPublicId: "proof", proofMimeType: "image/jpeg",
      publicationImageUrl: "https://res.cloudinary.com/test/image/upload/public-photo.jpg", publicationImagePublicId: "photo",
      publicPhotoConsent: true, publicationTemplate: "comunidad", dedupeToken: "registration-test-123" };
    const post = data => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    try {
      const response = await post(body); const saved = await response.json();
      assert.equal(response.status, 201, JSON.stringify(saved)); assert.equal(saved.amount, 50);
      assert.equal(saved.receiptUrl, body.proofImageUrl); assert.equal(saved.contactConsent, true);
      assert.equal(saved.orgName, body.orgName); assert.equal(saved.status, "pending");
      const again = await post(body); assert.equal(again.status, 200); assert.equal((await again.json()).id, saved.id);
      assert.equal((await database.query("SELECT * FROM donations")).rowCount, 1);
      assert.equal((await database.query("SELECT * FROM donation_proofs")).rowCount, 1);
      assert.deepEqual((await database.query("SELECT scope FROM donation_consents ORDER BY scope")).rows.map(r => r.scope), ["public_name", "public_photo"]);
      assert.equal((await database.query("SELECT publication_template FROM donations")).rows[0].publication_template, "comunidad");
      assert.equal((await database.query("SELECT * FROM facebook_publications")).rowCount, 0, "registration alone never publishes an unconfirmed contribution");
      const goods = await post({ ...body, dedupeToken: "registration-goods-123", collaborationType: "productos", amount: 999,
        items: [{ product: "arroz", quantity: 3, unit: "kilogramo", estimatedValue: 200 }] });
      assert.equal(goods.status, 201); const item = await goods.json(); assert.equal(item.amount, 0);
      assert.equal((await database.query("SELECT estimated_value FROM donation_items WHERE donation_id=$1", [item.id])).rows[0].estimated_value, "200");
    } finally { await new Promise(r => server.close(r)); }
  });

  test("public photo consent and template are checked at delivery, independently from the private proof", async () => {
    await database.query("INSERT INTO donations(status,publication_template,publication_image_url) VALUES('approved','impacto','https://res.cloudinary.com/test/image/upload/public.jpg')");
    let content = await readFacebookContent("donation", 1, database);
    assert.equal(content.imageUrl, null);
    assert.equal(content.title, "Tu solidaridad se convierte en ayuda");
    await database.query("INSERT INTO donation_consents(donation_id,scope,granted) VALUES(1,'public_photo',true)");
    content = await readFacebookContent("donation", 1, database);
    assert.equal(content.imageUrl, "https://res.cloudinary.com/test/image/upload/public.jpg");
    assert.ok(!JSON.stringify(content).includes("private.example/receipt"));
    await database.query("INSERT INTO donation_consents(donation_id,scope,granted) VALUES(1,'public_photo',false)");
    await processFacebookOutbox(database, async c => { assert.equal(c.imageUrl, null); return published(c); }, env);
    assert.equal((await readFacebookPublication("donation", 1, database)).status, "published");
  });

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

  test("money posts only after confirmation, uses the new-worker lane, and reconciliation does not duplicate", async () => {
    await database.query("INSERT INTO donations DEFAULT VALUES");
    assert.equal((await database.query("SELECT * FROM facebook_publications")).rowCount, 0);
    await database.query("UPDATE donations SET status='approved' WHERE id=1");
    assert.equal((await readFacebookPublication("donation", 1, database)).status, "pending");
    assert.equal((await database.query("SELECT * FROM facebook_publications WHERE status='pending'")).rowCount, 0, "old workers cannot claim new source kinds");
    let sends = 0;
    await processFacebookOutbox(database, async c => { sends++; assert.equal(c.kind, "donation"); return published(c); }, env);
    await database.query("UPDATE donations SET status='reconciled' WHERE id=1");
    await processFacebookOutbox(database, async c => { sends++; return published(c); }, env);
    assert.equal(sends, 1);
  });

  test("latest explicit consent is rechecked and private donation fields never reach a post", async () => {
    await database.query("INSERT INTO donations(status) VALUES('approved'),('approved'),('approved')");
    await database.query("INSERT INTO donation_consents(donation_id,scope,granted) VALUES(1,'public_name',true)");
    assert.ok((await readFacebookContent("donation", 1, database)).summary.includes("Nombre privado"));
    await database.query("INSERT INTO donation_consents(donation_id,scope,granted) VALUES(1,'public_name',false),(2,'public_name',true)");
    await database.query("UPDATE donations SET anonymous=true WHERE id=2");
    const sent = [];
    await processFacebookOutbox(database, async c => { sent.push(c); return published(c); }, env);
    assert.equal(sent.length, 3);
    const payload = JSON.stringify(sent);
    for (const secret of ["Nombre privado", "Apellido privado", "private@example.org", "987654321", "private.example/receipt"]) assert.ok(!payload.includes(secret), secret);
    assert.ok(sent.every(c => c.summary.includes("una persona solidaria")));
  });

  test("in-kind contributions wait for verification and announce received quantities, never estimated cash", async () => {
    await database.query("INSERT INTO donations(status,collaboration_type,fulfillment_status,amount) VALUES('approved','productos','recibida',9999)");
    await database.query("INSERT INTO donation_items(donation_id,product,quantity,received_quantity,unit) VALUES(1,'arroz',100,3.5,'kilogramo')");
    assert.equal((await readFacebookContent("donation", 1, database)), null);
    assert.equal((await database.query("SELECT * FROM facebook_publications")).rowCount, 0);
    await database.query("UPDATE donations SET fulfillment_status='verificada' WHERE id=1");
    const content = await readFacebookContent("donation", 1, database);
    assert.match(content.summary, /3[.,]5 kilogramo de arroz/);
    assert.ok(!content.summary.includes("S/") && !content.summary.includes("9999") && !content.summary.includes("100"));
    assert.equal((await readFacebookPublication("donation", 1, database)).status, "pending");
    await database.query("INSERT INTO donations(collaboration_type,fulfillment_status) VALUES('servicios','verificada')");
    assert.equal((await readFacebookContent("donation", 2, database)), null, "verification alone cannot bypass accounting confirmation");
  });

  test("pets and reports wait for approval; withdrawal cancels before sending", async () => {
    await database.query("INSERT INTO pets(name,description,contact_phone) VALUES('Luna','Busca familia','PRIVATE_PHONE')");
    await database.query("INSERT INTO community_reports(title,description,reporter_phone) VALUES('Caso aprobado','Descripción pública','PRIVATE_REPORTER')");
    assert.equal((await database.query("SELECT * FROM facebook_publications")).rowCount, 0);
    await database.query("UPDATE pets SET status='available' WHERE id=1");
    await database.query("UPDATE community_reports SET status='approved' WHERE id=1");
    assert.ok(!JSON.stringify(await readFacebookContent("pet", 1, database)).includes("PRIVATE_PHONE"));
    assert.ok(!JSON.stringify(await readFacebookContent("report", 1, database)).includes("PRIVATE_REPORTER"));
    await database.query("UPDATE pets SET status='inactive' WHERE id=1");
    await database.query("UPDATE community_reports SET status='archived' WHERE id=1");
    await processFacebookOutbox(database, async () => { throw new Error("must not send withdrawn content"); }, env);
    assert.equal((await readFacebookPublication("pet", 1, database)).status, "cancelled");
    assert.equal((await readFacebookPublication("report", 1, database)).status, "cancelled");
    await database.query("UPDATE pets SET status='available' WHERE id=1");
    assert.equal((await database.query("SELECT status FROM facebook_publications WHERE source_type='pet'")).rows[0].status, "pending_v2");
  });

  test("campaign updates and completion get separate deduplicated announcements with public links", async () => {
    await database.query("INSERT INTO campaigns(title,description,status) VALUES('ChocoFest','Actividad','draft')");
    await database.query("INSERT INTO campaign_updates(campaign_id,title,content) VALUES(1,'Novedad','Avance público')");
    assert.equal((await database.query("SELECT * FROM facebook_publications")).rowCount, 0);
    await database.query("UPDATE campaigns SET status='active' WHERE id=1");
    await database.query("UPDATE campaign_updates SET title='Novedad publicada' WHERE id=1");
    await database.query("UPDATE campaigns SET status='completed' WHERE id=1");
    const sent = [];
    await processFacebookOutbox(database, async c => { sent.push(c); return published(c); }, env);
    assert.deepEqual(sent.map(c => c.kind).sort(), ["campaign_result", "update"]);
    assert.equal(sent.find(c => c.kind === "update").path, "/campanas/1");
    await database.query("UPDATE campaigns SET status='completed' WHERE id=1");
    await processFacebookOutbox(database, async c => { sent.push(c); return published(c); }, env);
    assert.equal(sent.length, 2);
  });

  test("unconfirmed, annulled and demo/hidden campaign donations cannot be queued or sent", async () => {
    await database.query("INSERT INTO campaigns(title,status,is_demo) VALUES('Draft','draft',false),('Demo','active',true)");
    await database.query("INSERT INTO donations(campaign_id,status) VALUES(1,'approved'),(2,'approved'),(NULL,'rejected'),(NULL,'annulled')");
    for (let id = 1; id <= 4; id++) {
      assert.equal(await readFacebookContent("donation", id, database), null);
      assert.equal((await requestFacebookPublication("donation", id, false, database)).ok, false);
    }
    assert.equal((await database.query("SELECT * FROM facebook_publications")).rowCount, 0);
    await database.query("INSERT INTO donations(status) VALUES('approved')");
    await database.query("UPDATE donations SET status='annulled' WHERE id=5");
    await processFacebookOutbox(database, async () => { throw new Error("must not send annulled donation"); }, env);
    assert.equal((await readFacebookPublication("donation", 5, database)).status, "cancelled");
  });
}
