import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { roleNameToKey } from '../constants/index.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../errors/AppError.js';
import { userInclude } from '../middlewares/auth.middleware.js';

const SALT_ROUNDS = 12;

export const sanitizeUser = (user) => {
  if (!user) return null;

  const { passwordHash, ...safeUser } = user;

  return {
    ...safeUser,
    roleKey: roleNameToKey(user.rol?.nombre),
    roleName: user.rol?.nombre ?? null,
    gimnasioCodigo: user.gimnasio?.codigo ?? null,
    gimnasioNombre: user.gimnasio?.nombre ?? null,
    especialidades:
      user.profesor?.especialidades
        ?.map((item) => item.especialidad?.nombre)
        .filter(Boolean) ?? [],
    profile: {
      cliente: user.cliente ?? null,
      profesor: user.profesor ?? null,
      recepcionista: user.recepcionista ?? null,
    },
  };
};

const signToken = (user) =>
  jwt.sign(
    {
      userId: user.id,
      email: user.email,
      rolId: user.rolId,
      roleName: user.rol?.nombre,
      gimnasioId: user.gimnasioId,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

export const login = async ({ codigoGimnasio, email, password }) => {
  const gimnasio = await prisma.gimnasio.findUnique({
    where: { codigo: codigoGimnasio },
  });

  if (!gimnasio || gimnasio.activo !== 1) {
    throw new UnauthorizedError('Credenciales inválidas');
  }

  const user = await prisma.usuario.findFirst({
    where: {
      email: email.trim().toLowerCase(),
      gimnasioId: gimnasio.id,
    },
    include: userInclude,
  });

  if (!user || user.activo !== 1) {
    throw new UnauthorizedError('Credenciales inválidas');
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);

  if (!passwordValid) {
    throw new UnauthorizedError('Credenciales inválidas');
  }

  const token = signToken(user);

  return {
    token,
    user: sanitizeUser(user),
  };
};

export const getCurrentUser = async (userId) => {
  const user = await prisma.usuario.findUnique({
    where: { id: userId },
    include: userInclude,
  });

  if (!user || user.activo !== 1) {
    throw new UnauthorizedError('Usuario no válido o inactivo');
  }

  return sanitizeUser(user);
};

export const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await prisma.usuario.findUnique({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError('Usuario no encontrado');
  }

  const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);

  if (!passwordValid) {
    throw new ValidationError('La contraseña actual es incorrecta');
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.usuario.update({
    where: { id: userId },
    data: { passwordHash },
  });
};

export const hashPassword = (password) => bcrypt.hash(password, SALT_ROUNDS);
