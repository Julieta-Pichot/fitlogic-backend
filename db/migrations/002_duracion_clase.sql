-- ============================================================================
-- 002 - Duración de la clase
--   * clase.duracion_minutos: permite calcular la hora de fin (fecha_hora + duración)
--     y detectar solapamientos de sala/profesor. Las clases existentes quedan en 60.
-- Idempotente (MySQL 8 y MariaDB).
-- Uso:  npx prisma db execute --file db/migrations/002_duracion_clase.sql --schema prisma/schema.prisma
-- ============================================================================

SET @ddl = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE clase ADD COLUMN duracion_minutos INT NOT NULL DEFAULT 60',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'clase' AND column_name = 'duracion_minutos');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE clase ADD CONSTRAINT chk_clase_duracion CHECK (duracion_minutos > 0)',
    'SELECT 1')
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'clase' AND constraint_name = 'chk_clase_duracion');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
