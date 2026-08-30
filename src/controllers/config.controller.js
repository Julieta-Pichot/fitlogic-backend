import prisma from '../lib/prisma.js';
import {
  ESTADOS_CLIENTE,
  ESTADOS_CUOTA,
  ESTADOS_PAGO,
  METODOS_PAGO,
  ROLES,
} from '../constants/index.js';
import { sendSuccess } from '../utils/response.js';

export const getSystemConfig = async (_req, res, next) => {
  try {
    const [roles, estadosCliente, estadosCuota] = await Promise.all([
      prisma.rol.findMany({ orderBy: { id: 'asc' } }),
      prisma.estadoCliente.findMany({ orderBy: { id: 'asc' } }),
      prisma.estadoCuota.findMany({ orderBy: { id: 'asc' } }),
    ]);

    return sendSuccess(res, {
      data: {
        roles,
        estadosCliente,
        estadosCuota,
        metodosPago: METODOS_PAGO,
        estadosPago: ESTADOS_PAGO,
        roleIds: ROLES,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const updateGymConfig = async (req, res, next) => {
  try {
    const { nombre, direccion, notifNuevoPago, notifAptoVencido, notifNuevoCliente } = req.body;
    const gymData = {};
    const configData = {};

    if (nombre !== undefined) gymData.nombre = String(nombre).trim();
    if (direccion !== undefined) gymData.direccion = String(direccion).trim() || null;
    for (const [key, value] of Object.entries({ notifNuevoPago, notifAptoVencido, notifNuevoCliente })) {
      if (value !== undefined) configData[key] = Number(value) === 1 ? 1 : 0;
    }

    if (gymData.nombre !== undefined && !gymData.nombre) {
      return res.status(400).json({ success: false, message: 'El nombre del gimnasio es obligatorio' });
    }

    const data = await prisma.$transaction(async (transaction) => {
      const gimnasio = Object.keys(gymData).length
        ? await transaction.gimnasio.update({ where: { id: req.user.gimnasioId }, data: gymData })
        : await transaction.gimnasio.findUnique({ where: { id: req.user.gimnasioId } });
      const configuracion = await transaction.configuracionGimnasio.upsert({
        where: { gimnasioId: req.user.gimnasioId },
        create: { gimnasioId: req.user.gimnasioId, ...configData },
        update: configData,
      });
      return { gimnasio, configuracion };
    });

    return sendSuccess(res, { message: 'Configuración guardada correctamente', data });
  } catch (error) {
    return next(error);
  }
};
