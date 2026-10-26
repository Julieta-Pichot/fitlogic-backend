import prisma from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import { buildPaginatedResponse, parsePaginationParams } from '../utils/pagination.js';
import { getGymParts, gymDateKey, gymWallTimeToDate, shiftCalendarDay } from '../utils/timezone.js';
import { dbDateMs, msToIsoDate } from '../utils/timezone.js';
import * as mercadopago from './mercadopago.service.js';

// Ingresos del gimnasio. TODOS los límites de día y mes se calculan en hora Buenos Aires (America/Argentina/Buenos_Aires):
// un pago hecho a las 23:30 del 31/10 pertenece a octubre aunque en UTC ya sea noviembre.
//
// Importes por pago: bruto = pago.monto; comisión = pago.comision (NULL => 0); neto = pago.monto_neto (NULL => bruto).
// Los pagos anteriores a la migración 006 no tienen neto/comisión: se toman como "sin comisión informada".

const round2 = (value) => Math.round(value * 100) / 100;
const isoOf = ({ year, month, day }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const parseIso = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
};

// Instante de inicio de un día (YYYY-MM-DD) en Buenos Aires.
const dayStart = (iso) => {
  const { year, month, day } = parseIso(iso);
  return gymWallTimeToDate(year, month, day, 0, 0);
};
const nextDayStart = (iso) => {
  const next = shiftCalendarDay(parseIso(iso), 1);
  return gymWallTimeToDate(next.year, next.month, next.day, 0, 0);
};

// Rango [desde, hasta] (fechas inclusive) -> instantes [from, to). Por defecto: mes en curso hasta hoy.
export const resolveRange = ({ desde, hasta } = {}, now = new Date()) => {
  const today = getGymParts(now);
  const todayIso = isoOf(today);
  const from = desde ?? isoOf({ year: today.year, month: today.month, day: 1 });
  const to = hasta ?? todayIso;
  const valid = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  if (!valid(from) || !valid(to)) throw new ValidationError('Las fechas deben tener el formato AAAA-MM-DD', null, 'RANGO_INVALIDO');
  if (from > to) throw new ValidationError('La fecha "desde" no puede ser posterior a "hasta"', null, 'RANGO_INVALIDO');
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > 1830) throw new ValidationError('El rango no puede superar los 5 años', null, 'RANGO_INVALIDO');
  return { desde: from, hasta: to, dias: days, from: dayStart(from), to: nextDayStart(to) };
};

const money = (pago) => {
  const bruto = Number(pago.monto);
  const comision = pago.comision === null || pago.comision === undefined ? 0 : Number(pago.comision);
  const neto = pago.montoNeto === null || pago.montoNeto === undefined ? bruto : Number(pago.montoNeto);
  return { bruto, comision, neto };
};

const totals = (rows) => {
  const sum = rows.reduce(
    (acc, row) => {
      const { bruto, comision, neto } = money(row);
      return { bruto: acc.bruto + bruto, comision: acc.comision + comision, neto: acc.neto + neto };
    },
    { bruto: 0, comision: 0, neto: 0 }
  );
  const cantidad = rows.length;
  return {
    cantidad,
    bruto: round2(sum.bruto),
    comisiones: round2(sum.comision),
    neto: round2(sum.neto),
    ticketPromedio: cantidad ? round2(sum.bruto / cantidad) : 0,
  };
};

const fetchPayments = (from, to, where = {}) =>
  prisma.pago.findMany({
    where: { fechaPago: { gte: from, lt: to }, ...where },
    include: { metodoPago: true, cuota: { include: { plan: true } } },
    orderBy: [{ fechaPago: 'asc' }, { id: 'asc' }],
  });

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

export const getSummary = async (query = {}, now = new Date()) => {
  const today = getGymParts(now);
  const todayIso = isoOf(today);
  const monthStartIso = isoOf({ year: today.year, month: today.month, day: 1 });
  const prevMonth = today.month === 1 ? { year: today.year - 1, month: 12 } : { year: today.year, month: today.month - 1 };
  const prevStartIso = isoOf({ ...prevMonth, day: 1 });
  const range = resolveRange(query, now);

  const periodRows = async (fromIso, toIsoInclusive) => totals(await fetchPayments(dayStart(fromIso), nextDayStart(toIsoInclusive)));
  const prevEnd = isoOf(shiftCalendarDay({ year: today.year, month: today.month, day: 1 }, -1));

  const [hoy, mes, mesAnterior, rango] = await Promise.all([
    periodRows(todayIso, todayIso),
    periodRows(monthStartIso, todayIso),
    periodRows(prevStartIso, prevEnd),
    periodRows(range.desde, range.hasta),
  ]);

  return {
    zonaHoraria: 'America/Argentina/Buenos_Aires',
    hoy: { desde: todayIso, hasta: todayIso, ...hoy },
    mes: { desde: monthStartIso, hasta: todayIso, ...mes },
    mesAnterior: { desde: prevStartIso, hasta: prevEnd, ...mesAnterior },
    rango: { desde: range.desde, hasta: range.hasta, ...rango },
  };
};

// ---------------------------------------------------------------------------
// Desglose y gráfico
// ---------------------------------------------------------------------------

const breakdown = (rows, keyOf, labelOf) => {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, { clave: key, nombre: labelOf(row), rows: [] });
    groups.get(key).rows.push(row);
  }
  const grandTotal = rows.reduce((acc, row) => acc + money(row).bruto, 0);
  return [...groups.values()]
    .map((group) => {
      const t = totals(group.rows);
      return { clave: group.clave, nombre: group.nombre, ...t, porcentaje: grandTotal > 0 ? round2((t.bruto / grandTotal) * 100) : 0 };
    })
    .sort((a, b) => b.bruto - a.bruto);
};

export const getBreakdown = async (query = {}, now = new Date()) => {
  const range = resolveRange(query, now);
  const rows = await fetchPayments(range.from, range.to);
  return {
    rango: { desde: range.desde, hasta: range.hasta },
    total: totals(rows),
    porMetodo: breakdown(rows, (row) => row.metodoPago.nombre, (row) => row.metodoPago.nombre),
    porPlan: breakdown(rows, (row) => row.cuota.planId, (row) => row.cuota.plan.nombre),
  };
};

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// agrupar: 'dia' | 'mes' | 'auto' (día hasta 62 días de rango, mes si es más largo). Devuelve bruto y neto de cada
// punto para que el front alterne sin volver a pedir; los días/meses sin pagos van en 0.
export const getChart = async (query = {}, now = new Date()) => {
  const range = resolveRange(query, now);
  const requested = query.agrupar ?? 'auto';
  const groupBy = requested === 'auto' ? (range.dias <= 62 ? 'dia' : 'mes') : requested;
  if (!['dia', 'mes'].includes(groupBy)) throw new ValidationError('Agrupación inválida', null, 'AGRUPACION_INVALIDA');

  const rows = await fetchPayments(range.from, range.to);
  const buckets = new Map();
  const add = (key, label) => buckets.set(key, { clave: key, etiqueta: label, bruto: 0, neto: 0, cantidad: 0 });

  if (groupBy === 'dia') {
    for (let offset = 0; offset < range.dias; offset += 1) {
      const day = shiftCalendarDay(parseIso(range.desde), offset);
      add(isoOf(day), `${String(day.day).padStart(2, '0')}/${String(day.month).padStart(2, '0')}`);
    }
  } else {
    let cursor = { year: parseIso(range.desde).year, month: parseIso(range.desde).month };
    const last = parseIso(range.hasta);
    while (cursor.year < last.year || (cursor.year === last.year && cursor.month <= last.month)) {
      add(`${cursor.year}-${String(cursor.month).padStart(2, '0')}`, `${MONTHS[cursor.month - 1]} ${cursor.year}`);
      cursor = cursor.month === 12 ? { year: cursor.year + 1, month: 1 } : { year: cursor.year, month: cursor.month + 1 };
    }
  }

  for (const row of rows) {
    const key = groupBy === 'dia' ? gymDateKey(row.fechaPago) : gymDateKey(row.fechaPago).slice(0, 7);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const { bruto, neto } = money(row);
    bucket.bruto += bruto;
    bucket.neto += neto;
    bucket.cantidad += 1;
  }

  return {
    rango: { desde: range.desde, hasta: range.hasta },
    agrupacion: groupBy,
    puntos: [...buckets.values()].map((point) => ({ ...point, bruto: round2(point.bruto), neto: round2(point.neto) })),
  };
};

// ---------------------------------------------------------------------------
// Listado, detalle y exportación
// ---------------------------------------------------------------------------

const SORTS = {
  fecha: (dir) => [{ fechaPago: dir }, { id: dir }],
  cliente: (dir) => [{ cuota: { cliente: { usuario: { apellido: dir } } } }, { id: dir }],
  plan: (dir) => [{ cuota: { plan: { nombre: dir } } }, { id: dir }],
  metodo: (dir) => [{ metodoPago: { nombre: dir } }, { id: dir }],
  bruto: (dir) => [{ monto: dir }, { id: dir }],
  comision: (dir) => [{ comision: dir }, { id: dir }],
  neto: (dir) => [{ montoNeto: dir }, { id: dir }],
};
export const PAYMENT_SORT_FIELDS = Object.keys(SORTS);

const buildPaymentFilters = (query, now) => {
  const range = resolveRange(query, now);
  const where = { fechaPago: { gte: range.from, lt: range.to } };

  if (query.metodo) where.metodoPago = { nombre: String(query.metodo) };
  if (query.planId) where.cuota = { ...(where.cuota ?? {}), planId: Number(query.planId) };
  const text = String(query.q ?? '').trim();
  if (text) {
    where.OR = [
      { referenciaExterna: { contains: text } },
      { cuota: { cliente: { usuario: { OR: [{ nombre: { contains: text } }, { apellido: { contains: text } }, { email: { contains: text } }] } } } },
    ];
  }
  return { range, where };
};

const paymentInclude = {
  metodoPago: true,
  cuota: { include: { plan: true, estadoCuota: true, cliente: { include: { usuario: true } } } },
};

const toPaymentRow = (pago) => {
  const { bruto, comision, neto } = money(pago);
  const user = pago.cuota.cliente.usuario;
  return {
    id: pago.id,
    fechaPago: pago.fechaPago.toISOString(),
    fechaLocal: gymDateKey(pago.fechaPago),
    cliente: { id: pago.cuota.clienteId, nombre: `${user.nombre} ${user.apellido}`.trim(), email: user.email },
    plan: pago.cuota.plan.nombre,
    metodo: pago.metodoPago.nombre,
    medioPago: pago.medioPago,
    ultimosDigitos: pago.ultimosDigitos,
    bruto,
    comision,
    neto,
    sinDatosDeNeto: pago.montoNeto === null || pago.montoNeto === undefined,
    referenciaExterna: pago.referenciaExterna,
    estadoCuota: pago.cuota.estadoCuota.nombre,
    cuotaId: pago.cuotaId,
    vigencia: { desde: msToIsoDate(dbDateMs(pago.cuota.fechaInicio)), hasta: msToIsoDate(dbDateMs(pago.cuota.fechaVencimiento)) },
    fechaAcreditacion: pago.fechaAcreditacion ? pago.fechaAcreditacion.toISOString() : null,
  };
};

export const listPayments = async (query = {}, now = new Date()) => {
  const { where } = buildPaymentFilters(query, now);
  const pagination = parsePaginationParams(query);
  const sortField = SORTS[query.orden] ? query.orden : 'fecha';
  const dir = query.dir === 'asc' ? 'asc' : 'desc';

  const [total, rows] = await Promise.all([
    prisma.pago.count({ where }),
    prisma.pago.findMany({ where, include: paymentInclude, orderBy: SORTS[sortField](dir), skip: pagination.skip, take: pagination.limit }),
  ]);
  return buildPaginatedResponse(rows.map(toPaymentRow), { ...pagination, total });
};

export const getPayment = async (paymentId) => {
  const pago = await prisma.pago.findUnique({ where: { id: Number(paymentId) }, include: paymentInclude });
  if (!pago) throw new NotFoundError('Pago no encontrado', 'PAGO_NO_ENCONTRADO');
  const events = pago.referenciaExterna
    ? await prisma.mpEventoPago.findMany({ where: { mpPaymentId: pago.referenciaExterna }, orderBy: { id: 'desc' }, take: 20 })
    : [];
  return {
    ...toPaymentRow(pago),
    eventosMp: events.map((event) => ({
      id: event.id,
      estado: event.estado,
      detalleEstado: event.detalleEstado,
      origen: event.origen,
      procesado: event.procesado,
      fechaRecepcion: event.fechaRecepcion.toISOString(),
    })),
  };
};

// Evita la inyección de fórmulas al abrir el CSV en Excel/Sheets.
const csvCell = (value) => {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// CSV con los mismos filtros del listado (sin paginar). BOM UTF-8 para que Excel respete los acentos.
export const exportPaymentsCsv = async (query = {}, now = new Date()) => {
  const { where } = buildPaymentFilters(query, now);
  const sortField = SORTS[query.orden] ? query.orden : 'fecha';
  const rows = await prisma.pago.findMany({
    where,
    include: paymentInclude,
    orderBy: SORTS[sortField](query.dir === 'asc' ? 'asc' : 'desc'),
    take: 50_000,
  });

  const header = ['Fecha (Buenos Aires)', 'Cliente', 'Email', 'Plan', 'Método', 'Medio de pago', 'Bruto', 'Comisión', 'Neto', 'Referencia', 'Estado de la cuota'];
  const lines = rows.map(toPaymentRow).map((row) => {
    const local = new Date(row.fechaPago).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false });
    return [local, row.cliente.nombre, row.cliente.email, row.plan, row.metodo, row.medioPago, row.bruto.toFixed(2), row.comision.toFixed(2), row.neto.toFixed(2), row.referenciaExterna, row.estadoCuota]
      .map(csvCell)
      .join(',');
  });
  return `﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
};

// ---------------------------------------------------------------------------
// Pendientes y rechazados (mp_evento_pago + cuotas PENDIENTE)
// ---------------------------------------------------------------------------

export const listPendingPayments = async (now = new Date()) => {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const events = await prisma.mpEventoPago.findMany({
    where: { fechaRecepcion: { gte: since }, cuotaId: { not: null } },
    orderBy: { id: 'desc' },
    take: 500,
  });
  // Último evento de cada cuota.
  const lastByQuota = new Map();
  for (const event of events) if (!lastByQuota.has(event.cuotaId)) lastByQuota.set(event.cuotaId, event);

  const quotas = await prisma.cuota.findMany({
    where: {
      pago: { is: null },
      OR: [{ id: { in: [...lastByQuota.keys()] } }, { estadoCuota: { nombre: 'PENDIENTE' }, mpExpiraEn: { not: null } }],
    },
    include: { plan: true, estadoCuota: true, cliente: { include: { usuario: true } } },
    orderBy: { id: 'desc' },
    take: 200,
  });

  const items = quotas.map((cuota) => {
    const last = lastByQuota.get(cuota.id) ?? null;
    const reference = last ? last.fechaRecepcion : cuota.mpExpiraEn ?? now;
    const user = cuota.cliente.usuario;
    return {
      cuotaId: cuota.id,
      cliente: { id: cuota.clienteId, nombre: `${user.nombre} ${user.apellido}`.trim(), email: user.email },
      plan: cuota.plan.nombre,
      estadoCuota: cuota.estadoCuota.nombre,
      estadoMp: last?.estado ?? null,
      detalleEstado: last?.detalleEstado ?? null,
      mensajeMp: last ? mercadopago.statusDetailMessage(last.estado, last.detalleEstado) : 'Todavía no se registró ningún intento de pago.',
      mpPaymentId: last?.mpPaymentId ?? null,
      monto: last?.monto !== null && last?.monto !== undefined ? Number(last.monto) : null,
      ultimoEvento: last ? last.fechaRecepcion.toISOString() : null,
      preferenciaVigente: cuota.mpExpiraEn ? cuota.mpExpiraEn.getTime() > now.getTime() : false,
      antiguedadHoras: Math.max(0, Math.round((now.getTime() - new Date(reference).getTime()) / 3_600_000)),
      clasificacion: !last ? 'SIN_INTENTO' : ['rejected', 'cancelled'].includes(last.estado) ? 'RECHAZADO' : 'PENDIENTE',
    };
  });
  return { items, total: items.length };
};

// ---------------------------------------------------------------------------
// Conciliación (SOLO LECTURA)
// ---------------------------------------------------------------------------

// Compara los pagos aprobados en Mercado Pago (API de búsqueda) con la tabla `pago`. No corrige nada.
// Solo se consideran pagos de FitLogic los que tienen metadata.cuota_id (lo escribe el checkout): la cuenta
// vendedora puede tener ventas ajenas a este sistema.
export const reconcile = async (query = {}, now = new Date()) => {
  const range = resolveRange(query, now);
  const { payments: mpAll, truncated } = await mercadopago.searchApprovedPayments(range.from, range.to);
  const mine = mpAll.filter((payment) => payment.metadata?.cuota_id !== undefined && payment.metadata?.cuota_id !== null);

  const local = await prisma.pago.findMany({
    where: { metodoPago: { nombre: 'MERCADO_PAGO' }, fechaPago: { gte: range.from, lt: range.to } },
    include: { cuota: { include: { cliente: { include: { usuario: true } }, plan: true } } },
  });
  const localByRef = new Map(local.filter((pago) => pago.referenciaExterna).map((pago) => [pago.referenciaExterna, pago]));
  const mpById = new Map(mine.map((payment) => [String(payment.id), payment]));

  const enMpSinRegistro = [];
  const montosDistintos = [];
  for (const payment of mine) {
    const pago = localByRef.get(String(payment.id));
    if (!pago) {
      enMpSinRegistro.push({
        mpPaymentId: String(payment.id),
        cuotaId: Number(payment.metadata.cuota_id) || null,
        monto: Number(payment.transaction_amount),
        fechaAprobacion: payment.date_approved ?? null,
      });
      continue;
    }
    const mpGross = round2(Number(payment.transaction_amount));
    const mpNet = payment.transaction_details?.net_received_amount;
    const grossDiffers = mpGross !== round2(Number(pago.monto));
    const netDiffers = pago.montoNeto !== null && mpNet !== undefined && mpNet !== null && round2(Number(mpNet)) !== round2(Number(pago.montoNeto));
    if (grossDiffers || netDiffers) {
      montosDistintos.push({
        mpPaymentId: String(payment.id),
        pagoId: pago.id,
        brutoMp: mpGross,
        brutoLocal: Number(pago.monto),
        netoMp: mpNet === undefined || mpNet === null ? null : round2(Number(mpNet)),
        netoLocal: pago.montoNeto === null ? null : Number(pago.montoNeto),
      });
    }
  }

  const localSinPagoEnMp = [];
  for (const pago of local) {
    if (pago.referenciaExterna && mpById.has(pago.referenciaExterna)) continue;
    // Se consulta el pago para informar su estado real en MP (reembolsado, inexistente...).
    let mpStatus = 'no consultado';
    if (pago.referenciaExterna && localSinPagoEnMp.length < 20) {
      const remote = await mercadopago.getPayment(pago.referenciaExterna).catch(() => undefined);
      mpStatus = remote === undefined ? 'error al consultar' : remote === null ? 'inexistente en Mercado Pago' : remote.status;
    }
    const user = pago.cuota.cliente.usuario;
    localSinPagoEnMp.push({
      pagoId: pago.id,
      referenciaExterna: pago.referenciaExterna,
      monto: Number(pago.monto),
      cliente: `${user.nombre} ${user.apellido}`.trim(),
      fechaPago: pago.fechaPago.toISOString(),
      estadoEnMp: mpStatus,
    });
  }

  return {
    rango: { desde: range.desde, hasta: range.hasta },
    soloLectura: true,
    truncado: truncated,
    resumen: {
      pagosAprobadosEnMp: mine.length,
      pagosAjenosIgnorados: mpAll.length - mine.length,
      pagosLocalesMercadoPago: local.length,
      conDiferencias: enMpSinRegistro.length + localSinPagoEnMp.length + montosDistintos.length,
    },
    enMpSinRegistro,
    localSinPagoEnMp,
    montosDistintos,
  };
};
