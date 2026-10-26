-- ============================================================================
-- 005 - Objetivo de racha sin valor por defecto
--   cliente.objetivo_dias_racha pasa a NULL-able, DEFAULT NULL (antes INT NOT NULL DEFAULT 3).
--   NO se modifican los valores de los clientes existentes. CHECK entre 1 y 7 (NULL permitido).
-- Idempotente (MySQL 8 y MariaDB).
-- Uso:  npx prisma db execute --file db/migrations/005_racha_nullable.sql --schema prisma/schema.prisma
-- ============================================================================

SET @ddl = (SELECT IF(COUNT(*) = 1,
    'ALTER TABLE cliente MODIFY objetivo_dias_racha INT NULL DEFAULT NULL',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'cliente' AND column_name = 'objetivo_dias_racha'
    AND (is_nullable = 'NO' OR column_default IS NOT NULL));
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE cliente ADD CONSTRAINT chk_cliente_racha CHECK (objetivo_dias_racha IS NULL OR (objetivo_dias_racha BETWEEN 1 AND 7))',
    'SELECT 1')
  FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cliente' AND constraint_name = 'chk_cliente_racha');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
