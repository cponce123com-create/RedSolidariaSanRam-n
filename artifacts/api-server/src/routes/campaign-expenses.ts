import { Router, type IRouter } from "express";
import { db, campaignExpensesTable, insertCampaignExpenseSchema } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { adminActionLimiter } from "../middleware/rate-limit";

const router: IRouter = Router();

router.get("/campaigns/:id/expenses", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const { publicOnly } = req.query;
    let expenses = await db
      .select()
      .from(campaignExpensesTable)
      .where(eq(campaignExpensesTable.campaignId, campaignId));
    if (publicOnly === "true") {
      expenses = expenses.filter((e) => e.isPublic);
    }
    res.json(expenses.map(formatExpense).reverse());
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign expenses");
    res.status(500).json({ error: "server_error", message: "Failed to get expenses" });
  }
});

router.post(
  "/campaigns/:id/expenses",
  requireAdmin,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const data = insertCampaignExpenseSchema.parse({ ...req.body, campaignId });
      const [expense] = await db.insert(campaignExpensesTable).values(data).returning();
      res.status(201).json(formatExpense(expense));
    } catch (err) {
      req.log.error({ err }, "Failed to create campaign expense");
      res.status(400).json({ error: "validation_error", message: "Invalid expense data" });
    }
  },
);

router.put(
  "/campaigns/:id/expenses/:expenseId",
  requireAdmin,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const expenseId = Number(req.params.expenseId);
      const data = insertCampaignExpenseSchema.parse({ ...req.body, campaignId });
      const [expense] = await db
        .update(campaignExpensesTable)
        .set(data)
        .where(and(eq(campaignExpensesTable.id, expenseId), eq(campaignExpensesTable.campaignId, campaignId)))
        .returning();
      if (!expense) return res.status(404).json({ error: "not_found", message: "Expense not found" });
      return res.json(formatExpense(expense));
    } catch (err) {
      req.log.error({ err }, "Failed to update campaign expense");
      return res.status(400).json({ error: "validation_error", message: "Invalid expense data" });
    }
  },
);

router.delete(
  "/campaigns/:id/expenses/:expenseId",
  requireAdmin,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const expenseId = Number(req.params.expenseId);
      await db
        .delete(campaignExpensesTable)
        .where(and(eq(campaignExpensesTable.id, expenseId), eq(campaignExpensesTable.campaignId, campaignId)));
      res.status(204).send();
    } catch (err) {
      req.log.error({ err }, "Failed to delete campaign expense");
      res.status(500).json({ error: "server_error", message: "Failed to delete expense" });
    }
  },
);

function formatExpense(e: typeof campaignExpensesTable.$inferSelect) {
  return {
    id: e.id,
    campaignId: e.campaignId,
    description: e.description,
    category: e.category,
    amount: e.amount,
    date: e.date,
    responsible: e.responsible,
    observations: e.observations,
    receiptUrl: e.receiptUrl,
    receiptType: e.receiptType,
    isPublic: e.isPublic,
    createdAt: e.createdAt.toISOString(),
  };
}

export default router;
