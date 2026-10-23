import * as profesorService from '../services/profesor.service.js';
import * as notificationsService from '../services/notifications.service.js';
import * as authService from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.js';

export const listClients = async (_req, res) =>
  sendSuccess(res, { data: await profesorService.listClients() });

export const getProfile = async (req, res) =>
  sendSuccess(res, { data: await profesorService.getProfile(req.profesor.id) });

// Mínimo 8 caracteres (validador) y la nueva no puede ser igual a la actual.
// El id sale siempre del token; nunca se loguea ni se devuelve ninguna contraseña ni hash.
export const changePassword = async (req, res) => {
  await authService.changePassword(req.user.id, req.body, { rejectSame: true });
  return sendSuccess(res, { message: 'Contraseña actualizada correctamente' });
};

export const listNotifications = async (req, res) =>
  sendSuccess(res, { data: await notificationsService.listNotifications(req.user.id, req.query) });

export const markNotificationRead = async (req, res) =>
  sendSuccess(res, { message: 'Notificación marcada como leída', data: await notificationsService.markAsRead(req.user.id, req.params.id) });

export const markAllNotificationsRead = async (req, res) =>
  sendSuccess(res, { message: 'Notificaciones marcadas como leídas', data: await notificationsService.markAllAsRead(req.user.id) });
