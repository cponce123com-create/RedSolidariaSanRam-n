import { Router, type IRouter } from "express";
import { db, newsTable, insertNewsSchema } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/news", async (req, res) => {
  try {
    const posts = await db.select().from(newsTable).orderBy(newsTable.createdAt);
    res.json(posts.map(formatNews).reverse());
  } catch (err) {
    req.log.error({ err }, "Failed to get news");
    res.status(500).json({ error: "server_error", message: "Failed to get news" });
  }
});

router.get("/news/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [post] = await db.select().from(newsTable).where(eq(newsTable.id, id));
    if (!post) {
      return res.status(404).json({ error: "not_found", message: "News post not found" });
    }
    res.json(formatNews(post));
  } catch (err) {
    req.log.error({ err }, "Failed to get news post");
    res.status(500).json({ error: "server_error", message: "Failed to get news post" });
  }
});

router.post("/news", async (req, res) => {
  try {
    const data = insertNewsSchema.parse(req.body);
    const [post] = await db.insert(newsTable).values(data).returning();
    res.status(201).json(formatNews(post));
  } catch (err) {
    req.log.error({ err }, "Failed to create news post");
    res.status(400).json({ error: "validation_error", message: "Invalid news data" });
  }
});

router.put("/news/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertNewsSchema.parse(req.body);
    const [post] = await db.update(newsTable).set(data).where(eq(newsTable.id, id)).returning();
    if (!post) {
      return res.status(404).json({ error: "not_found", message: "News post not found" });
    }
    res.json(formatNews(post));
  } catch (err) {
    req.log.error({ err }, "Failed to update news post");
    res.status(400).json({ error: "validation_error", message: "Invalid news data" });
  }
});

router.delete("/news/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(newsTable).where(eq(newsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete news post");
    res.status(500).json({ error: "server_error", message: "Failed to delete news post" });
  }
});

function formatNews(n: typeof newsTable.$inferSelect) {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    summary: n.summary,
    imageUrl: n.imageUrl,
    publishedAt: n.publishedAt,
    createdAt: n.createdAt.toISOString(),
  };
}

export default router;
