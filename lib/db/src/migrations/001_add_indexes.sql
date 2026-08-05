-- Índices para optimizar consultas frecuentes
-- NOTA: corregido contra el esquema real (donations.status, pets.status).
-- La versión canónica que ejecuta el servidor está embebida en lib/db/src/migrate.ts.
-- Campañas: filtrado por estado y fechas
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON campaigns(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_created ON campaigns(created_at DESC);

-- Donaciones: filtrado por campaña y fecha
CREATE INDEX IF NOT EXISTS idx_donations_campaign ON donations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_donations_created ON donations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);

-- Mascotas: filtrado por estado de adopción
CREATE INDEX IF NOT EXISTS idx_pets_adoption_status ON pets(status);
CREATE INDEX IF NOT EXISTS idx_pets_created ON pets(created_at DESC);

-- Voluntarios: filtrado por estado
CREATE INDEX IF NOT EXISTS idx_volunteers_status ON volunteers(status);

-- Reportes comunitarios: filtrado por estado y fecha
CREATE INDEX IF NOT EXISTS idx_reports_status ON community_reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created ON community_reports(created_at DESC);

-- Audit logs: filtrado por usuario y fecha
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
