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
