// ============================================================================
// SEED DE FITLOGIC (ES Modules, para prisma/seed.js)
// ============================================================================
// Usa "import" porque el package.json del proyecto tiene "type": "module".
//
// Usa upsert en todos lados: es seguro correrlo aunque los datos ya existan
// (por ejemplo, si ya cargaste los catálogos vía el script SQL en HeidiSQL).
// No va a duplicar nada.
//
// IMPORTANTE: este archivo usa 'bcryptjs' (no 'bcrypt'). Es una implementación
// en JavaScript puro, sin dependencias nativas que compilar, así que funciona
// igual en Windows, Mac o Linux sin instalar herramientas de compilación.
// Si tu backend ya usa 'bcrypt' (la versión con binarios nativos) en el resto
// del código para comparar contraseñas en el login, instalá 'bcryptjs' de
// todos modos SOLO para el seed (ambas librerías generan hashes 100%
// compatibles entre sí, el formato es el mismo). Si preferís usar 'bcrypt'
// acá también, cambiá el import de abajo por: import bcrypt from 'bcrypt';
//
// Instalación necesaria antes de correr este archivo:
//   npm install bcryptjs
// ============================================================================

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD_DEMO = '123456';

async function main() {
  // --------------------------------------------------------------------
  // 1. CATÁLOGOS
  // --------------------------------------------------------------------

  const roles = await Promise.all(
    ['ADMIN', 'PROFESOR', 'RECEPCIONISTA', 'CLIENTE'].map((nombre) =>
      prisma.rol.upsert({
        where: { nombre },
        update: {},
        create: { nombre },
      })
    )
  );

  const estadosCliente = await Promise.all(
    ['HABILITADO', 'INHABILITADO_PAGO', 'INHABILITADO_BAJA'].map((nombre) =>
      prisma.estadoCliente.upsert({
        where: { nombre },
        update: {},
        create: { nombre },
      })
    )
  );

  const estadosStaff = await Promise.all(
    ['HABILITADO', 'INHABILITADO'].map((nombre) =>
      prisma.estadoCuentaStaff.upsert({
        where: { nombre },
        update: {},
        create: { nombre },
      })
    )
  );

  await Promise.all(
    ['PENDIENTE', 'ACTIVA', 'VENCIDA'].map((nombre) =>
      prisma.estadoCuota.upsert({
        where: { nombre },
        update: {},
        create: { nombre },
      })
    )
  );

  await Promise.all(
    ['EFECTIVO', 'MERCADO_PAGO'].map((nombre) =>
      prisma.metodoPago.upsert({
        where: { nombre },
        update: {},
        create: { nombre },
      })
    )
  );

  await Promise.all(
    ['INSCRIPTO', 'CANCELADO', 'ASISTIO'].map((nombre) =>
      prisma.estadoInscripcion.upsert({
        where: { nombre },
        update: {},
        create: { nombre },
      })
    )
  );

  await Promise.all(
    ['DESAYUNO', 'ALMUERZO', 'MERIENDA', 'CENA'].map((nombre) =>
      prisma.categoriaReceta.upsert({
        where: { nombre },
        update: {},
        create: { nombre },
      })
    )
  );

  await Promise.all(
    ['VENCIMIENTO_CUOTA', 'CLASE_PROXIMA', 'PUNTUAR_CLASE'].map((nombre) =>
      prisma.tipoNotificacion.upsert({
        where: { nombre },
        update: {},
        create: { nombre },
      })
    )
  );

  // --------------------------------------------------------------------
  // 2. GIMNASIO (registro único)
  // --------------------------------------------------------------------

  const gimnasioExistente = await prisma.gimnasio.findFirst();
  if (!gimnasioExistente) {
    await prisma.gimnasio.create({
      data: {
        nombre: 'FitLogic',
        direccion: 'A definir por el administrador',
        telefono: 'A definir por el administrador',
        emailSoporte: 'soporte@fitlogic.com',
        identidadVisual: null,
      },
    });
  }

  // --------------------------------------------------------------------
  // 3. HASH ÚNICO PARA TODOS LOS USUARIOS DE PRUEBA
  // --------------------------------------------------------------------
  // Se genera una sola vez acá y se reutiliza en los 4 usuarios de abajo.

  const passwordHash = await bcrypt.hash(PASSWORD_DEMO, 10);

  const rolAdmin = roles.find((r) => r.nombre === 'ADMIN');
  const rolProfesor = roles.find((r) => r.nombre === 'PROFESOR');
  const rolRecepcionista = roles.find((r) => r.nombre === 'RECEPCIONISTA');
  const rolCliente = roles.find((r) => r.nombre === 'CLIENTE');

  const estadoClienteHabilitado = estadosCliente.find((e) => e.nombre === 'HABILITADO');
  const estadoStaffHabilitado = estadosStaff.find((e) => e.nombre === 'HABILITADO');

  // --------------------------------------------------------------------
  // 4. ADMINISTRADOR (único, sin fila de rol propia)
  // --------------------------------------------------------------------

  await prisma.usuario.upsert({
    where: { email: 'admin@fitlogic.com' },
    update: { passwordHash },
    create: {
      rolId: rolAdmin.id,
      nombre: 'Admin',
      apellido: 'FitLogic',
      email: 'admin@fitlogic.com',
      passwordHash,
      activo: true,
    },
  });

  // --------------------------------------------------------------------
  // 5. PROFESOR DE PRUEBA
  // --------------------------------------------------------------------

  const usuarioProfesor = await prisma.usuario.upsert({
    where: { email: 'profesor@fitlogic.com' },
    update: { passwordHash },
    create: {
      rolId: rolProfesor.id,
      nombre: 'Juan',
      apellido: 'Profesor',
      email: 'profesor@fitlogic.com',
      passwordHash,
      activo: true,
    },
  });

  const profesorExistente = await prisma.profesor.findUnique({
    where: { usuarioId: usuarioProfesor.id },
  });
  if (!profesorExistente) {
    await prisma.profesor.create({
      data: {
        usuarioId: usuarioProfesor.id,
        estadoCuentaStaffId: estadoStaffHabilitado.id,
        especialidad: 'Musculación',
      },
    });
  }

  // --------------------------------------------------------------------
  // 6. RECEPCIONISTA DE PRUEBA
  // --------------------------------------------------------------------

  const usuarioRecepcionista = await prisma.usuario.upsert({
    where: { email: 'recepcion@fitlogic.com' },
    update: { passwordHash },
    create: {
      rolId: rolRecepcionista.id,
      nombre: 'María',
      apellido: 'Recepción',
      email: 'recepcion@fitlogic.com',
      passwordHash,
      activo: true,
    },
  });

  const recepcionistaExistente = await prisma.recepcionista.findUnique({
    where: { usuarioId: usuarioRecepcionista.id },
  });
  if (!recepcionistaExistente) {
    await prisma.recepcionista.create({
      data: {
        usuarioId: usuarioRecepcionista.id,
        estadoCuentaStaffId: estadoStaffHabilitado.id,
      },
    });
  }

  // --------------------------------------------------------------------
  // 7. CLIENTE DE PRUEBA
  // --------------------------------------------------------------------

  const usuarioCliente = await prisma.usuario.upsert({
    where: { email: 'cliente@fitlogic.com' },
    update: { passwordHash },
    create: {
      rolId: rolCliente.id,
      nombre: 'Lucía',
      apellido: 'Cliente',
      email: 'cliente@fitlogic.com',
      passwordHash,
      activo: true,
    },
  });

  const clienteExistente = await prisma.cliente.findUnique({
    where: { usuarioId: usuarioCliente.id },
  });
  if (!clienteExistente) {
    await prisma.cliente.create({
      data: {
        usuarioId: usuarioCliente.id,
        estadoClienteId: estadoClienteHabilitado.id,
        objetivoEntrenamiento: 'Bajar de peso',
        objetivoDiasRacha: 3,
      },
    });
  }

  console.log('Seed completado: catálogos, gimnasio y 4 usuarios de prueba listos.');
  console.log('---------------------------------------------------------------');
  console.log('Credenciales de prueba (contraseña igual para los 4: 123456):');
  console.log('  ADMIN         -> admin@fitlogic.com');
  console.log('  PROFESOR      -> profesor@fitlogic.com');
  console.log('  RECEPCIONISTA -> recepcion@fitlogic.com');
  console.log('  CLIENTE       -> cliente@fitlogic.com');
  console.log('---------------------------------------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });