import * as clienteService from '../services/cliente.service.js';
import * as classesService from '../services/cliente-classes.service.js';
import * as contentService from '../services/cliente-content.service.js';
import * as paymentsService from '../services/membership-payments.service.js';
import * as receiptsService from '../services/payment-receipts.service.js';
import * as notificationsService from '../services/notifications.service.js';
import * as authService from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.js';

// Todo se resuelve con req.cliente / req.user, que salen del token: nada de ids enviados por el front.

export const getHome = async (req, res) => sendSuccess(res, { data: await clienteService.getHome(req.cliente) });
export const getProfile = async (req, res) => sendSuccess(res, { data: await clienteService.getProfile(req.cliente) });
export const listPayments = async (req, res) => sendSuccess(res, { data: await clienteService.listPayments(req.cliente, req.query) });
export const listAttendances = async (req, res) => sendSuccess(res, { data: await clienteService.listAttendances(req.cliente, req.query) });

export const downloadMedicalClearance = (req, res) => {
  const file = clienteService.getMedicalClearanceFile(req.cliente);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.sendFile(file);
};

export const changePassword = async (req, res) => {
  await authService.changePassword(req.user.id, req.body, { rejectSame: true });
  return sendSuccess(res, { message: 'Contraseña actualizada correctamente' });
};

// Comprobante de un pago propio (404 si el pago es de otro cliente). ?formato=json devuelve los datos; por defecto, HTML imprimible.
export const getReceipt = async (req, res) => {
  const receipt = await receiptsService.buildReceipt(req.params.id, { clienteId: req.cliente.id });
  if (req.query.formato === 'json') return sendSuccess(res, { data: receipt });
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.query.descargar === '1') res.setHeader('Content-Disposition', `attachment; filename="comprobante-${receipt.pagoId}.html"`);
  return res.send(receiptsService.renderReceiptHtml(receipt));
};

// Rutinas
export const listRoutines = async (req, res) => sendSuccess(res, { data: await contentService.listActiveRoutines(req.cliente) });
export const listRoutineHistory = async (req, res) => sendSuccess(res, { data: await contentService.listRoutineHistory(req.cliente) });
export const getRoutine = async (req, res) => sendSuccess(res, { data: await contentService.getRoutine(req.cliente, req.params.id) });

// Clases
export const listClasses = async (req, res) => sendSuccess(res, { data: await classesService.listClassesByDay(req.cliente, req.query.fecha) });
export const listMyClasses = async (req, res) => sendSuccess(res, { data: await classesService.listMyClasses(req.cliente) });
export const enroll = async (req, res) =>
  sendSuccess(res, { message: 'Inscripción confirmada', data: await classesService.enrollInClass(req.cliente, req.params.id, req.body ?? {}), statusCode: 201 });
export const cancelEnrollment = async (req, res) =>
  sendSuccess(res, { message: 'Te diste de baja de la clase', data: await classesService.cancelEnrollment(req.cliente, req.params.id) });

// Recetas
export const listRecipeCategories = async (_req, res) => sendSuccess(res, { data: await contentService.listRecipeCategories() });
export const listRecipes = async (req, res) => sendSuccess(res, { data: await contentService.listRecipes(req.query) });
export const getRecipe = async (req, res) => sendSuccess(res, { data: await contentService.getRecipe(req.params.id) });

// Membresía y pagos
export const listPlans = async (_req, res) => sendSuccess(res, { data: await paymentsService.listPlans() });
export const createCheckout = async (req, res) =>
  sendSuccess(res, { data: await paymentsService.createCheckout(req.cliente, req.user, req.body.plan_id), statusCode: 201 });
export const getCheckoutConfig = (_req, res) => sendSuccess(res, { data: paymentsService.getCheckoutConfig() });
export const discardRequest = async (req, res) => sendSuccess(res, { message: 'Solicitud descartada', data: await paymentsService.discardRequest(req.cliente, req.params.id) });
export const verifyPayment = async (req, res) => sendSuccess(res, { data: await paymentsService.verifyReturn(req.cliente, req.query) });

// Notificaciones del usuario autenticado
export const listNotifications = async (req, res) => sendSuccess(res, { data: await notificationsService.listNotifications(req.user.id, req.query) });
export const markNotificationRead = async (req, res) =>
  sendSuccess(res, { message: 'Notificación marcada como leída', data: await notificationsService.markAsRead(req.user.id, req.params.id) });
export const markAllNotificationsRead = async (req, res) =>
  sendSuccess(res, { message: 'Notificaciones marcadas como leídas', data: await notificationsService.markAllAsRead(req.user.id) });
