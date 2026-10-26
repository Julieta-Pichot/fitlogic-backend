-- ============================================================================
-- 004 - Información nutricional completa de las recetas
--   Los valores nutricionales son POR PORCIÓN; `porciones` indica a cuántas personas rinde la receta.
--   Todas las columnas son NULL-ables: las recetas existentes quedan sin datos ("No informado"), nunca en 0.
--   otro_dato_nutricional = campo libre "Otro dato nutricional" del modal del profesor (ej. "Fibra 6g").
-- Idempotente (MySQL 8 y MariaDB).
-- Uso:  npx prisma db execute --file db/migrations/004_receta_nutricion.sql --schema prisma/schema.prisma
-- ============================================================================

SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE receta ADD COLUMN proteinas_g DECIMAL(6,1) NULL', 'SELECT 1')
  FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'receta' AND column_name = 'proteinas_g');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE receta ADD COLUMN carbohidratos_g DECIMAL(6,1) NULL', 'SELECT 1')
  FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'receta' AND column_name = 'carbohidratos_g');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE receta ADD COLUMN grasas_g DECIMAL(6,1) NULL', 'SELECT 1')
  FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'receta' AND column_name = 'grasas_g');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE receta ADD COLUMN porciones INT NULL', 'SELECT 1')
  FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'receta' AND column_name = 'porciones');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE receta ADD COLUMN otro_dato_nutricional VARCHAR(150) NULL', 'SELECT 1')
  FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'receta' AND column_name = 'otro_dato_nutricional');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE receta ADD CONSTRAINT chk_receta_nutricion CHECK ((calorias IS NULL OR calorias >= 0) AND (proteinas_g IS NULL OR proteinas_g >= 0) AND (carbohidratos_g IS NULL OR carbohidratos_g >= 0) AND (grasas_g IS NULL OR grasas_g >= 0) AND (porciones IS NULL OR porciones >= 1))',
    'SELECT 1')
  FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'receta' AND constraint_name = 'chk_receta_nutricion');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
