-- ============================================================================
-- 009 - Normaliza solicitudes de pago pendientes duplicadas (datos, sin cambios de esquema)
--   Regla de negocio: un cliente tiene como mucho UNA cuota PENDIENTE sin pago. Antes se acumulaban
--   (alta en recepción + cada vez que el cliente elegía otro plan). Por cada cliente con varias, se conserva
--   la MÁS RECIENTE como PENDIENTE y las anteriores pasan a VENCIDA (no se borra nada: quedan como rastro).
--   Una cuota VENCIDA sin pago nunca cuenta como membresía (ver computeMembership), así que no cambia
--   ningún acceso ni ningún ingreso.
-- Reversible: guarda los ids tocados en _bk_009_cuota_pendiente; el rollback los vuelve a PENDIENTE.
-- Idempotente: volver a correrlo no cambia nada una vez normalizado.
-- Uso:       npm run db:migrate:pendientes
-- Rollback:  npm run db:rollback:pendientes
-- ============================================================================

CREATE TABLE IF NOT EXISTS _bk_009_cuota_pendiente (
  cuota_id INT NOT NULL PRIMARY KEY,
  fecha_normalizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO _bk_009_cuota_pendiente (cuota_id)
SELECT c.id
FROM cuota c
JOIN estado_cuota ec ON ec.id = c.estado_cuota_id AND ec.nombre = 'PENDIENTE'
LEFT JOIN pago p ON p.cuota_id = c.id
WHERE p.id IS NULL
  AND c.id < (
    SELECT MAX(c2.id)
    FROM cuota c2
    JOIN estado_cuota ec2 ON ec2.id = c2.estado_cuota_id AND ec2.nombre = 'PENDIENTE'
    LEFT JOIN pago p2 ON p2.cuota_id = c2.id
    WHERE c2.cliente_id = c.cliente_id AND p2.id IS NULL
  );

UPDATE cuota
SET estado_cuota_id = (SELECT id FROM estado_cuota WHERE nombre = 'VENCIDA')
WHERE id IN (SELECT cuota_id FROM _bk_009_cuota_pendiente)
  AND estado_cuota_id = (SELECT id FROM estado_cuota WHERE nombre = 'PENDIENTE');
