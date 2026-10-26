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
    // Un token firmado pero sin un userId entero válido no identifica a nadie.
    if (!Number.isInteger(decoded?.userId) || decoded.userId < 1) throw new UnauthorizedError('Token inválido');

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

// Rol PROFESOR + cuenta HABILITADA (estado_cuenta_staff). Deja el registro del
// profesor en req.profesor: el id del profesor siempre sale del usuario autenticado,
// nunca de lo que mande el front.
export const requireProfesorHabilitado = [
  requireRole('PROFESOR'),
  async (req, _res, next) => {
    try {
      const profesor = await prisma.profesor.findUnique({
        where: { usuarioId: req.user.id },
        include: { estadoCuentaStaff: true },
      });

      if (!profesor) throw new ForbiddenError('Perfil de profesor no encontrado');
      if (profesor.estadoCuentaStaff?.nombre !== 'HABILITADO') {
        throw new ForbiddenError('Tu cuenta de profesor está inhabilitada');
      }

      req.profesor = profesor;
      return next();
    } catch (error) {
      return next(error);
    }
  },
];

// Rol CLIENTE: deja el registro del cliente (con su estado) en req.cliente. El cliente se identifica
// siempre por el token (cliente.usuario_id -> usuario.id); nunca por un id enviado desde el front.
// Un cliente INHABILITADO_PAGO o INHABILITADO_BAJA SÍ puede entrar: necesita ver su membresía y renovar.
export const requireClienteContext = [
  requireRole('CLIENTE'),
  async (req, _res, next) => {
    try {
      const cliente = await prisma.cliente.findUnique({ where: { usuarioId: req.user.id }, include: { estadoCliente: true } });
      if (!cliente) throw new ForbiddenError('Perfil de cliente no encontrado');
      req.cliente = cliente;
      return next();
    } catch (error) {
      return next(error);
    }
  },
];

// Rol RECEPCIONISTA + cuenta HABILITADA (estado_cuenta_staff), igual que el profesor. El admin pasa directo.
const checkReceptionEnabled = async (req, _res, next) => {
  try {
    if (normalizeRoleName(req.user.rol?.nombre) !== 'recepcionista') return next();
    const recepcionista = await prisma.recepcionista.findUnique({ where: { usuarioId: req.user.id }, include: { estadoCuentaStaff: true } });
    if (!recepcionista) throw new ForbiddenError('Perfil de recepcionista no encontrado');
    if (recepcionista.estadoCuentaStaff?.nombre !== 'HABILITADO') throw new ForbiddenError('Tu cuenta de recepción está inhabilitada');
    return next();
  } catch (error) {
    return next(error);
  }
};

// Operaciones de caja y alta de clientes: solo ADMIN o RECEPCIONISTA habilitada (nunca el profesor ni el cliente).
export const requireAdminOrReception = [requireRole('ADMIN', 'RECEPCIONISTA'), checkReceptionEnabled];
export const requireReceptionEnabled = [requireRole('RECEPCIONISTA'), checkReceptionEnabled];

export const requireAdmin = requireRole('ADMIN');
export const requireProfesor = requireRole('PROFESOR');
export const requireRecepcionista = requireRole('RECEPCIONISTA');
export const requireCliente = requireRole('CLIENTE');
export const requireStaff = requireRole('ADMIN', 'PROFESOR', 'RECEPCIONISTA');

export { userInclude };
