import { notificationFeedSql } from "../lib/notification-feed-sql";
import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// Public events only. Visibility is rechecked at read time so an archived,
// deleted or unpublished resource never remains accessible through the feed.
router.get("/notifications", async (req, res) => {
  const after = req.query.after === undefined ? 0 : Number(req.query.after);
  if (!Number.isSafeInteger(after) || after < 0) {
    return res.status(400).json({ message: "Cursor inválido" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const { rows } = await pool.query(notificationFeedSql, [after]);
    const items = rows.map((row) => ({
      id: Number(row.id), key: row.key, category: row.kind,
      campaignId: row.campaign_id,
      title: row.kind === "campaign" ? "Nueva campaña" : row.kind === "result" ? "Campaña finalizada"
        : row.kind === "urgent" ? "Caso urgente publicado" : "Aportes confirmados",
      body: row.kind === "urgent" ? "Hay un caso urgente aprobado que necesita apoyo."
        : row.kind === "donation" ? `${row.count} aporte(s) confirmado(s) en ${row.campaign_title}.`
        : row.campaign_title,
      path: row.kind === "urgent" ? "/casos-urgentes" : `/campanas/${row.campaign_id}`,
      createdAt: new Date(row.created_at).toISOString(),
    }));
    // Android loads the last 100 grouped events on each sync and merges by key.
    // `after` is available to other clients, but is not needed by this pilot.
    return res.json({ items });
  } catch (err) {
    req.log.error({ err }, "Failed to load public notifications");
    return res.status(503).json({ message: "No se pudieron consultar las novedades. Reintenta más tarde." });
  }
});

export default router;
