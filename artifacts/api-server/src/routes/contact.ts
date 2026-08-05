import { Router, type IRouter } from "express";
import { db, contactMessagesTable, insertContactMessageSchema } from "@workspace/db";
import { desc } from "drizzle-orm";
import { contactLimiter } from "../middleware/rate-limit";
import { requireAdmin } from "../middleware/require-admin";

const router: IRouter = Router();

router.post("/contact", contactLimiter, async (req, res) => {
  try {
    const data = insertContactMessageSchema.parse(req.body);
    const [message] = await db.insert(contactMessagesTable).values(data).returning();
    res.status(201).json(formatMessage(message));
  } catch (err) {
    req.log.error({ err }, "Failed to save contact message");
    res.status(400).json({ error: "validation_error", message: "Invalid contact data" });
  }
});

// GET /contact/messages — solo admin (contiene datos personales)
router.get("/contact/messages", requireAdmin, async (req, res) => {
  try {
    const messages = await db
      .select()
      .from(contactMessagesTable)
      .orderBy(desc(contactMessagesTable.createdAt));
    res.json(messages.map(formatMessage));
  } catch (err) {
    req.log.error({ err }, "Failed to get contact messages");
    res.status(500).json({ error: "server_error", message: "Failed to get messages" });
  }
});

function formatMessage(m: typeof contactMessagesTable.$inferSelect) {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    message: m.message,
    subject: m.subject,
    createdAt: m.createdAt.toISOString(),
  };
}

export default router;
