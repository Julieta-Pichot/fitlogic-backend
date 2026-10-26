import prisma from '../lib/prisma.js';
import { NotFoundError } from '../errors/AppError.js';
import { GYM_TIMEZONE, dbDateMs, msToIsoDate } from '../utils/timezone.js';

const METHOD_LABELS = { EFECTIVO: 'Efectivo', MERCADO_PAGO: 'Mercado Pago' };

// Comprobante de un pago armado SOLO con datos de la BD. Con `clienteId` verifica que el pago sea de ese cliente
// (404 si no: nunca se revela que existe).
export const buildReceipt = async (pagoId, { clienteId } = {}) => {
  const pago = await prisma.pago.findFirst({
    where: { id: Number(pagoId), ...(clienteId ? { cuota: { clienteId } } : {}) },
    include: { metodoPago: true, cuota: { include: { plan: true, cliente: { include: { usuario: true } } } } },
  });
  if (!pago) throw new NotFoundError('Comprobante no encontrado', 'COMPROBANTE_NO_ENCONTRADO');
  const gym = await prisma.gimnasio.findFirst();
  const user = pago.cuota.cliente.usuario;

  return {
    pagoId: pago.id,
    gimnasio: gym?.nombre ?? 'FitLogic',
    numeroOperacion: pago.referenciaExterna ?? `REC-${String(pago.id).padStart(6, '0')}`,
    fechaPago: pago.fechaPago.toISOString(),
    cliente: `${user.nombre} ${user.apellido}`.trim(),
    plan: pago.cuota.plan.nombre,
    vigencia: { desde: msToIsoDate(dbDateMs(pago.cuota.fechaInicio)), hasta: msToIsoDate(dbDateMs(pago.cuota.fechaVencimiento)) },
    monto: Number(pago.monto),
    metodo: pago.metodoPago.nombre,
    metodoLabel: METHOD_LABELS[pago.metodoPago.nombre] ?? pago.metodoPago.nombre,
    medioPago: pago.medioPago,
    ultimosDigitos: pago.ultimosDigitos,
  };
};

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = (value) => `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dmy = (iso) => iso.split('-').reverse().join('/');

// Vista imprimible (HTML autocontenido, sin scripts externos). El cliente puede imprimirla o guardarla como PDF.
export const renderReceiptHtml = (receipt) => {
  const paidAt = new Date(receipt.fechaPago).toLocaleString('es-AR', { timeZone: GYM_TIMEZONE, dateStyle: 'short', timeStyle: 'short' });
  const method = receipt.medioPago ? `${receipt.metodoLabel} · ${receipt.medioPago}${receipt.ultimosDigitos ? ` ****${receipt.ultimosDigitos}` : ''}` : receipt.metodoLabel;
  const rows = [
    ['Número de operación', receipt.numeroOperacion],
    ['Fecha de pago', paidAt],
    ['Cliente', receipt.cliente],
    ['Plan', receipt.plan],
    ['Vigencia', `${dmy(receipt.vigencia.desde)} al ${dmy(receipt.vigencia.hasta)}`],
    ['Método de pago', method],
  ];
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comprobante ${escapeHtml(receipt.numeroOperacion)}</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f4f5;margin:0;padding:24px;color:#18181b}
.card{max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
h1{font-size:20px;margin:0 0 4px}.sub{color:#71717a;font-size:14px;margin:0 0 20px}
dl{margin:0}.row{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid #e4e4e7;font-size:14px}
dt{color:#71717a}dd{margin:0;font-weight:600;text-align:right}
.total{display:flex;justify-content:space-between;margin-top:18px;font-size:18px;font-weight:700}
button{margin:20px auto 0;display:block;padding:10px 20px;border:0;border-radius:10px;background:#18181b;color:#fff;font-size:14px;cursor:pointer}
@media print{body{background:#fff;padding:0}.card{box-shadow:none}button{display:none}}
</style></head><body><div class="card">
<h1>${escapeHtml(receipt.gimnasio)}</h1><p class="sub">Comprobante de pago de membresía</p>
<dl>${rows.map(([label, value]) => `<div class="row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
<div class="total"><span>Total abonado</span><span>${escapeHtml(money(receipt.monto))}</span></div>
<button onclick="window.print()">Imprimir / guardar como PDF</button>
</div></body></html>`;
};
