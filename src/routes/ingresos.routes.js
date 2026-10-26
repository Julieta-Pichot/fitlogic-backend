import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import * as ingresos from '../services/ingresos.service.js';
import { verifyQuotaAsAdmin } from '../services/membership-payments.service.js';
import { sendSuccess } from '../utils/response.js';
import { chartQuery, paymentIdParam, paymentsQuery, quotaIdParam, rangeQuery } from '../validators/ingresos.validator.js';

const router = Router();

// Sección Ingresos del panel de administración: solo el rol ADMIN (que es un usuario sin fila en tablas de rol).
router.use(authenticateToken, requireAdmin);

router.get('/resumen', rangeQuery, validateRequest, async (req, res) => sendSuccess(res, { data: await ingresos.getSummary(req.query) }));
router.get('/desglose', rangeQuery, validateRequest, async (req, res) => sendSuccess(res, { data: await ingresos.getBreakdown(req.query) }));
router.get('/grafico', chartQuery, validateRequest, async (req, res) => sendSuccess(res, { data: await ingresos.getChart(req.query) }));

router.get('/pagos', paymentsQuery, validateRequest, async (req, res) => sendSuccess(res, { data: await ingresos.listPayments(req.query) }));
router.get('/pagos/exportar.csv', paymentsQuery, validateRequest, async (req, res) => {
  const csv = await ingresos.exportPaymentsCsv(req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ingresos.csv"');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.send(csv);
});
router.get('/pagos/:id', paymentIdParam, validateRequest, async (req, res) => sendSuccess(res, { data: await ingresos.getPayment(req.params.id) }));

router.get('/pendientes', async (_req, res) => sendSuccess(res, { data: await ingresos.listPendingPayments() }));
router.post('/pendientes/:cuotaId/verificar', quotaIdParam, validateRequest, async (req, res) =>
  sendSuccess(res, { data: await verifyQuotaAsAdmin(req.params.cuotaId) })
);

router.get('/conciliacion', rangeQuery, validateRequest, async (req, res) => sendSuccess(res, { data: await ingresos.reconcile(req.query) }));

export default router;
