import prisma from '../lib/prisma.js';
import { NotFoundError } from '../errors/AppError.js';
import { listClassesForProfessor } from './classes.service.js';

// Todos los clientes registrados (sin filtrar por estado), "Apellido, Nombre" ordenados.
// El estado se informa para que el front lo muestre, pero nadie queda afuera.
export const listClients = async () => {
  const clients = await prisma.cliente.findMany({
    select: {
      id: true,
      estadoCliente: { select: { nombre: true } },
      usuario: { select: { nombre: true, apellido: true } },
    },
  });

  return clients
    .map((client) => ({
      id: client.id,
      nombre: client.usuario.nombre,
      apellido: client.usuario.apellido,
      estado: client.estadoCliente.nombre,
    }))
    .sort((a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es'));
};

// Perfil del profesor autenticado, todo desde la BD. Nunca incluye el hash de la contraseña.
export const getProfile = async (profesorId) => {
  const profesor = await prisma.profesor.findUnique({
    where: { id: profesorId },
    select: {
      id: true,
      especialidad: true,
      estadoCuentaStaff: { select: { nombre: true } },
      usuario: {
        select: { nombre: true, apellido: true, email: true, telefono: true, fechaCreacion: true },
      },
    },
  });
  if (!profesor) throw new NotFoundError('Perfil de profesor no encontrado');

  return {
    id: profesor.id,
    nombre: profesor.usuario.nombre,
    apellido: profesor.usuario.apellido,
    email: profesor.usuario.email,
    telefono: profesor.usuario.telefono,
    especialidad: profesor.especialidad,
    estadoCuenta: profesor.estadoCuentaStaff.nombre,
    fechaAlta: profesor.usuario.fechaCreacion,
    clases: await listClassesForProfessor(profesorId),
  };
};
