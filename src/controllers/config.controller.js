import prisma from '../lib/prisma.js';
import { sendSuccess } from '../utils/response.js';

export const getSystemConfig = async (_req, res, next) => {
  try {
    const [gimnasio, roles, estadosCliente, estadosCuota, metodosPago, estadosInscripcion, categoriasReceta, tiposNotificacion] = await Promise.all([
      prisma.gimnasio.findFirst(),
      prisma.rol.findMany({ orderBy: { id: 'asc' } }),
      prisma.estadoCliente.findMany({ orderBy: { id: 'asc' } }),
      prisma.estadoCuota.findMany({ orderBy: { id: 'asc' } }),
      prisma.metodoPago.findMany({ orderBy: { id: 'asc' } }),
      prisma.estadoInscripcion.findMany({ orderBy: { id: 'asc' } }),
      prisma.categoriaReceta.findMany({ orderBy: { id: 'asc' } }),
      prisma.tipoNotificacion.findMany({ orderBy: { id: 'asc' } }),
    ]);

    return sendSuccess(res, {
      data: {
        gimnasio,
        roles,
        estadosCliente,
        estadosCuota,
        metodosPago,
        estadosInscripcion,
        categoriasReceta,
        tiposNotificacion,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const updateGymConfig = async (req, res, next) => {
  try {
    const { nombre, direccion, telefono, emailSoporte, identidadVisual } = req.body;
    const gymData = {};

    if (nombre !== undefined) gymData.nombre = String(nombre).trim();
    if (direccion !== undefined) gymData.direccion = String(direccion).trim() || null;
    if (telefono !== undefined) gymData.telefono = String(telefono).trim() || null;
    if (emailSoporte !== undefined) gymData.emailSoporte = String(emailSoporte).trim() || null;
    if (identidadVisual !== undefined) gymData.identidadVisual = String(identidadVisual).trim() || null;

    if (gymData.nombre !== undefined && !gymData.nombre) {
      return res.status(400).json({ success: false, message: 'El nombre del gimnasio es obligatorio' });
    }

    const current = await prisma.gimnasio.findFirst();
    if (!current) throw new Error('No existe la configuración del gimnasio');
    const gimnasio = Object.keys(gymData).length
      ? await prisma.gimnasio.update({ where: { id: current.id }, data: gymData })
      : current;

    return sendSuccess(res, { message: 'Configuración guardada correctamente', data: gimnasio });
  } catch (error) {
    return next(error);
  }
};
