// ─── Aplica los datos reales de la Chocolatada Navideña 2024 a la BD ─────────
// Complementa al seed para BDs que ya tienen la tabla campaigns poblada
// (el seed solo siembra si está vacía). Idempotente: crea/actualiza la
// campaña por título y reemplaza sus donaciones con las de la hoja.
//
// Uso:
//   pnpm --filter @workspace/scripts apply:chocolatada
//
// Los datos viven en artifacts/api-server/src/lib/chocolatada-2024-data.ts
// (fuente única de verdad, compartida con el seed).

import {
  db,
  pool,
  runMigrations,
  campaignsTable,
  donationsTable,
  campaignUpdatesTable,
  campaignImagesTable,
  campaignExpensesTable,
  campaignEvidenceTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  CHOCOLATADA_2024_CAMPAIGN,
  CHOCOLATADA_2024_DONATIONS,
  CHOCOLATADA_2024_EVIDENCE,
  CHOCOLATADA_2024_EXPENSES,
  CHOCOLATADA_2024_IMAGES,
  CHOCOLATADA_2024_TITLE,
  CHOCOLATADA_2024_UPDATES,
} from "../../artifacts/api-server/src/lib/chocolatada-2024-data";

async function tableEmpty(tableName: string): Promise<boolean> {
  const result = await db.execute(
    sql.raw(`SELECT COUNT(*)::int AS n FROM "${tableName}"`),
  );
  const rows = result.rows as Array<{ n: number }>;
  return rows[0]?.n === 0;
}

async function main(): Promise<void> {
  // El esquema de la BD puede estar atrasado (migraciones pendientes): el
  // servidor las aplica al arrancar; aquí hacemos lo mismo para no fallar
  // contra columnas que aún no existen (p.ej. campaigns.latitude).
  await runMigrations();

  // 1) Campaña: crear si no existe, actualizar si existe (por título).
  const existing = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(eq(campaignsTable.title, CHOCOLATADA_2024_TITLE));

  let campaignId: number;
  if (existing[0]) {
    campaignId = existing[0].id;
    await db
      .update(campaignsTable)
      .set({ ...CHOCOLATADA_2024_CAMPAIGN })
      .where(eq(campaignsTable.id, campaignId));
    console.log(`✔ Campaña "${CHOCOLATADA_2024_TITLE}" actualizada (id=${campaignId})`);
  } else {
    const [row] = await db
      .insert(campaignsTable)
      .values({ ...CHOCOLATADA_2024_CAMPAIGN })
      .returning({ id: campaignsTable.id });
    campaignId = row.id;
    console.log(`✔ Campaña "${CHOCOLATADA_2024_TITLE}" creada (id=${campaignId})`);
  }

  // 2) Donaciones: reemplazo idempotente (solo las de esta campaña).
  await db.delete(donationsTable).where(eq(donationsTable.campaignId, campaignId));
  await db.insert(donationsTable).values(
    CHOCOLATADA_2024_DONATIONS.map((d) => ({ ...d, campaignId })),
  );
  const cashTotal = CHOCOLATADA_2024_DONATIONS.reduce((sum, d) => sum + d.amount, 0);
  console.log(
    `✔ ${CHOCOLATADA_2024_DONATIONS.length} donaciones insertadas (efectivo: S/ ${cashTotal})`,
  );

  // 3) Contenido de transparencia: solo si la tabla está vacía (igual que el seed).
  if (await tableEmpty("campaign_updates")) {
    await db.insert(campaignUpdatesTable).values(
      CHOCOLATADA_2024_UPDATES.map((u) => ({ ...u, campaignId })),
    );
    console.log("✔ Actualizaciones insertadas");
  }
  if (await tableEmpty("campaign_images")) {
    await db.insert(campaignImagesTable).values(
      CHOCOLATADA_2024_IMAGES.map((img) => ({ ...img, campaignId })),
    );
    console.log("✔ Galería insertada");
  }
  if (await tableEmpty("campaign_expenses")) {
    await db.insert(campaignExpensesTable).values(
      CHOCOLATADA_2024_EXPENSES.map((e) => ({ ...e, campaignId })),
    );
    console.log("✔ Gastos insertados");
  }
  if (await tableEmpty("campaign_evidence")) {
    await db.insert(campaignEvidenceTable).values(
      CHOCOLATADA_2024_EVIDENCE.map((ev) => ({ ...ev, campaignId })),
    );
    console.log("✔ Evidencias insertadas");
  }

  console.log("Listo.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
