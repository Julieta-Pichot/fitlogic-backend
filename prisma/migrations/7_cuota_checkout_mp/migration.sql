-- ============================================================================
-- 007 - Datos del checkout de Mercado Pago en la cuota
--   cuota.mp_preference_id : id de la última preferencia creada para la cuota.
--   cuota.mp_expira_en     : vencimiento de esa preferencia. SOLO las cuotas creadas por un checkout lo tienen,
--                            así el mantenimiento nunca toca las cuotas pendientes del alta de recepción.
-- Idempotente (MySQL 8 y MariaDB).
-- Uso:  npx prisma db execute --file db/migrations/007_cuota_checkout_mp.sql --schema prisma/schema.prisma
-- ============================================================================

SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE cuota ADD COLUMN mp_preference_id VARCHAR(100) NULL', 'SELECT 1')
  FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cuota' AND column_name = 'mp_preference_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE cuota ADD COLUMN mp_expira_en DATETIME NULL', 'SELECT 1')
  FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cuota' AND column_name = 'mp_expira_en');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
