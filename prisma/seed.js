import prisma from '../src/lib/prisma.js';
import { hashPassword } from '../src/services/auth.service.js';

const DEMO_PASSWORD = '123456';

const ROLES = [
  { id: 1, nombre: 'ADMIN' },
  { id: 2, nombre: 'PROFESOR' },
  { id: 3, nombre: 'RECEPCIONISTA' },
  { id: 4, nombre: 'CLIENTE' },
];

const ESTADOS_CLIENTE = [
  { id: 1, nombre: 'ACTIVO' },
  { id: 2, nombre: 'PENDIENTE_PAGO' },
  { id: 3, nombre: 'PENDIENTE_HABILITACION' },
  { id: 4, nombre: 'BAJA' },
];

const ESTADOS_CUOTA = [
  { id: 1, nombre: 'ACTIVA' },
  { id: 2, nombre: 'VENCIDA' },
  { id: 3, nombre: 'PENDIENTE' },
];

async function main() {
  for (const rol of ROLES) {
    await prisma.rol.upsert({
      where: { id: rol.id },
      update: { nombre: rol.nombre },
      create: rol,
    });
  }

  for (const estado of ESTADOS_CLIENTE) {
    await prisma.estadoCliente.upsert({
      where: { id: estado.id },
      update: { nombre: estado.nombre },
      create: estado,
    });
  }

  for (const estado of ESTADOS_CUOTA) {
    await prisma.estadoCuota.upsert({
      where: { id: estado.id },
      update: { nombre: estado.nombre },
      create: estado,
    });
  }

  const gimnasio = await prisma.gimnasio.upsert({
    where: { codigo: 'FIT001' },
    update: {},
    create: {
      codigo: 'FIT001',
      nombre: 'FitLogic Demo Gym',
      direccion: 'Av. Corrientes 1234, CABA',
      telefono: '+54 11 1234-5678',
      email: 'contacto@fitlogic.demo',
      activo: 1,
    },
  });

  await prisma.configuracionGimnasio.upsert({
    where: { gimnasioId: gimnasio.id },
    update: {},
    create: {
      gimnasioId: gimnasio.id,
      modoSalaUnica: 0,
      notifNuevoCliente: 1,
      notifNuevoPago: 1,
      notifClaseProxima: 1,
      notifAptoVencido: 1,
      codigoSoporte: 'GYM-001-FL',
    },
  });

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const demoUsers = [
    {
      rolId: 1,
      nombre: 'Admin',
      apellido: 'Sistema',
      email: 'admin@fitlogic.demo',
      createProfile: null,
    },
    {
      rolId: 2,
      nombre: 'Carlos',
      apellido: 'López',
      email: 'profesor@fitlogic.demo',
      createProfile: (usuarioId) =>
        prisma.profesor.upsert({
          where: { usuarioId },
          update: {},
          create: { usuarioId, especialidad: 'Musculación y funcional' },
        }),
    },
    {
      rolId: 3,
      nombre: 'Ana',
      apellido: 'Martínez',
      email: 'recepcionista@fitlogic.demo',
      createProfile: (usuarioId) =>
        prisma.recepcionista.upsert({
          where: { usuarioId },
          update: {},
          create: { usuarioId },
        }),
    },
    {
      rolId: 4,
      nombre: 'María',
      apellido: 'García',
      email: 'cliente@fitlogic.demo',
      createProfile: (usuarioId) =>
        prisma.cliente.upsert({
          where: { usuarioId },
          update: {},
          create: {
            usuarioId,
            estadoClienteId: 1,
            objetivoDiasSemana: 4,
            rachaActual: 5,
            fechaAlta: new Date(),
          },
        }),
    },
  ];

  for (const demoUser of demoUsers) {
    const existingUser = await prisma.usuario.findFirst({
      where: {
        email: demoUser.email,
        gimnasioId: gimnasio.id,
      },
    });

    const usuario = existingUser
      ? await prisma.usuario.update({
          where: { id: existingUser.id },
          data: {
            nombre: demoUser.nombre,
            apellido: demoUser.apellido,
            email: demoUser.email,
            passwordHash,
            activo: 1,
            rolId: demoUser.rolId,
          },
        })
      : await prisma.usuario.create({
          data: {
            nombre: demoUser.nombre,
            apellido: demoUser.apellido,
            email: demoUser.email,
            passwordHash,
            activo: 1,
            gimnasioId: gimnasio.id,
            rolId: demoUser.rolId,
          },
        });

    if (demoUser.createProfile) {
      await demoUser.createProfile(usuario.id);
    }
  }

  console.log('Seed completado:', {
    gimnasio: gimnasio.codigo,
    demoPassword: DEMO_PASSWORD,
    users: demoUsers.map((user) => user.email),
  });
}

main()
  .catch((error) => {
    console.error('Error en seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
