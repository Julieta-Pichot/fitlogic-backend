import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError.js';
import { quotaPeriod } from '../utils/membership.js';
import { msToIsoDate, dbDateMs } from '../utils/timezone.js';

const ddmmyyyy = (date) => msToIsoDate(dbDateMs(date)).split('-').reverse().join('/');

// Activación de una cuota paga: la comparten recepción (efectivo) y Mercado Pago para que ambos caminos
// den exactamente el mismo resultado. Se ejecuta DENTRO de una transacción (`tx`) y el llamador ya
// bloqueó la fila del cliente (SELECT ... FOR UPDATE).
//
// Regla de fechas: la cuota arranca el día del pago (hora Buenos Aires) y vence `duracion_dias` después
// (quotaPeriod). Decisión documentada: la cuota ACTIVA anterior del cliente queda REEMPLAZADA, o sea
// pasa a VENCIDA en la misma transacción SIN tocar sus fechas (queda el rastro de lo que cubría).
// `dedupKey`: clave anti-duplicados de la notificación (Mercado Pago: `pago:<mp_payment_id>`).
// `pago` = { metodoPagoId, monto, montoNeto, comision, medioPago, ultimosDigitos, fechaAcreditacion, referenciaExterna }
export const activateQuota = async (tx, { cuotaId, paidAt, pago, dedupKey = null }, { allowAbandoned = false } = {}) => {
  const cuota = await tx.cuota.findUnique({
    where: { id: cuotaId },
    include: { plan: true, estadoCuota: true, pago: true, cliente: { include: { estadoCliente: true, usuario: true } } },
  });
  if (!cuota) throw new NotFoundError('Cuota no encontrada', 'CUOTA_NO_ENCONTRADA');
  if (cuota.pago) throw new ConflictError('La cuota ya tiene un pago registrado', 'CUOTA_YA_PAGA');
  // Una solicitud de checkout marcada VENCIDA por abandono revive si luego llega su pago aprobado.
  const revivable = allowAbandoned && cuota.estadoCuota.nombre === 'VENCIDA' && cuota.mpExpiraEn;
  if (cuota.estadoCuota.nombre !== 'PENDIENTE' && !revivable) throw new ConflictError('La cuota no está pendiente de confirmación', 'CUOTA_NO_PENDIENTE');

  const [active, expired] = await Promise.all([
    tx.estadoCuota.findUnique({ where: { nombre: 'ACTIVA' } }),
    tx.estadoCuota.findUnique({ where: { nombre: 'VENCIDA' } }),
  ]);
  if (!active || !expired) throw new ValidationError('Faltan los estados de cuota ACTIVA / VENCIDA');

  const period = quotaPeriod(paidAt, cuota.plan.duracionDias);

  await tx.cuota.updateMany({
    where: { clienteId: cuota.clienteId, id: { not: cuota.id }, estadoCuotaId: active.id },
    data: { estadoCuotaId: expired.id },
  });
  await tx.cuota.update({ where: { id: cuota.id }, data: { estadoCuotaId: active.id, ...period } });
  const created = await tx.pago.create({ data: { cuotaId: cuota.id, fechaPago: paidAt, ...pago } });

  // Un cliente INHABILITADO_PAGO vuelve a HABILITADO al pagar. INHABILITADO_BAJA no se toca.
  if (cuota.cliente.estadoCliente.nombre === 'INHABILITADO_PAGO') {
    const enabled = await tx.estadoCliente.findUnique({ where: { nombre: 'HABILITADO' } });
    if (enabled) await tx.cliente.update({ where: { id: cuota.clienteId }, data: { estadoClienteId: enabled.id } });
  }

  await notifyPaymentCredited(tx, {
    usuarioId: cuota.cliente.usuarioId,
    dedupKey: dedupKey ?? `pago:recepcion:${created.id}`,
    planName: cuota.plan.nombre,
    amount: Number(pago.monto),
    until: period.fechaVencimiento,
  });

  return { cuotaId: cuota.id, clienteId: cuota.clienteId, pagoId: created.id, ...period, plan: cuota.plan };
};

// INSERT IGNORE sobre notificacion (UNIQUE usuario + tipo + clave_dedup): una notificación por pago.
export const notifyPaymentCredited = async (tx, { usuarioId, dedupKey, planName, amount, until }) => {
  const tipo = await tx.tipoNotificacion.upsert({ where: { nombre: 'PAGO_ACREDITADO' }, update: {}, create: { nombre: 'PAGO_ACREDITADO' } });
  await tx.notificacion.createMany({
    data: [
      {
        usuarioId,
        tipoNotificacionId: tipo.id,
        claveDedup: dedupKey,
        titulo: 'Pago acreditado',
        mensaje: `Recibimos tu pago de $${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} del plan ${planName}. Tu membresía está activa hasta el ${ddmmyyyy(until)}.`,
      },
    ],
    skipDuplicates: true,
  });
};
