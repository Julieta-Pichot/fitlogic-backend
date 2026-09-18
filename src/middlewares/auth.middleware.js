import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError.js';
import { normalizeRoleName } from '../constants/index.js';

const userInclude = {
  rol: true,
  cliente: { include: { estadoCliente: true } },
  profesor: true,
  recepcionista: true,
};

export const authenticateToken = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      throw new UnauthorizedError('Token de acceso requerido');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.usuario.findUnique({
      where: { id: decoded.userId },
      include: userInclude,
    });

    if (!user || !user.activo) {
      throw new UnauthorizedError('Usuario no válido o inactivo');
    }

    const gimnasio = await prisma.gimnasio.findFirst();
    req.user = { ...user, gimnasio, gimnasioId: gimnasio?.id ?? null };
    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return next(error);
    }

    if (error.name === 'JsonWebTokenError') {
      return next(new UnauthorizedError('Token inválido'));
    }

    if (error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Token expirado'));
    }

    return next(error);
  }
};

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) {
    return next(new UnauthorizedError('Usuario no autenticado'));
  }

  const userRole = normalizeRoleName(req.user.rol?.nombre);
  const normalizedRoles = roles.map((role) => normalizeRoleName(role));

  if (!userRole || !normalizedRoles.includes(userRole)) {
    return next(new ForbiddenError('Acceso denegado. Rol insuficiente.'));
  }

  return next();
};

export const requireAdmin = requireRole('ADMIN');
export const requireProfesor = requireRole('PROFESOR');
export const requireRecepcionista = requireRole('RECEPCIONISTA');
export const requireCliente = requireRole('CLIENTE');
export const requireStaff = requireRole('ADMIN', 'PROFESOR', 'RECEPCIONISTA');

export { userInclude };
