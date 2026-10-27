-- ============================================================================
-- 008 - Precisión de fechas alineada con Prisma (DATETIME -> DATETIME(3))
--   cuota.mp_expira_en, mp_evento_pago.fecha_recepcion, notificacion.fecha_ocurrencia, pago.fecha_acreditacion.
--   Sin DATETIME(3) MySQL redondea al segundo lo que escribe Prisma (milisegundos). Ensanchar la precisión
--   NO modifica los valores existentes (quedan con .000). No toca claves foráneas ni índices.
-- Idempotente (MySQL 8 y MariaDB): solo modifica las columnas que todavía tienen precisión 0.
-- Uso:  npx prisma db execute --file db/migrations/008_alinear_precision_fechas.sql --schema prisma/schema.prisma
-- ============================================================================

SET @ddl = (SELECT IF(COUNT(*) = 1, 'ALTER TABLE cuota MODIFY mp_expira_en DATETIME(3) NULL', 'SELECT 1')
  FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cuota' AND column_name = 'mp_expira_en' AND datetime_precision = 0);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 1, 'ALTER TABLE mp_evento_pago MODIFY fecha_recepcion DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'SELECT 1')
  FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'mp_evento_pago' AND column_name = 'fecha_recepcion' AND datetime_precision = 0);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 1, 'ALTER TABLE notificacion MODIFY fecha_ocurrencia DATETIME(3) NULL', 'SELECT 1')
  FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notificacion' AND column_name = 'fecha_ocurrencia' AND datetime_precision = 0);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 1, 'ALTER TABLE pago MODIFY fecha_acreditacion DATETIME(3) NULL', 'SELECT 1')
  FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pago' AND column_name = 'fecha_acreditacion' AND datetime_precision = 0);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
