import prisma from '../lib/prisma.js';
import { ESTADOS_CLIENTE, ROLES } from '../constants/index.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../errors/AppError.js';
import { hashPassword, sanitizeUser } from './auth.service.js';
import {
  buildPaginatedResponse,
  parsePaginationParams,
  parseSearchParam,
  parseSortParams,
} from '../utils/pagination.js';
import { assertGymOwnership, gymScope } from '../utils/scope.js';
import { logger } from '../utils/logger.js';

const USER_SORT_FIELDS = ['nombre', 'apellido', 'email', 'fechaCreacion'];

const userListInclude = {
  rol: true,
  gimnasio: { select: { id: true, codigo: true, nombre: true } },
  cliente: { include: { estadoCliente: true } },
  profesor: { include: { especialidades: { include: { especialidad: true } } } },
  recepcionista: true,
};

const ensureNotSelf = (targetUserId, actorUserId, action) => {
  if (targetUserId === actorUserId) {
    throw new ValidationError(`No podés ${action} tu propio usuario`);
  }
};

const ensureAdminTarget = (targetUser) => {
  if (targetUser.rolId === ROLES.ADMIN) {
    throw new ForbiddenError('No se puede modificar un administrador desde esta operación');
  }
};

const syncProfesorSpecialties = async (tx, { gimnasioId, profesorId, especialidades, actorId }) => {
  if (!Array.isArray(especialidades)) {
    return;
  }

  await tx.profesorEspecialidad.deleteMany({ where: { profesorId } });

  for (const nombre of especialidades) {
    const trimmed = nombre.trim();
    if (!trimmed) continue;

    const especialidad = await tx.especialidad.upsert({
      where: {
        gimnasioId_nombre: { gimnasioId, nombre: trimmed },
      },
      update: { activo: 1 },
      create: {
        gimnasioId,
        nombre: trimmed,
        activo: 1,
      },
    });

    await tx.profesorEspecialidad.create({
      data: {
        profesorId,
        especialidadId: especialidad.id,
      },
    });
  }

  logger.info('Especialidades de profesor actualizadas', {
    profesorId,
    actorId,
    count: especialidades.length,
  });
};

const createRoleProfile = async (tx, { rolId, usuarioId, gimnasioId, especialidades, objetivoDiasSemana }) => {
  if (rolId === ROLES.CLIENTE) {
    const cliente = await tx.cliente.create({
      data: {
        usuarioId,
        estadoClienteId: ESTADOS_CLIENTE.PENDIENTE_HABILITACION,
        objetivoDiasSemana: objetivoDiasSemana ?? 3,
        fechaAlta: new Date(),
      },
    });
    return { cliente };
  }

  if (rolId === ROLES.PROFESOR) {
    const profesor = await tx.profesor.create({
      data: { usuarioId },
    });

    await syncProfesorSpecialties(tx, {
      gimnasioId,
      profesorId: profesor.id,
      especialidades: especialidades ?? [],
      actorId: usuarioId,
    });

    return { profesor };
  }

  if (rolId === ROLES.RECEPCIONISTA) {
    const recepcionista = await tx.recepcionista.create({
      data: { usuarioId },
    });
    return { recepcionista };
  }

  return {};
};

const replaceRoleProfile = async (
  tx,
  { currentUser, newRolId, gimnasioId, especialidades, objetivoDiasSemana, actorId }
) => {
  if (currentUser.cliente) {
    await tx.cliente.delete({ where: { id: currentUser.cliente.id } });
  }

  if (currentUser.profesor) {
    await tx.profesorEspecialidad.deleteMany({ where: { profesorId: currentUser.profesor.id } });
    await tx.profesor.delete({ where: { id: currentUser.profesor.id } });
  }

  if (currentUser.recepcionista) {
    await tx.recepcionista.delete({ where: { id: currentUser.recepcionista.id } });
  }

  await createRoleProfile(tx, {
    rolId: newRolId,
    usuarioId: currentUser.id,
    gimnasioId,
    especialidades,
    objetivoDiasSemana,
  });

  logger.info('Perfil de rol reemplazado', {
    userId: currentUser.id,
    previousRolId: currentUser.rolId,
    newRolId,
    actorId,
  });
};

export const listUsers = async (gimnasioId, query) => {
  const { page, limit, skip } = parsePaginationParams(query);
  const search = parseSearchParam(query);
  const { sortBy, sortOrder } = parseSortParams(query, USER_SORT_FIELDS);
  const rolId = query.rolId ? Number(query.rolId) : undefined;
  const activo = query.activo !== undefined ? Number(query.activo) : undefined;

  const where = {
    ...gymScope(gimnasioId),
    ...(rolId ? { rolId } : {}),
    ...(activo !== undefined ? { activo } : {}),
    ...(search
      ? {
          OR: [
            { nombre: { contains: search } },
            { apellido: { contains: search } },
            { email: { contains: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.usuario.findMany({
      where,
      include: userListInclude,
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: limit,
    }),
    prisma.usuario.count({ where }),
  ]);

  return buildPaginatedResponse(items.map(sanitizeUser), { page, limit, total });
};

export const getUserById = async (gimnasioId, userId) => {
  const user = await prisma.usuario.findUnique({
    where: { id: userId },
    include: userListInclude,
  });

  if (!user) {
    throw new NotFoundError('Usuario no encontrado');
  }

  assertGymOwnership(user.gimnasioId, gimnasioId, 'Usuario');

  return sanitizeUser(user);
};

export const createUser = async (gimnasioId, actorId, payload) => {
  const email = payload.email.trim().toLowerCase();

  if (payload.rolId === ROLES.ADMIN) {
    throw new ForbiddenError('No se pueden crear administradores desde esta API');
  }

  const existing = await prisma.usuario.findFirst({
    where: { gimnasioId, email },
  });

  if (existing) {
    throw new ConflictError('Ya existe un usuario con ese email en el gimnasio');
  }

  const passwordHash = await hashPassword(payload.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.usuario.create({
      data: {
        gimnasioId,
        rolId: payload.rolId,
        nombre: payload.nombre.trim(),
        apellido: payload.apellido.trim(),
        email,
        telefono: payload.telefono?.trim() || null,
        passwordHash,
        activo: 1,
      },
    });

    await createRoleProfile(tx, {
      rolId: payload.rolId,
      usuarioId: created.id,
      gimnasioId,
      especialidades: payload.especialidades,
      objetivoDiasSemana: payload.objetivoDiasSemana,
    });

    return tx.usuario.findUnique({
      where: { id: created.id },
      include: userListInclude,
    });
  });

  logger.info('Usuario creado', { userId: user.id, actorId, gimnasioId, rolId: payload.rolId });

  return sanitizeUser(user);
};

export const updateUser = async (gimnasioId, actorId, userId, payload) => {
  const user = await prisma.usuario.findUnique({
    where: { id: userId },
    include: {
      cliente: true,
      profesor: true,
      recepcionista: true,
    },
  });

  if (!user) {
    throw new NotFoundError('Usuario no encontrado');
  }

  assertGymOwnership(user.gimnasioId, gimnasioId, 'Usuario');
  ensureAdminTarget(user);

  if (payload.email) {
    const email = payload.email.trim().toLowerCase();
    const duplicate = await prisma.usuario.findFirst({
      where: {
        gimnasioId,
        email,
        NOT: { id: userId },
      },
    });

    if (duplicate) {
      throw new ConflictError('Ya existe un usuario con ese email en el gimnasio');
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
      if (payload.rolId === ROLES.ADMIN) {
        throw new ForbiddenError('No se puede asignar rol administrador');
      }

      ensureNotSelf(userId, actorId, 'cambiar el rol de');

      data.rolId = payload.rolId;

      await replaceRoleProfile(tx, {
        currentUser: user,
        newRolId: payload.rolId,
        gimnasioId,
        especialidades: payload.especialidades,
        objetivoDiasSemana: payload.objetivoDiasSemana,
        actorId,
      });
    } else if (user.profesor && payload.especialidades) {
      await syncProfesorSpecialties(tx, {
        gimnasioId,
        profesorId: user.profesor.id,
        especialidades: payload.especialidades,
        actorId,
      });
    }

    if (payload.objetivoDiasSemana && user.cliente) {
      await tx.cliente.update({
        where: { id: user.cliente.id },
        data: { objetivoDiasSemana: payload.objetivoDiasSemana },
      });
    }

    return tx.usuario.update({
      where: { id: userId },
      data,
      include: userListInclude,
    });
  });

  logger.info('Usuario actualizado', { userId, actorId });

  return sanitizeUser(updated);
};

export const toggleUserActive = async (gimnasioId, actorId, userId, activo) => {
  const user = await prisma.usuario.findUnique({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError('Usuario no encontrado');
  }

  assertGymOwnership(user.gimnasioId, gimnasioId, 'Usuario');
  ensureAdminTarget(user);
  ensureNotSelf(userId, actorId, activo === 0 ? 'desactivar' : 'activar');

  const updated = await prisma.usuario.update({
    where: { id: userId },
    data:
      activo === 0
        ? {
            activo: 0,
            fechaEliminacion: new Date(),
          }
        : {
            activo: 1,
            fechaEliminacion: null,
          },
    include: userListInclude,
  });

  logger.info('Estado de usuario actualizado', { userId, actorId, activo });

  return sanitizeUser(updated);
};

export const resetUserPassword = async (gimnasioId, actorId, userId, newPassword) => {
  const user = await prisma.usuario.findUnique({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError('Usuario no encontrado');
  }

  assertGymOwnership(user.gimnasioId, gimnasioId, 'Usuario');
  ensureAdminTarget(user);

  const passwordHash = await hashPassword(newPassword);

  await prisma.usuario.update({
    where: { id: userId },
    data: { passwordHash },
  });

  logger.info('Contraseña de usuario restablecida', { userId, actorId });

  return { success: true };
};
