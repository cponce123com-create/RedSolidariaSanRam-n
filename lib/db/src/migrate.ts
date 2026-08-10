import { pool } from "./pool";

/**
 * Migraciones embebidas (se bundlean con esbuild, no dependen del filesystem).
 *
 * NOTA: 001 corrige el archivo original lib/db/src/migrations/001_add_indexes.sql,
 * que referenciaba columnas inexistentes en el esquema real (payment_status,
 * is_published, tabla contacts). Aquí solo se incluyen índices válidos.
 */
const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: "001_add_indexes.sql",
    sql: `
      -- Índices para optimizar consultas frecuentes (válidos contra el esquema real)
      CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
      CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON campaigns(start_date, end_date);
      CREATE INDEX IF NOT EXISTS idx_campaigns_created ON campaigns(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_donations_campaign ON donations(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_donations_created ON donations(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);
      CREATE INDEX IF NOT EXISTS idx_pets_adoption_status ON pets(status);
      CREATE INDEX IF NOT EXISTS idx_pets_created ON pets(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_volunteers_status ON volunteers(status);
      CREATE INDEX IF NOT EXISTS idx_reports_status ON community_reports(status);
      CREATE INDEX IF NOT EXISTS idx_reports_created ON community_reports(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
    `,
  },
  {
    name: "002_donation_proofs.sql",
    sql: `
      -- Comprobantes de donación (capturas de Yape/transferencia)
      CREATE TABLE IF NOT EXISTS donation_proofs (
        id serial PRIMARY KEY,
        donation_id integer NOT NULL REFERENCES donations(id) ON DELETE CASCADE,
        image_url text NOT NULL,
        public_id text,
        mime_type text,
        created_at timestamp DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_donation_proofs_donation ON donation_proofs(donation_id);
      -- El donante decide si su recibo se muestra al público
      ALTER TABLE donations ADD COLUMN IF NOT EXISTS public_proof boolean NOT NULL DEFAULT false;
    `,
  },
  {
    name: "003_admin_2fa.sql",
    sql: `
      -- 2FA (TOTP) para administradores: secreto + flag de activación
      ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS two_factor_secret text;
      ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false;
    `,
  },
  {
    name: "004_donations_campaign_status.sql",
    sql: `
      -- Índice compuesto para las agregaciones públicas por campaña
      -- (count/sum filter where status='approved'): con solo índices
      -- individuales en campaign_id y status, Postgres escanea + filtra;
      -- el compuesto permite un Index Only Scan directo.
      CREATE INDEX IF NOT EXISTS idx_donations_campaign_status ON donations(campaign_id, status);
    `,
  },
  {
    name: "005_campaign_movements.sql",
    sql: `
      -- Ledger inmutable de movimientos (Trust Pay): cadena de hashes.
      -- Append-only; nunca UPDATE/DELETE. La unicidad por (source_type,
      -- source_id) garantiza que una donación/gasto solo genera UNA entrada.
      CREATE TABLE IF NOT EXISTS campaign_movements (
        id serial PRIMARY KEY,
        campaign_id integer NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        kind text NOT NULL,
        amount real NOT NULL,
        description text NOT NULL,
        source_type text NOT NULL,
        source_id integer NOT NULL,
        prev_hash text NOT NULL,
        hash text NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_movements_campaign ON campaign_movements(campaign_id, id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_movements_source ON campaign_movements(source_type, source_id);
    `,
  },
];

/**
 * Aplica las migraciones pendientes de forma idempotente.
 * Se ejecuta al arrancar el servidor; un fallo aquí no debe tumbar el boot
 * (la app arranca igual y el error queda registrado).
 */
export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drizzle_migrations (
      name text PRIMARY KEY,
      applied_at timestamp DEFAULT now() NOT NULL
    )
  `);

  const { rows } = await pool.query("SELECT name FROM drizzle_migrations");
  const applied = new Set(rows.map((r: { name: string }) => r.name));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(migration.sql);
      await client.query("INSERT INTO drizzle_migrations (name) VALUES ($1)", [
        migration.name,
      ]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
