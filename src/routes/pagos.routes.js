import { Router } from 'express';
import { AppError } from '../errors/AppError.js';
import { verifyWebhookSignature } from '../services/mercadopago.service.js';
import { handleWebhookPayment } from '../services/membership-payments.service.js';

const router = Router();

// Webhook de Mercado Pago: público (sin JWT). La seguridad está en que NUNCA se confía en el cuerpo:
// solo se toma el id del pago, se consulta a la API de MP con el Access Token y recién ahí se procesa.
// Si MERCADOPAGO_WEBHOOK_SECRET está configurado, además se valida la firma x-signature.
router.post('/mercadopago/webhook', async (req, res) => {
  const type = req.query.type ?? req.query.topic ?? req.body?.type;
  const dataId = req.query['data.id'] ?? req.body?.data?.id ?? req.query.id;
  if (type !== 'payment' || !dataId) return res.status(200).json({ ok: true, ignorado: true });

  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (secret) {
    const valid = verifyWebhookSignature({
      signature: req.headers['x-signature'],
      requestId: req.headers['x-request-id'],
      dataId,
      secret,
      // Notificaciones más viejas que esto se rechazan (anti-replay). Los reintentos tardíos de MP se recuperan con el sondeo.
      toleranceSeconds: Number(process.env.MERCADOPAGO_WEBHOOK_TOLERANCE_SECONDS) || 600,
    });
    if (!valid) {
      console.warn('[mercadopago] Webhook rechazado: firma inválida o vencida');
      return res.status(401).json({ success: false, error: 'FIRMA_INVALIDA', message: 'Firma inválida' });
    }
  }

  try {
    const result = await handleWebhookPayment(String(dataId));
    return res.status(200).json({ ok: true, estado: result.estado });
  } catch (error) {
    // Reglas de negocio (monto que no coincide, cuota inexistente...): reintentar no sirve, se responde 200.
    // Fallas transitorias (Mercado Pago caído, error inesperado): se deja que falle para que MP reintente.
    if (error instanceof AppError && error.statusCode < 500) {
      console.error(`[mercadopago] Notificación del pago ${dataId} no procesada: ${error.code} - ${error.message}`);
      return res.status(200).json({ ok: true, ignorado: true, motivo: error.code });
    }
    throw error;
  }
});

export default router;
