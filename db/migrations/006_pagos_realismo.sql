-- ============================================================================
-- 006 - Pagos realistas y auditoría de Mercado Pago
--   * pago: monto (bruto) + monto_neto, comision, medio_pago, ultimos_digitos, fecha_acreditacion.
--     Los pagos existentes quedan con NULL en las columnas nuevas (la UI lo tolera).
--   * mp_evento_pago: auditoría e idempotencia de cada notificación / verificación de Mercado Pago.
--     NUNCA guarda datos de tarjeta ni el Access Token (payload_resumen solo lleva campos no sensibles).
--   * tipo_notificacion PAGO_ACREDITADO.
-- Idempotente (MySQL 8 y MariaDB).
-- Uso:  npx prisma db execute --file db/migrations/006_pagos_realismo.sql --schema prisma/schema.prisma
-- ============================================================================

SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE pago ADD COLUMN monto_neto DECIMAL(10,2) NULL', 'SELECT 1')
  FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pago' AND column_name = 'monto_neto');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE pago ADD COLUMN comision DECIMAL(10,2) NULL', 'SELECT 1')
  FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pago' AND column_name = 'comision');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE pago ADD COLUMN medio_pago VARCHAR(50) NULL', 'SELECT 1')
  FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pago' AND column_name = 'medio_pago');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE pago ADD COLUMN ultimos_digitos VARCHAR(4) NULL', 'SELECT 1')
  FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pago' AND column_name = 'ultimos_digitos');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE pago ADD COLUMN fecha_acreditacion DATETIME NULL', 'SELECT 1')
  FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pago' AND column_name = 'fecha_acreditacion');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE pago ADD CONSTRAINT chk_pago_importes CHECK ((monto_neto IS NULL OR monto_neto >= 0) AND (comision IS NULL OR comision >= 0))',
    'SELECT 1')
  FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'pago' AND constraint_name = 'chk_pago_importes');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS mp_evento_pago (
    id              INT           NOT NULL AUTO_INCREMENT,
    mp_payment_id   VARCHAR(50)   NOT NULL,
    cuota_id        INT           NULL,
    estado          VARCHAR(30)   NOT NULL,
    detalle_estado  VARCHAR(100)  NULL,
    monto           DECIMAL(10,2) NULL,
    origen          VARCHAR(20)   NOT NULL,
    procesado       TINYINT(1)    NOT NULL DEFAULT 0,
    payload_resumen JSON          NULL,
    fecha_recepcion DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_mp_evento_payment (mp_payment_id),
    KEY idx_mp_evento_cuota (cuota_id),
    KEY idx_mp_evento_fecha (fecha_recepcion),
    CONSTRAINT fk_mp_evento_cuota FOREIGN KEY (cuota_id) REFERENCES cuota (id)
);

INSERT IGNORE INTO tipo_notificacion (nombre) VALUES ('PAGO_ACREDITADO');
