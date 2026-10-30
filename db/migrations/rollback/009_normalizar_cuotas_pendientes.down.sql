-- Rollback de 009: devuelve a PENDIENTE las cuotas que la migración pasó a VENCIDA (solo si siguen sin pago) y borra el respaldo.
-- Uso:  npm run db:rollback:pendientes
UPDATE cuota
SET estado_cuota_id = (SELECT id FROM estado_cuota WHERE nombre = 'PENDIENTE')
WHERE id IN (SELECT cuota_id FROM _bk_009_cuota_pendiente)
  AND estado_cuota_id = (SELECT id FROM estado_cuota WHERE nombre = 'VENCIDA')
  AND id NOT IN (SELECT cuota_id FROM pago);

DROP TABLE IF EXISTS _bk_009_cuota_pendiente;
