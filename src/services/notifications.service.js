import prisma from '../lib/prisma.js';
import { NotFoundError } from '../errors/AppError.js';

const MAX_LIMIT = 100;

const toNotification = (item) => ({
  id: item.id,
  tipo: item.tipoNotificacion.nombre,
  titulo: item.titulo,
  mensaje: item.mensaje,
  leida: item.leida,
  fechaEnvio: item.fechaEnvio,
});

// Siempre se filtra por el usuario autenticado: nadie ve ni toca notificaciones ajenas.
// El filtro TODAS / NO LEÍDAS se resuelve acá (campo `leida`) y el contador de no leídas
// se devuelve siempre completo, sin importar el filtro.
export const listNotifications = async (userId, { filtro, limit } = {}) => {
  const onlyUnread = filtro === 'no_leidas';
  const take = Math.min(Math.max(Number(limit) || 50, 1), MAX_LIMIT);

  const [items, unreadCount] = await Promise.all([
    prisma.notificacion.findMany({
      where: { usuarioId: userId, ...(onlyUnread ? { leida: false } : {}) },
      include: { tipoNotificacion: true },
      orderBy: [{ fechaEnvio: 'desc' }, { id: 'desc' }],
      take,
    }),
    prisma.notificacion.count({ where: { usuarioId: userId, leida: false } }),
  ]);

  return { items: items.map(toNotification), unreadCount };
};

export const markAsRead = async (userId, notificationId) => {
  const id = Number(notificationId);
  const result = await prisma.notificacion.updateMany({
    where: { id, usuarioId: userId, leida: false },
    data: { leida: true },
  });

  if (result.count === 0) {
    // Ya estaba leída (idempotente) o no existe / no es del usuario.
    const existing = await prisma.notificacion.findFirst({ where: { id, usuarioId: userId }, select: { id: true } });
    if (!existing) throw new NotFoundError('Notificación no encontrada');
  }

  return { id };
};

export const markAllAsRead = async (userId) => {
  const result = await prisma.notificacion.updateMany({
    where: { usuarioId: userId, leida: false },
    data: { leida: true },
  });
  return { actualizadas: result.count };
};
