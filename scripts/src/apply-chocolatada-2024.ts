// ─── Aplica los datos reales de la Chocolatada Navideña 2024 a la BD ─────────
// Complementa al seed para BDs que ya tienen la tabla campaigns poblada
// (el seed solo siembra si está vacía).
//
// IDEMPOTENTE Y NO DESTRUCTIVO (hallazgos IMP-01/IMP-02/IMP-03/IMP-06):
//   - Todo el proceso corre dentro de una TRANSACCIÓN (o se aplica completo o nada).
//   - Las donaciones se RECONCILIAN por clave natural: solo se insertan las que
//     faltan. NUNCA se borran ni se sobrescriben donaciones existentes.
//   - Al actualizar la campaña se preservan `featured`/`status`/`raised`.
//   - El contenido de transparencia se comprueba POR CAMPAÑA (antes era global).
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
import { planDonationInsert } from "../../artifacts/api-server/src/lib/donation-reconcile";
import {
  CHOCOLATADA_2024_CAMPAIGN,
  CHOCOLATADA_2024_DONATIONS,
  CHOCOLATADA_2024_EVIDENCE,
  CHOCOLATADA_2024_EXPENSES,
  CHOCOLATADA_2024_IMAGES,
  CHOCOLATADA_2024_TITLE,
  CHOCOLATADA_2024_UPDATES,
} from "../../artifacts/api-server/src/lib/chocolatada-2024-data";

async function main(): Promise<void> {
  // El esquema de la BD puede estar atrasado (migraciones pendientes): se
  // aplican antes de la transacción (el DDL no debe ir dentro de ella).
  await runMigrations();

  await db.transaction(async (tx) => {
    // 1) Campaña: crear si no existe; si existe, actualizar SOLO los campos de
    //    contenido (se preservan featured/status/raised editados por el admin).
    const existing = await tx
      .select({ id: campaignsTable.id })
      .from(campaignsTable)
      .where(eq(campaignsTable.title, CHOCOLATADA_2024_TITLE));

    let campaignId: number;
    if (existing[0]) {
      campaignId = existing[0].id;
      const {
        featured: _featured,
        status: _status,
        raised: _raised,
        ...campaignContent
      } = CHOCOLATADA_2024_CAMPAIGN;
      await tx
        .update(campaignsTable)
        .set(campaignContent)
        .where(eq(campaignsTable.id, campaignId));
      console.log(
        `✔ Campaña "${CHOCOLATADA_2024_TITLE}" actualizada (id=${campaignId}); se preservan featured/status/raised`,
      );
    } else {
      const [row] = await tx
        .insert(campaignsTable)
        .values({ ...CHOCOLATADA_2024_CAMPAIGN })
        .returning({ id: campaignsTable.id });
      campaignId = row.id;
      console.log(`✔ Campaña "${CHOCOLATADA_2024_TITLE}" creada (id=${campaignId})`);
    }

    // Helper de idempotencia POR CAMPAÑA.
    const campaignHasRows = async (table: string): Promise<boolean> => {
      const result = await tx.execute(
        sql.raw(
          `SELECT COUNT(*)::int AS n FROM "${table}" WHERE campaign_id = ${campaignId}`,
        ),
      );
      return ((result.rows as Array<{ n: number }>)[0]?.n ?? 0) > 0;
    };

    // 2) Donaciones: reconciliación idempotente (SIN DELETE).
    const existingDonations = await tx
      .select({
        firstName: donationsTable.firstName,
        lastName: donationsTable.lastName,
        amount: donationsTable.amount,
        paymentMethod: donationsTable.paymentMethod,
        message: donationsTable.message,
        createdAt: donationsTable.createdAt,
      })
      .from(donationsTable)
      .where(eq(donationsTable.campaignId, campaignId));

    const { toInsert, alreadyPresent } = planDonationInsert(
      CHOCOLATADA_2024_DONATIONS,
      existingDonations,
    );

    if (toInsert.length > 0) {
      await tx
        .insert(donationsTable)
        .values(toInsert.map((d) => ({ ...d, campaignId })));
    }
    const cashTotal = toInsert.reduce((sum, d) => sum + d.amount, 0);
    console.log(
      `✔ Donaciones: ${toInsert.length} insertadas (efectivo: S/ ${cashTotal}), ${alreadyPresent} ya presentes (sin borrados)`,
    );

    // 3) Contenido de transparencia: solo si ESTA campaña aún no tiene filas.
    if (!(await campaignHasRows("campaign_updates"))) {
      await tx.insert(campaignUpdatesTable).values(
        CHOCOLATADA_2024_UPDATES.map((u) => ({ ...u, campaignId })),
      );
      console.log("✔ Actualizaciones insertadas");
    } else {
      console.log("• Actualizaciones ya existentes (sin cambios)");
    }
    if (!(await campaignHasRows("campaign_images"))) {
      await tx.insert(campaignImagesTable).values(
        CHOCOLATADA_2024_IMAGES.map((img) => ({ ...img, campaignId })),
      );
      console.log("✔ Galería insertada");
    } else {
      console.log("• Galería ya existente (sin cambios)");
    }
    if (!(await campaignHasRows("campaign_expenses"))) {
      await tx.insert(campaignExpensesTable).values(
        CHOCOLATADA_2024_EXPENSES.map((e) => ({ ...e, campaignId })),
      );
      console.log("✔ Gastos insertados");
    } else {
      console.log("• Gastos ya existentes (sin cambios)");
    }
    if (!(await campaignHasRows("campaign_evidence"))) {
      await tx.insert(campaignEvidenceTable).values(
        CHOCOLATADA_2024_EVIDENCE.map((ev) => ({ ...ev, campaignId })),
      );
      console.log("✔ Evidencias insertadas");
    } else {
      console.log("• Evidencias ya existentes (sin cambios)");
    }
  });

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
