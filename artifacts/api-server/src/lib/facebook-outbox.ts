import { pool } from "@workspace/db";
import { logger } from "./logger";
import { FACEBOOK_SOURCES, facebookPublishConfiguration, sendFacebookPublication, type FacebookContent, type FacebookPublishEnv, type FacebookSource, type FacebookSendResult } from "./facebook-publisher";
import { donationFacebookContent } from "./facebook-public-content";

type Database = Pick<typeof pool, "query">;
interface Job { id: number; source_type: FacebookSource; source_id: number; attempts: number; page_id: string | null }
export interface PublicationStatus {
  status: string; attempts: number; lastError: string | null; postUrl: string | null; publishedAt: Date | null;
}

export async function readFacebookContent(kind: FacebookSource, id: number, database: Database = pool): Promise<FacebookContent | null> {
  if (kind === "donation") {
    // Query by inclusion. Never select receipt URLs, contacts, internal notes or raw names.
    // Recognition requires a positive latest decision AND a non-anonymous donation.
    const { rows } = await database.query(`SELECT d.id,d.amount,d.collaboration_type AS "collaborationType",
      c.id AS "campaignId",c.title AS "campaignTitle",c.image_url AS "campaignImage",
      d.publication_template AS "publicationTemplate",
      CASE WHEN (SELECT dc.granted FROM donation_consents dc WHERE dc.donation_id=d.id AND dc.scope='public_photo'
        ORDER BY dc.created_at DESC,dc.id DESC LIMIT 1) IS TRUE
        THEN d.publication_image_url ELSE NULL END AS "publicationImageUrl",
      CASE WHEN NOT d.anonymous AND (SELECT dc.granted FROM donation_consents dc WHERE dc.donation_id=d.id AND dc.scope='public_name'
        ORDER BY dc.created_at DESC,dc.id DESC LIMIT 1) IS TRUE
        THEN trim(concat_ws(' ',d.first_name,d.last_name)) ELSE NULL END AS "recognitionName"
      FROM donations d LEFT JOIN campaigns c ON c.id=d.campaign_id
      WHERE d.id=$1 AND d.status IN ('approved','reconciled')
        AND ((d.collaboration_type='dinero' AND d.amount>0 AND d.fulfillment_status<>'rechazada_cancelada')
          OR (d.collaboration_type IN ('productos','servicios','logistica') AND d.fulfillment_status='verificada'))
        AND (d.campaign_id IS NULL OR (c.id IS NOT NULL AND c.status IN ('active','paused','completed') AND NOT coalesce(c.is_demo,false)))`, [id]);
    const donation = rows[0];
    if (!donation) return null;
    if (donation.collaborationType === "dinero" && (!Number.isFinite(Number(donation.amount)) || Number(donation.amount) <= 0)) return null;
    const items = donation.collaborationType === "productos" ? await database.query(`SELECT product,received_quantity AS "receivedQuantity",unit
      FROM donation_items WHERE donation_id=$1 AND received_quantity>0 ORDER BY id LIMIT 5`, [id]) : { rows: [] };
    return donationFacebookContent(donation, items.rows);
  }
  const statements: Record<Exclude<FacebookSource, "donation">, string> = {
    news: "SELECT id,title,summary,image_url FROM news WHERE id=$1",
    campaign: "SELECT id,title,description AS summary,image_url FROM campaigns WHERE id=$1 AND status='active' AND NOT coalesce(is_demo,false)",
    pet: "SELECT id,name AS title,description AS summary,photos[1] AS image_url FROM pets WHERE id=$1 AND status='available'",
    report: "SELECT id,title,description AS summary,photos[1] AS image_url FROM community_reports WHERE id=$1 AND status='approved'",
    update: "SELECT u.id,u.title,u.content AS summary,c.image_url,c.id AS campaign_id FROM campaign_updates u JOIN campaigns c ON c.id=u.campaign_id WHERE u.id=$1 AND c.status IN ('active','paused','completed') AND NOT coalesce(c.is_demo,false)",
    campaign_result: "SELECT id,title,image_url FROM campaigns WHERE id=$1 AND status='completed' AND NOT coalesce(is_demo,false)",
  };
  const result = await database.query(statements[kind], [id]);
  const row = result.rows[0];
  if (!row) return null;
  if (kind === "campaign_result") return { kind, id, title: `Finalizó la campaña ${row.title}`, summary: "Gracias por acompañarnos. Consulta los resultados y la rendición de cuentas en nuestra web.", imageUrl: row.image_url };
  return { kind, id: row.id, title: kind === "pet" ? `${row.title} busca una familia` : row.title, summary: row.summary, imageUrl: row.image_url,
    ...(kind === "update" ? { path: `/campanas/${row.campaign_id}` } : {}) };
}

export async function readFacebookPublication(kind: FacebookSource, id: number, database: Database = pool): Promise<PublicationStatus | null> {
  const result = await database.query<PublicationStatus>(`SELECT CASE WHEN status='pending_v2' THEN 'pending' ELSE status END AS status,attempts,last_error AS "lastError",post_url AS "postUrl",published_at AS "publishedAt"
    FROM facebook_publications WHERE source_type=$1 AND source_id=$2`, [kind, id]);
  return result.rows[0] ?? null;
}

export async function requestFacebookPublication(kind: FacebookSource, id: number, confirmNotPublished: boolean, database: Database = pool) {
  if (!await readFacebookContent(kind, id, database)) return { ok: false as const, message: "El contenido no existe o todavía no está confirmado, verificado o aprobado para publicación." };
  const existing = await readFacebookPublication(kind, id, database);
  if (existing?.status === "published") return { ok: false as const, message: "Este contenido ya se publicó en Facebook. No se enviará un duplicado." };
  if (existing?.status === "processing") return { ok: false as const, message: "El envío está en curso. Espera su resultado." };
  if (existing?.status === "uncertain" && !confirmNotPublished) return { ok: false as const, message: "Revisa Facebook y confirma que no existe la publicación antes de reintentar." };
  if (existing) {
    await database.query(`UPDATE facebook_publications SET page_id=CASE WHEN status IN ('failed','cancelled') THEN NULL ELSE page_id END,
      status=CASE WHEN source_type IN ('news','campaign') THEN 'pending' ELSE 'pending_v2' END,next_attempt_at=now(),last_error=NULL,updated_at=now()
      WHERE source_type=$1 AND source_id=$2 AND status = ANY($3::text[]) AND post_id IS NULL`,
      [kind, id, confirmNotPublished ? ["failed", "cancelled", "uncertain"] : ["failed", "cancelled"]]);
  } else await database.query("SELECT enqueue_facebook_publication($1,$2)", [kind, id]);
  return { ok: true as const, publication: await readFacebookPublication(kind, id, database) };
}

export async function processFacebookOutbox(
  database: Database = pool,
  send: (content: FacebookContent, env: FacebookPublishEnv) => Promise<FacebookSendResult> = sendFacebookPublication,
  env: FacebookPublishEnv = process.env,
): Promise<void> {
  // A process may have died after Meta accepted a post. Never blindly resend it.
  await database.query(`UPDATE facebook_publications SET status='uncertain',last_error='El proceso se interrumpió. Revisa Facebook antes de reintentar.',updated_at=now()
    WHERE status='processing' AND last_attempt_at < now() - interval '2 minutes'`);
  const config = facebookPublishConfiguration(env);
  if (!config.enabled) return;
  for (let n = 0; n < 3; n++) {
    const claimed = await database.query<Job>(`UPDATE facebook_publications SET status='processing',attempts=attempts+1,
      page_id=coalesce(page_id,$1),last_attempt_at=now(),updated_at=now()
      WHERE id=(SELECT id FROM facebook_publications WHERE status IN ('pending','pending_v2') AND source_type=ANY($2::text[]) AND next_attempt_at<=now()
        ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id,source_type,source_id,attempts,page_id`, [config.pageId, FACEBOOK_SOURCES]);
    const job = claimed.rows[0];
    if (!job) return;
    let result: FacebookSendResult | { kind: "cancelled"; message: string };
    if (job.page_id !== config.pageId) result = { kind: "failed", message: "La página configurada cambió. Revisa el destino antes de reintentar manualmente este envío." };
    else {
      const content = await readFacebookContent(job.source_type, job.source_id, database);
      result = content ? await send(content, env) : { kind: "cancelled", message: "El contenido fue eliminado, retirado o dejó de cumplir los requisitos de publicación antes del envío." };
    }
    const retry = result.kind === "retry" && job.attempts < 5;
    const pendingStatus = ["news", "campaign"].includes(job.source_type) ? "pending" : "pending_v2";
    const status = result.kind === "retry" ? retry ? pendingStatus : "failed" : result.kind;
    const delaySeconds = Math.min(3600, 30 * 2 ** job.attempts);
    // Fenced update: an expired attempt cannot overwrite a subsequent manual retry.
    await database.query(`UPDATE facebook_publications SET status=$2,post_id=$3,post_url=$4,last_error=$5,
      published_at=CASE WHEN $2='published' THEN now() ELSE published_at END,
      next_attempt_at=now()+($6 * interval '1 second'),updated_at=now()
      WHERE id=$1 AND status='processing' AND attempts=$7`, [job.id, status,
      result.kind === "published" ? result.postId : null, result.kind === "published" ? result.postUrl : null,
      result.kind === "published" ? null : result.message, delaySeconds, job.attempts]);
  }
}

export function startFacebookPublisher(): () => void {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await processFacebookOutbox(); }
    catch { logger.error("Facebook queue could not be processed; pending deliveries remain in the database"); }
    finally { running = false; }
  };
  const timer = setInterval(() => void run(), 15_000);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
