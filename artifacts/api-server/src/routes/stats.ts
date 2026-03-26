import { Router, type IRouter } from "express";
import { db, statsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const STAT_KEYS = ["childrenHelped", "campaignsRun", "volunteers", "donationsReceived", "animalsHelped"];

router.get("/stats", async (req, res) => {
  try {
    const rows = await db.select().from(statsTable);
    const statsMap: Record<string, number> = {};
    for (const row of rows) {
      statsMap[row.key] = row.floatValue ?? row.intValue ?? 0;
    }
    const stats = {
      childrenHelped: statsMap["childrenHelped"] ?? 0,
      campaignsRun: statsMap["campaignsRun"] ?? 0,
      volunteers: statsMap["volunteers"] ?? 0,
      donationsReceived: statsMap["donationsReceived"] ?? 0,
      animalsHelped: statsMap["animalsHelped"] ?? 0,
    };
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Failed to get stats");
    res.status(500).json({ error: "server_error", message: "Failed to get stats" });
  }
});

router.put("/stats", async (req, res) => {
  try {
    const { childrenHelped, campaignsRun, volunteers, donationsReceived, animalsHelped } = req.body;
    const updates: Record<string, number> = {
      childrenHelped: Number(childrenHelped) || 0,
      campaignsRun: Number(campaignsRun) || 0,
      volunteers: Number(volunteers) || 0,
      donationsReceived: Number(donationsReceived) || 0,
      animalsHelped: Number(animalsHelped) || 0,
    };
    for (const [key, value] of Object.entries(updates)) {
      const existing = await db.select().from(statsTable).where(eq(statsTable.key, key));
      if (existing.length > 0) {
        if (key === "donationsReceived") {
          await db.update(statsTable).set({ floatValue: value }).where(eq(statsTable.key, key));
        } else {
          await db.update(statsTable).set({ intValue: Math.round(value) }).where(eq(statsTable.key, key));
        }
      } else {
        if (key === "donationsReceived") {
          await db.insert(statsTable).values({ key, floatValue: value });
        } else {
          await db.insert(statsTable).values({ key, intValue: Math.round(value) });
        }
      }
    }
    res.json(updates);
  } catch (err) {
    req.log.error({ err }, "Failed to update stats");
    res.status(400).json({ error: "validation_error", message: "Invalid stats data" });
  }
});

export default router;
