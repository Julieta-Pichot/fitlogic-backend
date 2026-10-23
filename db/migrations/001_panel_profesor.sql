-- ============================================================================
-- 001 - Panel del profesor
--   * clase_dia: días de repetición de las clases recurrentes (análoga a rutina_dia).
--   * notificacion.clase_id / fecha_ocurrencia: referencia a la ocurrencia de clase
--     que originó el aviso, para generarlo una sola vez (CLASE_PROXIMA).
-- Idempotente: se puede ejecutar varias veces (MySQL 8 y MariaDB).
-- Uso:  npx prisma db execute --file db/migrations/001_panel_profesor.sql --schema prisma/schema.prisma
-- ============================================================================

CREATE TABLE IF NOT EXISTS clase_dia (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    clase_id    INT NOT NULL,
    dia_semana  INT NOT NULL,
    CONSTRAINT fk_clase_dia_clase FOREIGN KEY (clase_id) REFERENCES clase(id),
    CONSTRAINT uq_clase_dia UNIQUE (clase_id, dia_semana)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- notificacion.clase_id
SET @ddl = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE notificacion ADD COLUMN clase_id INT NULL',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'notificacion' AND column_name = 'clase_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- notificacion.fecha_ocurrencia
SET @ddl = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE notificacion ADD COLUMN fecha_ocurrencia DATETIME NULL',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'notificacion' AND column_name = 'fecha_ocurrencia');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- FK notificacion.clase_id -> clase.id
SET @ddl = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE notificacion ADD CONSTRAINT fk_notificacion_clase FOREIGN KEY (clase_id) REFERENCES clase(id)',
    'SELECT 1')
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'notificacion' AND constraint_name = 'fk_notificacion_clase');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Una sola notificación por usuario, tipo, clase y ocurrencia (los NULL no colisionan,
-- así que las notificaciones sin clase no se ven afectadas).
SET @ddl = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE notificacion ADD CONSTRAINT uq_notificacion_ocurrencia UNIQUE (usuario_id, tipo_notificacion_id, clase_id, fecha_ocurrencia)',
    'SELECT 1')
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'notificacion' AND constraint_name = 'uq_notificacion_ocurrencia');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
