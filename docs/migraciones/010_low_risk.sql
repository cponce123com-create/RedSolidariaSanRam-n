-- ============================================================================
-- Migración 010 (ENSAYADA en réplica local — PENDIENTE DE AUTORIZACIÓN)
-- ============================================================================
-- Contiene SOLO cambios aditivos / de bajo riesgo. NO modifica datos.
--   * DB-07: índices por campaign_id en las tablas de contenido.
--   * A3 / DB-02: el ledger (campaign_movements) pasa de ON DELETE CASCADE a
--     ON DELETE RESTRICT, para que no se puedan borrar movimientos de auditoría
--     en cascada al eliminar una campaña.
--
-- Validado en la réplica local (PostgreSQL 17.7) con los datos reales:
--   4 índices creados; FK = RESTRICT; borrar una campaña con ledger FALLA (correcto).
--
-- NO está incluida todavía en lib/db/src/migrate.ts a propósito: añadirla haría
-- que el próximo despliegue la aplicara automáticamente al arrancar.
-- ============================================================================

-- DB-07: índices por campaña en las tablas de contenido
CREATE INDEX IF NOT EXISTS idx_expenses_campaign ON campaign_expenses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_evidence_campaign ON campaign_evidence(campaign_id);
CREATE INDEX IF NOT EXISTS idx_updates_campaign ON campaign_updates(campaign_id);
CREATE INDEX IF NOT EXISTS idx_images_campaign ON campaign_images(campaign_id);

-- A3 / DB-02: el ledger no debe borrarse en cascada
ALTER TABLE campaign_movements DROP CONSTRAINT campaign_movements_campaign_id_fkey;
ALTER TABLE campaign_movements ADD CONSTRAINT campaign_movements_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE RESTRICT;
