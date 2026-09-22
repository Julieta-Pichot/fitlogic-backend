import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError.js';

const clientInclude = {
  usuario: { include: { rol: true } },
  estadoCliente: true,
  cuotas: { include: { plan: true, estadoCuota: true, pago: true }, orderBy: { fechaVencimiento: 'desc' } },
};

const getClient = async (clientId) => {
  const client = await prisma.cliente.findUnique({ where: { id: Number(clientId) }, include: clientInclude });
  if (!client) throw new NotFoundError('Cliente no encontrado');
  return client;
};

const getStateId = async (name) => {
  const state = await prisma.estadoCliente.findUnique({ where: { nombre: name } });
  if (!state) throw new ValidationError(`No existe el estado de cliente ${name}`);
  return state.id;
};

export const listClients = async (query = {}) => {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const estadoClienteId = query.estadoClienteId ? Number(query.estadoClienteId) : undefined;
  return prisma.cliente.findMany({
    where: {
      ...(estadoClienteId ? { estadoClienteId } : {}),
      ...(search
        ? { usuario: { OR: [
            { nombre: { contains: search } },
            { apellido: { contains: search } },
            { email: { contains: search } },
          ] } }
        : {}),
    },
    include: clientInclude,
    orderBy: { id: 'desc' },
  });
};

export const getClientById = (clientId) => getClient(clientId);

export const getCurrentClient = async (userId) => {
  const client = await prisma.cliente.findUnique({ where: { usuarioId: userId }, include: clientInclude });
  if (!client) throw new NotFoundError('Perfil de cliente no encontrado');
  return client;
};

export const createClient = async (_actorId, payload = {}) => {
  const email = String(payload.email ?? '').trim().toLowerCase();
  const password = String(payload.password ?? '');
  if (!email || !password) throw new ValidationError('Email y contraseña son obligatorios');
  if (!String(payload.nombre ?? '').trim() || !String(payload.apellido ?? '').trim()) {
    throw new ValidationError('Nombre y apellido son obligatorios');
  }
  if (await prisma.usuario.findUnique({ where: { email } })) {
    throw new ConflictError('Ya existe un usuario con ese email');
  }

  const client = await prisma.$transaction(async (tx) => {
    const role = await tx.rol.findUnique({ where: { nombre: 'CLIENTE' } });
    if (!role) throw new ValidationError('No existe el rol CLIENTE');
    const user = await tx.usuario.create({
      data: {
        rolId: role.id,
        nombre: String(payload.nombre).trim(),
        apellido: String(payload.apellido).trim(),
        email,
        telefono: payload.telefono ? String(payload.telefono).trim() : null,
        passwordHash: await bcrypt.hash(password, 12),
        activo: true,
      },
    });
    const cliente = await tx.cliente.create({
      data: {
        usuarioId: user.id,
        estadoClienteId: await getStateId('HABILITADO'),
        objetivoEntrenamiento: payload.objetivoEntrenamiento ? String(payload.objetivoEntrenamiento).trim() : null,
        objetivoDiasRacha: 3,
        fechaAlta: new Date(),
      },
    });
    return tx.cliente.findUnique({ where: { id: cliente.id }, include: clientInclude });
  });

  return client;
};

export const updateClient = async (clientId, payload = {}) => {
  await getClient(clientId);
  const data = {};
  if (payload.objetivoEntrenamiento !== undefined) data.objetivoEntrenamiento = String(payload.objetivoEntrenamiento).trim() || null;
  if (payload.estadoClienteId !== undefined) {
    const stateId = Number(payload.estadoClienteId);
    if (!await prisma.estadoCliente.findUnique({ where: { id: stateId } })) throw new ValidationError('Estado de cliente inválido');
    data.estadoClienteId = stateId;
  }
  if (payload.nombre !== undefined || payload.apellido !== undefined || payload.telefono !== undefined) {
    const current = await getClient(clientId);
    await prisma.usuario.update({
      where: { id: current.usuarioId },
      data: {
        ...(payload.nombre !== undefined ? { nombre: String(payload.nombre).trim() } : {}),
        ...(payload.apellido !== undefined ? { apellido: String(payload.apellido).trim() } : {}),
        ...(payload.telefono !== undefined ? { telefono: String(payload.telefono).trim() || null } : {}),
      },
    });
  }
  if (Object.keys(data).length) await prisma.cliente.update({ where: { id: Number(clientId) }, data });
  return getClient(clientId);
};

export const updateMedicalClearance = async (clientId, archivo, fechaCarga = new Date()) => {
  if (!archivo) throw new ValidationError('El archivo del apto físico es obligatorio');
  const loadedAt = new Date(fechaCarga);
  if (Number.isNaN(loadedAt.getTime())) throw new ValidationError('La fecha de carga es inválida');
  const expiresAt = new Date(loadedAt);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  await getClient(clientId);
  return prisma.cliente.update({
    where: { id: Number(clientId) },
    data: {
      aptoFisicoArchivo: String(archivo),
      aptoFisicoFechaCarga: loadedAt,
      aptoFisicoFechaVencimiento: expiresAt,
    },
    include: clientInclude,
  });
};

export const changeClientStatus = async (clientId, statusName) => {
  const stateId = await getStateId(statusName);
  await getClient(clientId);
  return prisma.cliente.update({ where: { id: Number(clientId) }, data: { estadoClienteId: stateId }, include: clientInclude });
};
