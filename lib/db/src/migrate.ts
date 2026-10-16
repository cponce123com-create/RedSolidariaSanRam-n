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
  {
    name: "023_missing_foreign_keys.sql",
    sql: `
      -- DB-04 (B-2): referencias que eran columnas sueltas SIN clave foránea.
      -- Nada impedía que una donación, un gasto o una evidencia apuntaran a una
      -- campaña inexistente, ni que borrar una mascota dejara solicitudes de
      -- adopción huérfanas.
      --
      -- NOT VALID, igual que las restricciones de estado (022): las filas YA
      -- existentes no se revisan (en producción puede haber huérfanas y esta
      -- migración no puede fallar ni borrar nada), y TODAS las escrituras nuevas
      -- quedan comprobadas desde este momento. Para validarlas más adelante,
      -- primero se miran los huérfanos y luego se valida:
      --
      --   SELECT count(*) FROM donations d
      --     LEFT JOIN campaigns c ON c.id = d.campaign_id
      --     WHERE d.campaign_id IS NOT NULL AND c.id IS NULL;
      --   ALTER TABLE donations VALIDATE CONSTRAINT donations_campaign_id_fkey;
      --
      -- ON DELETE conservador: RESTRICT en todo lo que es historial (dinero,
      -- gastos, evidencias, bienes, imágenes, novedades, presupuesto) para que la
      -- base no borre nada en cascada por su cuenta, y SET NULL donde la fila debe
      -- sobrevivir aunque desaparezca la referencia (una donación sin el donante
      -- consolidado, un reporte ciudadano sin la campaña creada a partir de él).

      ALTER TABLE donations DROP CONSTRAINT IF EXISTS donations_campaign_id_fkey;
      ALTER TABLE donations ADD CONSTRAINT donations_campaign_id_fkey
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE RESTRICT NOT VALID;

      ALTER TABLE donations DROP CONSTRAINT IF EXISTS donations_donor_id_fkey;
      ALTER TABLE donations ADD CONSTRAINT donations_donor_id_fkey
        FOREIGN KEY (donor_id) REFERENCES donors(id) ON DELETE SET NULL NOT VALID;

      ALTER TABLE campaign_expenses DROP CONSTRAINT IF EXISTS campaign_expenses_campaign_id_fkey;
      ALTER TABLE campaign_expenses ADD CONSTRAINT campaign_expenses_campaign_id_fkey
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE RESTRICT NOT VALID;

      ALTER TABLE campaign_evidence DROP CONSTRAINT IF EXISTS campaign_evidence_campaign_id_fkey;
      ALTER TABLE campaign_evidence ADD CONSTRAINT campaign_evidence_campaign_id_fkey
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE RESTRICT NOT VALID;

      ALTER TABLE campaign_images DROP CONSTRAINT IF EXISTS campaign_images_campaign_id_fkey;
      ALTER TABLE campaign_images ADD CONSTRAINT campaign_images_campaign_id_fkey
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE RESTRICT NOT VALID;

      ALTER TABLE campaign_updates DROP CONSTRAINT IF EXISTS campaign_updates_campaign_id_fkey;
      ALTER TABLE campaign_updates ADD CONSTRAINT campaign_updates_campaign_id_fkey
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE RESTRICT NOT VALID;

      ALTER TABLE campaign_leftovers DROP CONSTRAINT IF EXISTS campaign_leftovers_campaign_id_fkey;
      ALTER TABLE campaign_leftovers ADD CONSTRAINT campaign_leftovers_campaign_id_fkey
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE RESTRICT NOT VALID;

      ALTER TABLE campaign_leftovers DROP CONSTRAINT IF EXISTS campaign_leftovers_donor_id_fkey;
      ALTER TABLE campaign_leftovers ADD CONSTRAINT campaign_leftovers_donor_id_fkey
        FOREIGN KEY (donor_id) REFERENCES donors(id) ON DELETE SET NULL NOT VALID;

      ALTER TABLE campaign_budgets DROP CONSTRAINT IF EXISTS campaign_budgets_campaign_id_fkey;
      ALTER TABLE campaign_budgets ADD CONSTRAINT campaign_budgets_campaign_id_fkey
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE RESTRICT NOT VALID;

      -- Un reporte ciudadano no debe desaparecer: si se borra la campaña creada a
      -- partir de él, el vínculo se limpia y el reporte sigue existiendo.
      ALTER TABLE community_reports DROP CONSTRAINT IF EXISTS community_reports_campaign_id_fkey;
      ALTER TABLE community_reports ADD CONSTRAINT community_reports_campaign_id_fkey
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL NOT VALID;

      ALTER TABLE adoption_requests DROP CONSTRAINT IF EXISTS adoption_requests_pet_id_fkey;
      ALTER TABLE adoption_requests ADD CONSTRAINT adoption_requests_pet_id_fkey
        FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE RESTRICT NOT VALID;
    `,
  },
  {
    name: "024_certificates.sql",
    sql: `
      -- Certificados con QR (Fase 5.2 / B-3). ADITIVA: crea una tabla nueva, no
      -- toca ninguna existente.
      --
      -- Un certificado RECONOCE a una persona o entidad y se publica en
      -- /certificados/:code. Solo se publica lo que la organización autoriza:
      -- nombre, tipo, título, fecha y campaña. **Nunca** importes ni datos de
      -- contacto: un certificado no es un recibo.
      --
      -- El código público es aleatorio (12 caracteres de un alfabeto sin
      -- caracteres ambiguos) y tiene índice único, así que no se puede enumerar
      -- quién tiene certificado.
      --
      -- ON DELETE SET NULL en la campaña: si la campaña desaparece, el certificado
      -- se conserva sin vínculo, porque reconoce a una persona y no es un dato
      -- de la campaña.
      CREATE TABLE IF NOT EXISTS certificates (
        id serial PRIMARY KEY,
        code text NOT NULL,
        holder_name text NOT NULL,
        type text NOT NULL DEFAULT 'donante',
        title text NOT NULL,
        description text,
        campaign_id integer REFERENCES campaigns(id) ON DELETE SET NULL,
        issued_at text NOT NULL,
        status text NOT NULL DEFAULT 'issued',
        revoked_at timestamp,
        revocation_reason text,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_certificates_code ON certificates (code);
      CREATE INDEX IF NOT EXISTS idx_certificates_status ON certificates (status);
      CREATE INDEX IF NOT EXISTS idx_certificates_campaign ON certificates (campaign_id);

      -- Mismos valores que los catálogos de la aplicación (lib/certificates.ts).
      ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_type_check;
      ALTER TABLE certificates ADD CONSTRAINT certificates_type_check
        CHECK (type IN ('donante','voluntario','auspiciador','colaborador','reconocimiento')) NOT VALID;

      ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_status_check;
      ALTER TABLE certificates ADD CONSTRAINT certificates_status_check
        CHECK (status IN ('issued','revoked')) NOT VALID;
    `,
  },
  {
    name: "025_donation_consents.sql",
    sql: `
      -- Fase 4 (V7.1): consentimiento explícito del donante para el
      -- reconocimiento público. ADITIVA: crea una tabla nueva, no toca ninguna
      -- existente ni reinterpreta datos históricos.
      --
      -- APPEND-ONLY: cada fila es una DECISIÓN (otorgar o revocar) con su fecha,
      -- la VERSIÓN del texto aceptado y quién la registró. El estado vigente es
      -- la última decisión por (donación, alcance); el historial completo queda
      -- conservado, de modo que revocar no borra nada (no se destruyen registros
      -- contables) y siempre se puede auditar quién cambió qué y cuándo.
      --
      -- Los alcances coinciden con el catálogo de lib/donor-consent.ts:
      --   public_name  → publicar el nombre del donante
      --   public_proof → publicar la imagen del comprobante
      --   public_photo → autorizar el uso de fotografías en reconocimientos
      CREATE TABLE IF NOT EXISTS donation_consents (
        id serial PRIMARY KEY,
        donation_id integer NOT NULL REFERENCES donations(id) ON DELETE CASCADE,
        donor_id integer REFERENCES donors(id) ON DELETE SET NULL,
        scope text NOT NULL,
        granted boolean NOT NULL,
        version text NOT NULL,
        reason text,
        recorded_by text,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_donation_consents_donation
        ON donation_consents (donation_id, scope);
      CREATE INDEX IF NOT EXISTS idx_donation_consents_donor
        ON donation_consents (donor_id);

      -- Mismos valores que el catálogo de la aplicación (lib/donor-consent.ts).
      ALTER TABLE donation_consents DROP CONSTRAINT IF EXISTS donation_consents_scope_check;
      ALTER TABLE donation_consents ADD CONSTRAINT donation_consents_scope_check
        CHECK (scope IN ('public_name','public_proof','public_photo')) NOT VALID;
    `,
  },
  {
    name: "026_campaign_demo_purge.sql",
    sql: `
      -- V7.2: designación y PURGA DEFINITIVA de campañas DEMO.
      -- ADITIVA: añade columnas con valor por defecto y una tabla nueva; no
      -- reinterpreta ni borra ningún dato existente.
      --
      -- campaigns.is_demo es la DECLARACIÓN explícita y auditada de que una
      -- campaña contiene datos de prueba. Es condición NECESARIA pero NO
      -- SUFICIENTE para la purga: el análisis de seguridad del servidor sigue
      -- bloqueando la operación si detecta dinero conciliado, documentos de
      -- gasto, bienes con flujo real, evidencias documentales o asientos cuyo
      -- origen no pertenezca a la campaña. Nunca se asume que un dato es
      -- ficticio por su nombre ni por la indicación del administrador.
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS demo_marked_at timestamp;
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS demo_marked_by text;

      -- Respaldo verificable de cada purga DEMO. SIN clave foránea a campaigns
      -- a propósito: el respaldo debe SOBREVIVIR al borrado de la campaña (es la
      -- copia de seguridad y el manifiesto de la operación). manifest_hash es
      -- el SHA-256 del snapshot normalizado: cualquiera puede recomputarlo y
      -- comprobar que el respaldo no se alteró después.
      CREATE TABLE IF NOT EXISTS campaign_purge_backups (
        id serial PRIMARY KEY,
        campaign_id integer NOT NULL,
        campaign_title text NOT NULL,
        campaign_status text NOT NULL,
        manifest_hash text NOT NULL,
        algorithm text NOT NULL DEFAULT 'sha256',
        snapshot jsonb NOT NULL,
        reason text NOT NULL,
        performed_by text,
        performed_by_id text,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_campaign_purge_backups_campaign
        ON campaign_purge_backups (campaign_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_purge_backups_created
        ON campaign_purge_backups (created_at DESC);
    `,
  },
  {
    name: "027_donation_annulment.sql",
    sql: `
      -- V7.2.2: ANULACIÓN CONTABLE de una donación ya confirmada.
      -- ADITIVA: añade columnas y AMPLÍA el CHECK de estados; no borra ni
      -- reinterpreta ningún dato existente.
      --
      -- Por qué no se borra: una donación confirmada ya tiene un asiento en el
      -- libro append-only y encadenado por hashes. Borrarla dejaría un asiento
      -- huérfano (el informe de integridad lo señalaría como 'movementsWithoutSource')
      -- y rompería la cadena. La corrección correcta —y la que documenta el
      -- propio informe— es un ASIENTO COMPENSATORIO autorizado y trazable.
      --
      -- 'annulled' sale de TODAS las cifras sin tocar ninguna consulta: los
      -- agregados (recaudado, donantes, transparencia, dashboard) filtran por
      -- CONFIRMED_DONATION_STATUSES = ('approved','reconciled').
      ALTER TABLE donations ADD COLUMN IF NOT EXISTS voided_at timestamp;
      ALTER TABLE donations ADD COLUMN IF NOT EXISTS voided_by text;
      ALTER TABLE donations ADD COLUMN IF NOT EXISTS void_reason text;

      -- NOT VALID: las filas históricas no se revisan (una migración no puede
      -- fallar por datos viejos), pero las escrituras NUEVAS sí se comprueban.
      ALTER TABLE donations DROP CONSTRAINT IF EXISTS donations_status_check;
      ALTER TABLE donations ADD CONSTRAINT donations_status_check
        CHECK (status IN ('pending','approved','rejected','reconciled','annulled')) NOT VALID;
    `,
  },
  {
    name: "028_env_superadmin_2fa.sql",
    sql: `
      -- V7.2.3: 2FA (TOTP) del superadministrador de respaldo por variables de
      -- entorno. ADITIVA: una tabla nueva de UNA sola fila; no toca nada más.
      --
      -- El superadmin de entorno (ADMIN_USERNAME/ADMIN_PASSWORD) no tiene fila en
      -- admin_users, así que no tenía dónde guardar su secreto TOTP: /admin/2fa/*
      -- le respondía 404 y quedaba SIEMPRE protegido solo por contraseña. Como
      -- app.ts exige esas variables en producción, el panel tenía una entrada sin
      -- segundo factor y activar 2FA en un usuario de tabla no protegía del todo.
      --
      -- Por qué NO se guarda en la tabla settings: GET /admin/settings devuelve
      -- TODAS las claves (y el panel las pinta), y PUT /admin/settings/:key
      -- sobrescribe cualquiera. Con tabla propia el secreto es inalcanzable desde
      -- los endpoints genéricos de configuración.
      --
      -- El CHECK garantiza que solo exista la fila 1: un único secreto.
      CREATE TABLE IF NOT EXISTS env_superadmin_2fa (
        id integer PRIMARY KEY DEFAULT 1,
        secret text,
        enabled boolean NOT NULL DEFAULT false,
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT env_superadmin_2fa_singleton CHECK (id = 1)
      );

      -- Fila única lista para usar: el resto del código puede leerla sin
      -- preocuparse por su ausencia.
      INSERT INTO env_superadmin_2fa (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    `,
  },
  {
    name: "029_expense_classifications.sql",
    sql: `
      -- V11: clasificación MANUAL de un gasto (DEMO / real / pendiente).
      --
      -- Por qué: la clave ajena de campaign_expenses.campaign_id se añadió con
      -- NOT VALID (migración 025), así que PostgreSQL no revisó las filas que ya
      -- existían. En producción eso deja gastos que apuntan a campañas
      -- desaparecidas, y sin una declaración explícita del superadmin quedaban
      -- bloqueados para siempre (no hay campaña que los declare DEMO).
      --
      -- SIN CLAVE FORÁNEA a campaign_expenses A PROPÓSITO: la clasificación debe
      -- SOBREVIVIR al borrado del gasto, porque es la prueba de por qué se destruyó.
      --
      -- ADITIVA: una tabla nueva; no toca ninguna otra.
      CREATE TABLE IF NOT EXISTS expense_classifications (
        id serial PRIMARY KEY,
        expense_id integer NOT NULL,
        classification text NOT NULL,
        reason text NOT NULL,
        evidence text,
        classified_by text,
        classified_by_id text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT expense_classifications_expense_unique UNIQUE (expense_id),
        CONSTRAINT expense_classifications_value_check
          CHECK (classification IN ('demo','real','pending'))
      );

      CREATE INDEX IF NOT EXISTS idx_expense_classifications_expense
        ON expense_classifications (expense_id);
    `,
  },
  {
    name: "030_campaign_closures.sql",
    sql: `
      -- V14-2.3: cierre financiero de campaña.
      --
      -- DECISIÓN: el cierre es un ACTO CONTABLE fechado y firmado, no un campo de
      -- estado. Esta tabla es APPEND-ONLY: cada fila es un evento (closed o
      -- reopened) con quién, cuándo, por qué y el informe de cifras congelado con
      -- su SHA-256. El estado actual se deriva del último evento, así que reabrir no
      -- borra la prueba de que se cerró ni quién lo autorizó.
      --
      -- SIN CLAVE FORÁNEA a campaigns A PROPÓSITO: el cierre debe sobrevivir a la
      -- purga de una campaña DEMO (es la prueba de que existió y cómo se cerró).
      --
      -- ADITIVA: una tabla nueva; no toca ninguna otra.
      CREATE TABLE IF NOT EXISTS campaign_closures (
        id serial PRIMARY KEY,
        campaign_id integer NOT NULL,
        event text NOT NULL,
        reason text NOT NULL,
        report jsonb NOT NULL,
        manifest_hash text NOT NULL,
        performed_by text,
        performed_by_id text,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT campaign_closures_event_check CHECK (event IN ('closed','reopened'))
      );

      CREATE INDEX IF NOT EXISTS idx_campaign_closures_campaign
        ON campaign_closures (campaign_id, id);
    `,
  },
  {
    name: "031_institutional_identity.sql",
    sql: `
      -- V15 (Fase 3): identidad institucional administrable por el superadmin.
      --
      -- FILA ÚNICA (id = 1) con la restricción CHECK que lo garantiza. Dos
      -- columnas JSONB separan el BORRADOR (lo que se edita) del PUBLICADO (lo
      -- que consume la web pública); published IS NULL significa «sin publicar».
      -- Publicar copia draft→published y sella la fecha.
      --
      -- ADITIVA: una tabla nueva; no toca ninguna otra. Rollback: DROP TABLE.
      CREATE TABLE IF NOT EXISTS institutional_identity (
        id integer PRIMARY KEY DEFAULT 1,
        draft jsonb NOT NULL DEFAULT '{}'::jsonb,
        published jsonb,
        published_at timestamp,
        updated_at timestamp NOT NULL DEFAULT now(),
        updated_by text,
        CONSTRAINT institutional_identity_single_row CHECK (id = 1)
      );

      INSERT INTO institutional_identity (id) VALUES (1)
        ON CONFLICT (id) DO NOTHING;
    `,
  },
  {
    name: "032_institutional_identity_version.sql",
    sql: `
      -- V18: control de concurrencia OPTIMISTA de la identidad institucional.
      --
      -- Dos pestañas o dos superadmins podian sobrescribirse el borrador sin
      -- aviso. La columna version se incrementa en cada guardado/publicacion y el
      -- cliente debe enviar la version que leyo: si no coincide, la API responde
      -- 409 y no escribe NADA.
      --
      -- ADITIVA: añade una columna con valor por defecto. Rollback: DROP COLUMN.
      ALTER TABLE institutional_identity
        ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
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
