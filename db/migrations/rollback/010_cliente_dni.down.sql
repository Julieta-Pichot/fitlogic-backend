-- 010 (rollback): deshace cliente.dni. Idempotente.

-- 1) Borrar el índice único si existe
SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cliente'
    AND INDEX_NAME = 'cliente_dni_key'
);
SET @sql := IF(@idx > 0,
  'ALTER TABLE cliente DROP INDEX cliente_dni_key',
  'SELECT ''indice cliente_dni_key no existe'' AS aviso');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Borrar la columna si existe
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cliente'
    AND COLUMN_NAME = 'dni'
);
SET @sql := IF(@col > 0,
  'ALTER TABLE cliente DROP COLUMN dni',
  'SELECT ''cliente.dni no existe'' AS aviso');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;