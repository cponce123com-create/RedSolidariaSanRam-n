// ─── Aplica los datos reales de Chocofest 2025 a la BD ───────────────────────
// Complementa al seed para BDs que ya tienen la tabla campaigns poblada
// (el seed solo siembra si está vacía). Idempotente: crea/actualiza la
// campaña por título y reemplaza sus donaciones con las de la hoja.
//
// Uso:
//   pnpm --filter @workspace/scripts apply:chocofest
//
// Los datos viven en artifacts/api-server/src/lib/chocofest-2025-data.ts
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
  campaignLeftoversTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  CHOCOLATADA_2025_CAMPAIGN,
  CHOCOLATADA_2025_DONATIONS,
  CHOCOLATADA_2025_EVIDENCE,
  CHOCOLATADA_2025_EXPENSES,
  CHOCOLATADA_2025_IMAGES,
  CHOCOLATADA_2025_LEFTOVERS,
  CHOCOLATADA_2025_TITLE,
  CHOCOLATADA_2025_UPDATES,
} from "../../artifacts/api-server/src/lib/chocofest-2025-data";

// A diferencia del script 2024 (que inserta contenido solo si la TABLA está
// vacía a nivel global), aquí se comprueba POR CAMPAÑA: así funciona en BDs ya
// pobladas (p.ej. Neon) sin duplicar el contenido de otras campañas, y sigue
// siendo idempotente (no re-inserta si esta campaña ya tiene filas).
async function campaignHasRows(tableName: string, campaignId: number): Promise<boolean> {
  const result = await db.execute(
    sql.raw(
      `SELECT COUNT(*)::int AS n FROM "${tableName}" WHERE campaign_id = ${campaignId}`,
    ),
  );
  const rows = result.rows as Array<{ n: number }>;
  return (rows[0]?.n ?? 0) > 0;
}

async function main(): Promise<void> {
  // El esquema de la BD puede estar atrasado (migraciones pendientes): el
  // servidor las aplica al arrancar; aquí hacemos lo mismo para no fallar
  // contra columnas que aún no existen (p.ej. campaign_leftovers).
  await runMigrations();

  // 1) Campaña: crear si no existe, actualizar si existe (por título).
  const existing = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(eq(campaignsTable.title, CHOCOLATADA_2025_TITLE));

  let campaignId: number;
  if (existing[0]) {
    campaignId = existing[0].id;
    await db
      .update(campaignsTable)
      .set({ ...CHOCOLATADA_2025_CAMPAIGN })
      .where(eq(campaignsTable.id, campaignId));
    console.log(`✔ Campaña "${CHOCOLATADA_2025_TITLE}" actualizada (id=${campaignId})`);
  } else {
    const [row] = await db
      .insert(campaignsTable)
      .values({ ...CHOCOLATADA_2025_CAMPAIGN })
      .returning({ id: campaignsTable.id });
    campaignId = row.id;
    console.log(`✔ Campaña "${CHOCOLATADA_2025_TITLE}" creada (id=${campaignId})`);
  }

  // 2) Donaciones: reemplazo idempotente (solo las de esta campaña).
  await db.delete(donationsTable).where(eq(donationsTable.campaignId, campaignId));
  await db.insert(donationsTable).values(
    CHOCOLATADA_2025_DONATIONS.map((d) => ({ ...d, campaignId })),
  );
  const cashTotal = CHOCOLATADA_2025_DONATIONS.reduce((sum, d) => sum + d.amount, 0);
  console.log(
    `✔ ${CHOCOLATADA_2025_DONATIONS.length} donaciones insertadas (efectivo: S/ ${cashTotal})`,
  );

  // 3) Contenido de transparencia: solo si ESTA campaña aún no tiene filas.
  if (!(await campaignHasRows("campaign_updates", campaignId))) {
    await db.insert(campaignUpdatesTable).values(
      CHOCOLATADA_2025_UPDATES.map((u) => ({ ...u, campaignId })),
    );
    console.log("✔ Actualizaciones insertadas");
  } else {
    console.log("• Actualizaciones ya existentes (sin cambios)");
  }
  if (!(await campaignHasRows("campaign_images", campaignId))) {
    await db.insert(campaignImagesTable).values(
      CHOCOLATADA_2025_IMAGES.map((img) => ({ ...img, campaignId })),
    );
    console.log("✔ Galería insertada");
  } else {
    console.log("• Galería ya existente (sin cambios)");
  }
  if (!(await campaignHasRows("campaign_expenses", campaignId))) {
    await db.insert(campaignExpensesTable).values(
      CHOCOLATADA_2025_EXPENSES.map((e) => ({ ...e, campaignId })),
    );
    console.log("✔ Gastos insertados");
  } else {
    console.log("• Gastos ya existentes (sin cambios)");
  }
  if (!(await campaignHasRows("campaign_evidence", campaignId))) {
    await db.insert(campaignEvidenceTable).values(
      CHOCOLATADA_2025_EVIDENCE.map((ev) => ({ ...ev, campaignId })),
    );
    console.log("✔ Evidencias insertadas");
  } else {
    console.log("• Evidencias ya existentes (sin cambios)");
  }
  if (!(await campaignHasRows("campaign_leftovers", campaignId))) {
    if (CHOCOLATADA_2025_LEFTOVERS.length > 0) {
      await db.insert(campaignLeftoversTable).values(
        CHOCOLATADA_2025_LEFTOVERS.map((l) => ({ ...l, campaignId })),
      );
      console.log("✔ Sobrantes insertados");
    } else {
      console.log("✔ Sobrantes: sin datos aún (tabla lista para el admin)");
    }
  } else {
    console.log("• Sobrantes ya existentes (sin cambios)");
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
