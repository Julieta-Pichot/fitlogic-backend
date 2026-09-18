import prisma from '../lib/prisma.js';
import { ROLES } from '../constants/index.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors/AppError.js';
import { hashPassword, sanitizeUser } from './auth.service.js';
import {
  buildPaginatedResponse,
  parsePaginationParams,
  parseSearchParam,
  parseSortParams,
} from '../utils/pagination.js';
import { logger } from '../utils/logger.js';

const USER_SORT_FIELDS = ['nombre', 'apellido', 'email', 'fechaCreacion'];
const userInclude = {
  rol: true,
  cliente: { include: { estadoCliente: true } },
  profesor: true,
  recepcionista: true,
};

const ensureNotSelf = (targetUserId, actorUserId, action) => {
  if (targetUserId === actorUserId) throw new ValidationError(`No podés ${action} tu propio usuario`);
};

const ensureAdminTarget = (user) => {
  if (user.rolId === ROLES.ADMIN) {
    throw new ForbiddenError('No se puede modificar un administrador desde esta operación');
  }
};

const getStaffStateId = async (tx) => {
  const state = await tx.estadoCuentaStaff.findUnique({ where: { nombre: 'HABILITADO' } });
  if (!state) throw new ValidationError('No existe el estado HABILITADO para el perfil de staff');
  return state.id;
};

const getClientStateId = async (tx) => {
  const state = await tx.estadoCliente.findUnique({ where: { nombre: 'HABILITADO' } });
  if (!state) throw new ValidationError('No existe el estado HABILITADO para el perfil de cliente');
  return state.id;
};

const createRoleProfile = async (tx, { rolId, usuarioId, especialidades, objetivoDiasSemana }) => {
  if (rolId === ROLES.CLIENTE) {
    return tx.cliente.create({
      data: {
        usuarioId,
        estadoClienteId: await getClientStateId(tx),
        objetivoDiasRacha: objetivoDiasSemana ?? 3,
        fechaAlta: new Date(),
      },
    });
  }

  if (rolId === ROLES.PROFESOR) {
    return tx.profesor.create({
      data: {
        usuarioId,
        estadoCuentaStaffId: await getStaffStateId(tx),
        especialidad: Array.isArray(especialidades) ? especialidades[0]?.trim() || null : null,
      },
    });
  }

  if (rolId === ROLES.RECEPCIONISTA) {
    return tx.recepcionista.create({
      data: { usuarioId, estadoCuentaStaffId: await getStaffStateId(tx) },
    });
  }

  return null;
};

const replaceRoleProfile = async (tx, { user, newRolId, especialidades, objetivoDiasSemana }) => {
  if (user.cliente) await tx.cliente.delete({ where: { id: user.cliente.id } });
  if (user.profesor) await tx.profesor.delete({ where: { id: user.profesor.id } });
  if (user.recepcionista) await tx.recepcionista.delete({ where: { id: user.recepcionista.id } });
  await createRoleProfile(tx, {
    rolId: newRolId,
    usuarioId: user.id,
    especialidades,
    objetivoDiasSemana,
  });
};

export const listUsers = async (_gimnasioId, query) => {
  const { page, limit, skip } = parsePaginationParams(query);
  const search = parseSearchParam(query);
  const { sortBy, sortOrder } = parseSortParams(query, USER_SORT_FIELDS);
  const rolId = query.rolId ? Number(query.rolId) : undefined;
  const activo = query.activo !== undefined ? Number(query.activo) === 1 : undefined;
  const where = {
    ...(rolId ? { rolId } : {}),
    ...(activo !== undefined ? { activo } : {}),
    ...(search
      ? { OR: [
          { nombre: { contains: search } },
          { apellido: { contains: search } },
          { email: { contains: search } },
        ] }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.usuario.findMany({ where, include: userInclude, orderBy: { [sortBy]: sortOrder }, skip, take: limit }),
    prisma.usuario.count({ where }),
  ]);
  return buildPaginatedResponse(items.map(sanitizeUser), { page, limit, total });
};

export const getUserById = async (_gimnasioId, userId) => {
  const user = await prisma.usuario.findUnique({ where: { id: userId }, include: userInclude });
  if (!user) throw new NotFoundError('Usuario no encontrado');
  return sanitizeUser(user);
};

export const createUser = async (_gimnasioId, actorId, payload) => {
  const email = payload.email.trim().toLowerCase();
  if (payload.rolId === ROLES.ADMIN) {
    throw new ForbiddenError('No se pueden crear administradores desde esta API');
  }
  if (await prisma.usuario.findUnique({ where: { email } })) {
    throw new ConflictError('Ya existe un usuario con ese email');
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.usuario.create({
      data: {
        rolId: payload.rolId,
        nombre: payload.nombre.trim(),
        apellido: payload.apellido.trim(),
        email,
        telefono: payload.telefono?.trim() || null,
        passwordHash: await hashPassword(payload.password),
        activo: true,
      },
    });
    await createRoleProfile(tx, {
      rolId: payload.rolId,
      usuarioId: created.id,
      especialidades: payload.especialidades,
      objetivoDiasSemana: payload.objetivoDiasSemana,
    });
    return tx.usuario.findUnique({ where: { id: created.id }, include: userInclude });
  });

  logger.info('Usuario creado', { userId: user.id, actorId, rolId: payload.rolId });
  return sanitizeUser(user);
};

export const updateUser = async (_gimnasioId, actorId, userId, payload) => {
  const user = await prisma.usuario.findUnique({
    where: { id: userId },
    include: { cliente: true, profesor: true, recepcionista: true },
  });
  if (!user) throw new NotFoundError('Usuario no encontrado');
  ensureAdminTarget(user);

  if (payload.email) {
    const email = payload.email.trim().toLowerCase();
    if (await prisma.usuario.findFirst({ where: { email, NOT: { id: userId } } })) {
      throw new ConflictError('Ya existe un usuario con ese email');
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const data = {
      ...(payload.nombre ? { nombre: payload.nombre.trim() } : {}),
      ...(payload.apellido ? { apellido: payload.apellido.trim() } : {}),
      ...(payload.email ? { email: payload.email.trim().toLowerCase() } : {}),
      ...(payload.telefono !== undefined ? { telefono: payload.telefono?.trim() || null } : {}),
    };

    if (payload.rolId && payload.rolId !== user.rolId) {
      if (payload.rolId === ROLES.ADMIN) throw new ForbiddenError('No se puede asignar rol administrador');
      ensureNotSelf(userId, actorId, 'cambiar el rol de');
      data.rolId = payload.rolId;
      await replaceRoleProfile(tx, {
        user,
        newRolId: payload.rolId,
        especialidades: payload.especialidades,
        objetivoDiasSemana: payload.objetivoDiasSemana,
      });
    } else if (user.profesor && payload.especialidades) {
      await tx.profesor.update({
        where: { id: user.profesor.id },
        data: { especialidad: payload.especialidades[0]?.trim() || null },
      });
    }

    if (payload.objetivoDiasSemana && user.cliente) {
      await tx.cliente.update({
        where: { id: user.cliente.id },
        data: { objetivoDiasRacha: payload.objetivoDiasSemana },
      });
    }
    return tx.usuario.update({ where: { id: userId }, data, include: userInclude });
  });

  logger.info('Usuario actualizado', { userId, actorId });
  return sanitizeUser(updated);
};

export const toggleUserActive = async (_gimnasioId, actorId, userId, activo) => {
  const user = await prisma.usuario.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('Usuario no encontrado');
  ensureAdminTarget(user);
  ensureNotSelf(userId, actorId, activo === 0 ? 'desactivar' : 'activar');

  const updated = await prisma.usuario.update({
    where: { id: userId },
    data: { activo: activo === 1 },
    include: userInclude,
  });
  logger.info('Estado de usuario actualizado', { userId, actorId, activo });
  return sanitizeUser(updated);
};

export const resetUserPassword = async (_gimnasioId, actorId, userId, newPassword) => {
  const user = await prisma.usuario.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('Usuario no encontrado');
  ensureAdminTarget(user);
  await prisma.usuario.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  logger.info('Contraseña de usuario restablecida', { userId, actorId });
  return { success: true };
};
