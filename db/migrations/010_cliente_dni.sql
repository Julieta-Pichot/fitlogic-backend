-- Uso:  npx prisma db execute --file db/migrations/010_cliente_dni.sql --schema prisma/schema.prisma
-- 010: agrega cliente.dni (opcional y único). Idempotente: se puede correr N veces.

-- 1) Columna dni (acepta NULL: los clientes existentes quedan sin DNI y no se rompen)
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cliente'
    AND COLUMN_NAME = 'dni'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE cliente ADD COLUMN dni VARCHAR(15) NULL',
  'SELECT ''cliente.dni ya existe, no se hace nada'' AS aviso');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Índice único sobre dni (no permite dos clientes con el mismo DNI)
SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cliente'
    AND INDEX_NAME = 'cliente_dni_key'
);
SET @sql := IF(@idx = 0,
  'ALTER TABLE cliente ADD UNIQUE INDEX cliente_dni_key (dni)',
  'SELECT ''indice cliente_dni_key ya existe, no se hace nada'' AS aviso');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;