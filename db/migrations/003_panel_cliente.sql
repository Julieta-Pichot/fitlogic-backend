-- ============================================================================
-- 003 - Panel del cliente
--   * tipo_notificacion: VENCIMIENTO_APTO_FISICO e INSCRIPCION_CLASE (INSERT IGNORE).
--   * notificacion.clave_dedup: clave de deduplicación para avisos que no dependen de una
--     clase (p. ej. 'cuota:12', 'apto:2026-12-15'). UNIQUE(usuario_id, tipo_notificacion_id,
--     clave_dedup): los NULL no colisionan, así que las notificaciones sin clave no se ven afectadas.
-- Idempotente (MySQL 8 y MariaDB).
-- Uso:  npx prisma db execute --file db/migrations/003_panel_cliente.sql --schema prisma/schema.prisma
-- ============================================================================

INSERT IGNORE INTO tipo_notificacion (nombre) VALUES
    ('VENCIMIENTO_APTO_FISICO'),
    ('INSCRIPCION_CLASE');

SET @ddl = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE notificacion ADD COLUMN clave_dedup VARCHAR(100) NULL',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'notificacion' AND column_name = 'clave_dedup');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE notificacion ADD CONSTRAINT uq_notificacion_clave UNIQUE (usuario_id, tipo_notificacion_id, clave_dedup)',
    'SELECT 1')
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'notificacion' AND constraint_name = 'uq_notificacion_clave');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
