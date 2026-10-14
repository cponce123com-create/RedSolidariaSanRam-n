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
  {
    name: "006_amount_numeric.sql",
    sql: `
      -- Montos a numeric(12,2): float4 (real) introduce errores de redondeo
      -- acumulados en SUM/agregaciones (100.10 se guarda como 100.099998...).
      -- Compatible con el ledger existente: los hashes se calcularon con la
      -- representación canónica toFixed(2) del valor leído; al redondear
      -- 100.099998 → 100.10 el hash recomputado es idéntico.
      ALTER TABLE donations ALTER COLUMN amount TYPE numeric(12,2) USING amount::numeric;
      ALTER TABLE campaign_expenses ALTER COLUMN amount TYPE numeric(12,2) USING amount::numeric;
      ALTER TABLE campaign_movements ALTER COLUMN amount TYPE numeric(12,2) USING amount::numeric;
    `,
  },
  {
    name: "007_campaigns_location.sql",
    sql: `
      -- Geolocalización de campañas para la vista de mapa (fase 2 del
      -- rediseño del frontend). Nullable: campañas sin ubicación se omiten
      -- del mapa pero siguen visibles en la grilla.
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS latitude real;
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS longitude real;
      CREATE INDEX IF NOT EXISTS idx_campaigns_location ON campaigns(latitude, longitude);
    `,
  },
  {
    name: "008_campaign_leftovers.sql",
    sql: `
      -- Sobrantes de campaña (ítems/dinero que quedaron tras el evento).
      -- Se llenan desde el panel admin y se muestran en la transparencia.
      CREATE TABLE IF NOT EXISTS campaign_leftovers (
        id serial PRIMARY KEY,
        campaign_id integer NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        item text NOT NULL,
        quantity real NOT NULL DEFAULT 1,
        unit text,
        notes text,
        is_public boolean NOT NULL DEFAULT true,
        created_at timestamp DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_leftovers_campaign ON campaign_leftovers(campaign_id);
    `,
  },
  {
    name: "009_volunteers_photo.sql",
    sql: `
      -- Foto del voluntario (subida opcional a Cloudinary desde el formulario
      -- público de registro). Solo visibilidad admin; no se expone en
      -- endpoints públicos.
      ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS photo text;
    `,
  },
  {
    name: "010_low_risk.sql",
    sql: `
      -- DB-07: índices por campaign_id en las tablas de contenido. Las vistas
      -- del panel admin filtran por campaña y solo existía la primary key.
      CREATE INDEX IF NOT EXISTS idx_expenses_campaign ON campaign_expenses(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_campaign ON campaign_evidence(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_updates_campaign ON campaign_updates(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_images_campaign ON campaign_images(campaign_id);

      -- A3 / DB-02: el ledger es un registro de auditoría y no debe poder
      -- borrarse en cascada al eliminar una campaña. RESTRICT obliga a
      -- resolver el historial antes de eliminar.
      ALTER TABLE campaign_movements DROP CONSTRAINT IF EXISTS campaign_movements_campaign_id_fkey;
      ALTER TABLE campaign_movements ADD CONSTRAINT campaign_movements_campaign_id_fkey
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE RESTRICT;
    `,
  },
  {
    name: "011_donors.sql",
    sql: `
      -- Fase 3: perfiles de donante (persona, familia, empresa o anónimo) y su
      -- vínculo con las donaciones. TOTALMENTE ADITIVA Y REVERSIBLE:
      --   rollback = ALTER TABLE donations DROP COLUMN reconciled_by,
      --              DROP COLUMN reconciled_at, DROP COLUMN donor_id;
      --              DROP TABLE donors;
      CREATE TABLE IF NOT EXISTS donors (
        id serial PRIMARY KEY,
        type text NOT NULL DEFAULT 'individual',
        name text NOT NULL,
        email text,
        phone text,
        is_recurring boolean NOT NULL DEFAULT false,
        notes text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );

      -- Un correo identifica a un donante (sin distinguir mayúsculas); los
      -- correos vacíos o nulos no participan del índice único.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_donors_email
        ON donors (lower(email)) WHERE email IS NOT NULL AND btrim(email) <> '';

      -- Vínculo opcional: una donación puede pertenecer a un perfil de donante.
      ALTER TABLE donations ADD COLUMN IF NOT EXISTS donor_id integer;

      -- Conciliación bancaria TRAZABLE (Fase 3/4): cuándo y quién la confirmó.
      -- Nunca se altera silenciosamente un movimiento confirmado.
      ALTER TABLE donations ADD COLUMN IF NOT EXISTS reconciled_at timestamp;
      ALTER TABLE donations ADD COLUMN IF NOT EXISTS reconciled_by text;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'donations_donor_id_fkey'
        ) THEN
          ALTER TABLE donations
            ADD CONSTRAINT donations_donor_id_fkey
            FOREIGN KEY (donor_id) REFERENCES donors(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `,
  },
  {
    name: "012_supervisor_observations.sql",
    sql: `
      -- Fase 4: observaciones de supervisión (rol de SOLO CONSULTA). ADITIVA Y
      -- REVERSIBLE:
      --   rollback = DROP TABLE supervisor_observations;
      --
      -- La observación es un ANEXO: nunca modifica el registro observado. La
      -- resolución (marcar como atendida) la registra un administrador.
      CREATE TABLE IF NOT EXISTS supervisor_observations (
        id serial PRIMARY KEY,
        entity_type text NOT NULL,
        entity_id text NOT NULL,
        body text NOT NULL,
        author_id text,
        author_username text,
        resolved_at timestamp,
        resolved_by text,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_supervisor_observations_entity
        ON supervisor_observations (entity_type, entity_id);
    `,
  },
  {
    name: "013_volunteers_permanent.sql",
    sql: `
      -- Fase 5: registro PERMANENTE de voluntariado. ADITIVA Y REVERSIBLE:
      --   rollback = DROP INDEX IF EXISTS idx_volunteers_public_token;
      --              DROP INDEX IF EXISTS idx_volunteers_email;
      --              ALTER TABLE volunteers DROP COLUMN public_token,
      --                DROP COLUMN approved_by, DROP COLUMN approved_at,
      --                DROP COLUMN updated_at;
      ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();
      ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS approved_at timestamp;
      ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS approved_by text;
      ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS public_token text;

      -- Índice NO único A PROPÓSITO: si en producción ya existieran correos
      -- repetidos, un índice único haría FALLAR la migración y con ella el
      -- arranque. La deduplicación se aplica en la aplicación (409).
      CREATE INDEX IF NOT EXISTS idx_volunteers_email ON volunteers (lower(email));

      -- El token público sí es único (los nulos no participan del índice).
      CREATE UNIQUE INDEX IF NOT EXISTS idx_volunteers_public_token
        ON volunteers (public_token) WHERE public_token IS NOT NULL;
    `,
  },
  {
    name: "014_volunteer_teams_participation.sql",
    sql: `
      -- Fase 5: equipos y PARTICIPACIÓN del voluntariado. ADITIVA Y REVERSIBLE:
      --   rollback = DROP TABLE volunteer_participations;
      --              DROP TABLE volunteer_team_members;
      --              DROP TABLE volunteer_teams;
      CREATE TABLE IF NOT EXISTS volunteer_teams (
        id serial PRIMARY KEY,
        name text NOT NULL,
        description text,
        color text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );

      -- Nombre de equipo único (sin distinguir mayúsculas).
      CREATE UNIQUE INDEX IF NOT EXISTS idx_volunteer_teams_name
        ON volunteer_teams (lower(name));

      CREATE TABLE IF NOT EXISTS volunteer_team_members (
        id serial PRIMARY KEY,
        volunteer_id integer NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
        team_id integer NOT NULL REFERENCES volunteer_teams(id) ON DELETE CASCADE,
        role text,
        joined_at timestamp NOT NULL DEFAULT now(),
        left_at timestamp
      );

      -- Un voluntario no puede estar dos veces ACTIVO en el mismo equipo.
      -- Las pertenencias cerradas (left_at) no participan del índice.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_volunteer_team_active
        ON volunteer_team_members (volunteer_id, team_id) WHERE left_at IS NULL;

      CREATE TABLE IF NOT EXISTS volunteer_participations (
        id serial PRIMARY KEY,
        volunteer_id integer NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
        campaign_id integer REFERENCES campaigns(id) ON DELETE SET NULL,
        activity_type text NOT NULL,
        title text NOT NULL,
        description text,
        hours real,
        participated_at timestamp NOT NULL,
        recorded_by text,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_volunteer_participations_volunteer
        ON volunteer_participations (volunteer_id, participated_at DESC);
    `,
  },
  {
    name: "015_campaign_items_flow.sql",
    sql: `
      -- Bienes del evento (chocolatada, regalos, canastas): clasificación, meta
      -- y flujo recibido/usado. ADITIVA y reversible (DROP COLUMN deshace).
      -- Reutiliza campaign_leftovers: no se crea una tabla por producto.
      ALTER TABLE campaign_leftovers ADD COLUMN IF NOT EXISTS category text;
      ALTER TABLE campaign_leftovers ADD COLUMN IF NOT EXISTS target_qty real;
      ALTER TABLE campaign_leftovers ADD COLUMN IF NOT EXISTS received_qty real;
      ALTER TABLE campaign_leftovers ADD COLUMN IF NOT EXISTS used_qty real;

      CREATE INDEX IF NOT EXISTS idx_campaign_leftovers_category
        ON campaign_leftovers (campaign_id, category);
    `,
  },
  {
    name: "016_campaign_budgets.sql",
    sql: `
      -- Presupuesto por categoría (Fase 2.5 del Prompt Maestro): monto previsto
      -- por categoría frente a los gastos aprobados. ADITIVA (solo crea tabla e
      -- índices); no toca ninguna tabla existente.
      CREATE TABLE IF NOT EXISTS campaign_budgets (
        id serial PRIMARY KEY,
        campaign_id integer NOT NULL,
        category text NOT NULL,
        planned_amount real NOT NULL DEFAULT 0,
        notes text,
        is_public boolean NOT NULL DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_campaign_budgets_campaign
        ON campaign_budgets (campaign_id);

      -- Una sola línea de presupuesto por categoría y campaña (sin distinguir
      -- mayúsculas ni espacios), para que el panel no duplique partidas.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_budgets_category
        ON campaign_budgets (campaign_id, lower(category));
    `,
  },
  {
    name: "017_campaign_leftovers_composition.sql",
    sql: `
      -- Fase 2.4: composición de canastas y trazabilidad del bien.
      -- ADITIVA y reversible (DROP COLUMN deshace). No toca datos existentes.
      --
      -- composition: una línea por producto ("arroz | 2 kg"). Se interpreta con
      --   la función pura parseComposition; la cobertura de canastas se calcula
      --   cruzando esta composición con el stock real (basketCoverage).
      -- donor_id / evidence_id: quién donó el bien y con qué evidencia se
      --   entregó. Opcionales: los bienes cargados antes quedan sin vínculo.
      ALTER TABLE campaign_leftovers ADD COLUMN IF NOT EXISTS composition text;
      ALTER TABLE campaign_leftovers ADD COLUMN IF NOT EXISTS donor_id integer;
      ALTER TABLE campaign_leftovers ADD COLUMN IF NOT EXISTS evidence_id integer;

      CREATE INDEX IF NOT EXISTS idx_campaign_leftovers_donor
        ON campaign_leftovers (donor_id);
    `,
  },
  {
    name: "018_donations_collaboration_type.sql",
    sql: `
      -- Fase 3: tipo de colaboración de la donación (dinero, productos,
      -- servicios, apoyo logístico). ADITIVA y reversible (DROP COLUMN
      -- deshace). Las donaciones anteriores quedan como 'dinero': es lo que
      -- eran, no se reinterpreta ningún registro histórico.
      ALTER TABLE donations ADD COLUMN IF NOT EXISTS collaboration_type text NOT NULL DEFAULT 'dinero';

      CREATE INDEX IF NOT EXISTS idx_donations_collaboration
        ON donations (collaboration_type);

      -- Donaciones en especie ya registradas: la convención histórica era monto
      -- 0 con método "other" (ver src/lib/chocofest-2025-data.ts). Se
      -- reclasifican para que no aparezcan como "S/ 0" en la lista pública de
      -- donantes ni inflen el conteo de aportes de dinero. El monto 0 nunca
      -- fue válido para una donación pública de dinero (mínimo S/ 5).
      UPDATE donations SET collaboration_type = 'productos'
        WHERE collaboration_type = 'dinero' AND amount = 0 AND payment_method = 'other';

      -- Normalización de los tipos de donante a los valores canónicos del
      -- modelo (que ahora incluye 'organizacion'). El formulario público y el
      -- panel solo escriben valores canónicos, así que en la práctica esto es
      -- una red de seguridad para datos importados. Es idempotente: una fila
      -- normalizada no vuelve a coincidir con ningún alias.
      UPDATE donors SET type = 'organizacion'
        WHERE lower(type) IN ('ong', 'organización', 'organizacion', 'organization',
                              'institucion', 'institución', 'institution',
                              'asociacion', 'asociación', 'fundacion', 'fundación');
      UPDATE donors SET type = 'individual'
        WHERE lower(type) IN ('persona', 'person', 'particular');
      UPDATE donors SET type = 'familia'
        WHERE lower(type) IN ('family', 'nucleo familiar');
      UPDATE donors SET type = 'empresa'
        WHERE lower(type) IN ('company', 'business', 'negocio', 'rse');
      UPDATE donors SET type = 'anonimo'
        WHERE lower(type) IN ('anónimo', 'anonymo', 'anonymous', 'anonima', 'anónima');
    `,
  },
  {
    name: "019_whatsapp_settings.sql",
    sql: `
      -- Fase 7 (V7-2): contacto y mensajes de WhatsApp configurables.
      -- El número estaba FIJO en el código del sitio y los mensajes no existían.
      -- Se crean como configuración editable (grupo "contacto"), con el número
      -- que el sitio publica hoy para no cambiar el comportamiento, y mensajes
      -- vacíos: si están vacíos, la interfaz usa el texto por defecto del idioma.
      --
      -- El INSERT solo actúa si \`settings\` YA tiene contenido (despliegue
      -- existente). En una base nueva la migración no escribe nada para no
      -- romper el seed, que solo carga la configuración si la tabla está vacía.
      INSERT INTO settings (key, value, label, "group")
      SELECT v.key, v.value, v.label, v."group"
      FROM (VALUES
        ('org_whatsapp', '51921615737', 'Número de WhatsApp (solo dígitos, con código de país)', 'contacto'),
        ('whatsapp_message_general', '', 'Mensaje de WhatsApp: contacto general', 'contacto'),
        ('whatsapp_message_donation', '', 'Mensaje de WhatsApp: donaciones', 'contacto'),
        ('whatsapp_message_volunteer', '', 'Mensaje de WhatsApp: voluntariado', 'contacto'),
        ('whatsapp_message_sponsor', '', 'Mensaje de WhatsApp: auspicios y donaciones en especie', 'contacto')
      ) AS v(key, value, label, "group")
      WHERE EXISTS (SELECT 1 FROM settings)
      ON CONFLICT (key) DO NOTHING;
    `,
  },
  {
    name: "020_event_results_settings.sql",
    sql: `
      -- Fase 4.3 (V7-8): rendición de resultados del evento. Los datos que solo
      -- la organización puede declarar —beneficiarios atendidos, actividades
      -- realizadas, resumen y destino de los sobrantes— pasan a ser configuración
      -- editable y pública (es información de rendición de cuentas).
      --
      -- Mismo patrón que la 019: solo escribe si \`settings\` YA tiene contenido,
      -- para no romper el seed de una base nueva. Idempotente.
      INSERT INTO settings (key, value, label, "group")
      SELECT v.key, v.value, v.label, v."group"
      FROM (VALUES
        ('chocofest_2026_results_beneficiaries', '', 'ChocoFest 2026: beneficiarios atendidos (agregado)', 'chocofest'),
        ('chocofest_2026_results_activities', '', 'ChocoFest 2026: actividades realizadas (una por línea: hora | título | responsable)', 'chocofest'),
        ('chocofest_2026_results_summary', '', 'ChocoFest 2026: resumen de la rendición de cuentas', 'chocofest'),
        ('chocofest_2026_results_leftovers_destination', '', 'ChocoFest 2026: destino de los recursos sobrantes', 'chocofest')
      ) AS v(key, value, label, "group")
      WHERE EXISTS (SELECT 1 FROM settings)
      ON CONFLICT (key) DO NOTHING;
    `,
  },
  {
    name: "021_use_case_indexes.sql",
    sql: `
      -- DB-07 (V7-9): índices compuestos por CASO DE USO. Las migraciones 001 y
      -- 012 ya cubrieron los índices simples por campaña; estos son los que
      -- faltaban para las consultas que realmente hace el sistema, y son
      -- ADITIVOS: solo crean índices, no tocan datos ni columnas.
      --
      -- 1) Solicitudes de adopción: se listan por mascota y el panel cuenta las
      --    pendientes por estado (dashboard).
      CREATE INDEX IF NOT EXISTS idx_adoption_requests_pet
        ON adoption_requests (pet_id);
      CREATE INDEX IF NOT EXISTS idx_adoption_requests_status
        ON adoption_requests (status);

      -- 2) Gastos de campaña: el panel de transparencia filtra por campaña y por
      --    visibilidad pública (nunca se muestran gastos privados).
      CREATE INDEX IF NOT EXISTS idx_expenses_campaign_public
        ON campaign_expenses (campaign_id, is_public);

      -- 3) Evidencias: mismo caso (campaña + visibilidad pública).
      CREATE INDEX IF NOT EXISTS idx_evidence_campaign_public
        ON campaign_evidence (campaign_id, is_public);

      -- 4) Novedades de campaña: se listan por campaña en orden cronológico.
      CREATE INDEX IF NOT EXISTS idx_updates_campaign_created
        ON campaign_updates (campaign_id, created_at DESC);

      -- 5) Donaciones: las cifras filtradas del panel (campaña + estado +
      --    rango de fechas) y la recaudación verificada por campaña.
      CREATE INDEX IF NOT EXISTS idx_donations_campaign_status_created
        ON donations (campaign_id, status, created_at DESC);
    `,
  },
  {
    name: "022_status_checks_and_updated_at.sql",
    sql: `
      -- DB-08 + DB-10 (V7-12): integridad que la base debe garantizar por sí
      -- misma, sin depender de que la aplicación se acuerde.
      --
      -- DB-08: los estados eran columnas de texto SIN restricción. Ahora cada
      -- tabla declara sus valores válidos con un CHECK ... NOT VALID:
      --   - NOT VALID significa que las filas YA existentes NO se revisan (una
      --     migración no puede fallar por datos históricos), pero las escrituras
      --     NUEVAS sí se comprueban desde este momento.
      --   - Los valores son EXACTAMENTE los que aceptan los esquemas de la
      --     aplicación (zod y las libs de ciclo de vida), no una lista inventada.
      --   - Para endurecer más adelante, cuando los datos estén limpios:
      --       SELECT status, count(*) FROM <tabla> GROUP BY status;   -- revisar
      --       ALTER TABLE <tabla> VALIDATE CONSTRAINT <nombre>;       -- validar
      --
      -- \`campaigns\` incluye 'inactive' porque es un valor heredado que el panel
      -- sigue contando como finalizada; excluirlo dejaría esas filas antiguas
      -- imposibles de editar (cualquier UPDATE las revisa).

      ALTER TABLE donations DROP CONSTRAINT IF EXISTS donations_status_check;
      ALTER TABLE donations ADD CONSTRAINT donations_status_check
        CHECK (status IN ('pending','approved','rejected','reconciled')) NOT VALID;

      ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
      ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check
        CHECK (status IN ('draft','active','paused','completed','archived','inactive')) NOT VALID;

      ALTER TABLE pets DROP CONSTRAINT IF EXISTS pets_status_check;
      ALTER TABLE pets ADD CONSTRAINT pets_status_check
        CHECK (status IN ('available','adopted','in-process','reviewing','inactive')) NOT VALID;

      ALTER TABLE volunteers DROP CONSTRAINT IF EXISTS volunteers_status_check;
      ALTER TABLE volunteers ADD CONSTRAINT volunteers_status_check
        CHECK (status IN ('pending','reviewing','approved','contacted','rejected')) NOT VALID;

      ALTER TABLE adoption_requests DROP CONSTRAINT IF EXISTS adoption_requests_status_check;
      ALTER TABLE adoption_requests ADD CONSTRAINT adoption_requests_status_check
        CHECK (status IN ('pending','approved','rejected','in-process')) NOT VALID;

      ALTER TABLE community_reports DROP CONSTRAINT IF EXISTS community_reports_status_check;
      ALTER TABLE community_reports ADD CONSTRAINT community_reports_status_check
        CHECK (status IN ('pending','reviewing','approved','rejected','converted','archived')) NOT VALID;

      ALTER TABLE campaign_movements DROP CONSTRAINT IF EXISTS campaign_movements_kind_check;
      ALTER TABLE campaign_movements ADD CONSTRAINT campaign_movements_kind_check
        CHECK (kind IN ('ingreso','gasto')) NOT VALID;

      -- DB-10: updated_at no se actualizaba solo. Con estos disparadores la base
      -- lo mantiene aunque la aplicación lo olvide (varias rutas ya lo hacían a
      -- mano; esto es la garantía, no una dependencia).
      CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $fn$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $fn$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_donors_updated_at ON donors;
      CREATE TRIGGER trg_donors_updated_at BEFORE UPDATE ON donors
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_volunteer_teams_updated_at ON volunteer_teams;
      CREATE TRIGGER trg_volunteer_teams_updated_at BEFORE UPDATE ON volunteer_teams
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_pets_updated_at ON pets;
      CREATE TRIGGER trg_pets_updated_at BEFORE UPDATE ON pets
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_community_reports_updated_at ON community_reports;
      CREATE TRIGGER trg_community_reports_updated_at BEFORE UPDATE ON community_reports
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_settings_updated_at ON settings;
      CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON settings
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_volunteers_updated_at ON volunteers;
      CREATE TRIGGER trg_volunteers_updated_at BEFORE UPDATE ON volunteers
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
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
