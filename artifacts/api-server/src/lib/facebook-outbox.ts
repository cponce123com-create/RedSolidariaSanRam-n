import { pool } from "@workspace/db";
import { logger } from "./logger";
import { facebookPublishConfiguration, sendFacebookPublication, type FacebookContent, type FacebookPublishEnv, type FacebookSource, type FacebookSendResult } from "./facebook-publisher";

type Database = Pick<typeof pool, "query">;
interface Job { id: number; source_type: FacebookSource; source_id: number; attempts: number; page_id: string | null }
export interface PublicationStatus {
  status: string; attempts: number; lastError: string | null; postUrl: string | null; publishedAt: Date | null;
}

export async function readFacebookContent(kind: FacebookSource, id: number, database: Database = pool): Promise<FacebookContent | null> {
  const result = kind === "news"
    ? await database.query("SELECT id,title,summary,image_url FROM news WHERE id=$1", [id])
    : await database.query("SELECT id,title,description AS summary,image_url FROM campaigns WHERE id=$1 AND status='active' AND NOT coalesce(is_demo,false)", [id]);
  const row = result.rows[0];
  return row ? { kind, id: row.id, title: row.title, summary: row.summary, imageUrl: row.image_url } : null;
}

export async function readFacebookPublication(kind: FacebookSource, id: number, database: Database = pool): Promise<PublicationStatus | null> {
  const result = await database.query<PublicationStatus>(`SELECT status,attempts,last_error AS "lastError",post_url AS "postUrl",published_at AS "publishedAt"
    FROM facebook_publications WHERE source_type=$1 AND source_id=$2`, [kind, id]);
  return result.rows[0] ?? null;
}

export async function requestFacebookPublication(kind: FacebookSource, id: number, confirmNotPublished: boolean, database: Database = pool) {
  if (!await readFacebookContent(kind, id, database)) return { ok: false as const, message: "El contenido no existe o la campaña no está activa/publicable." };
  const existing = await readFacebookPublication(kind, id, database);
  if (existing?.status === "published") return { ok: false as const, message: "Este contenido ya se publicó en Facebook. No se enviará un duplicado." };
  if (existing?.status === "processing") return { ok: false as const, message: "El envío está en curso. Espera su resultado." };
  if (existing?.status === "uncertain" && !confirmNotPublished) return { ok: false as const, message: "Revisa Facebook y confirma que no existe la publicación antes de reintentar." };
  if (existing) {
    await database.query(`UPDATE facebook_publications SET page_id=CASE WHEN status IN ('failed','cancelled') THEN NULL ELSE page_id END,
      status='pending',next_attempt_at=now(),last_error=NULL,updated_at=now()
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
      WHERE id=(SELECT id FROM facebook_publications WHERE status='pending' AND next_attempt_at<=now()
        ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id,source_type,source_id,attempts,page_id`, [config.pageId]);
    const job = claimed.rows[0];
    if (!job) return;
    let result: FacebookSendResult | { kind: "cancelled"; message: string };
    if (job.page_id !== config.pageId) result = { kind: "failed", message: "La página configurada cambió. Revisa el destino antes de reintentar manualmente este envío." };
    else {
      const content = await readFacebookContent(job.source_type, job.source_id, database);
      result = content ? await send(content, env) : { kind: "cancelled", message: "El contenido fue eliminado o la campaña dejó de estar activa antes del envío." };
    }
    const retry = result.kind === "retry" && job.attempts < 5;
    const status = result.kind === "retry" ? retry ? "pending" : "failed" : result.kind;
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
