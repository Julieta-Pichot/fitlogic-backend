// ============================================================================
// Crea el PRIMER administrador de una base nueva (camino de deploy a producción).
//
// Uso:  ADMIN_EMAIL=admin@tu-dominio.com ADMIN_PASSWORD='una-clave-larga' npm run create-admin
//       (opcionales: ADMIN_NOMBRE, ADMIN_APELLIDO)
//
// - Solo crea el usuario si NO existe ningún administrador (no pisa ni resetea nada).
// - Rechaza contraseñas de menos de 10 caracteres. Nunca imprime la contraseña.
// - Deja listos los catálogos mínimos (roles, estados, métodos de pago, etc.) y el registro
//   del gimnasio, de forma idempotente. No crea usuarios ni datos de prueba.
// - Hashea con bcryptjs y 12 rondas, igual que la app (auth.service.js).
// ============================================================================
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 10;

const CATALOGOS = [
  ['rol', ['ADMIN', 'PROFESOR', 'RECEPCIONISTA', 'CLIENTE']],
  ['estadoCliente', ['HABILITADO', 'INHABILITADO_PAGO', 'INHABILITADO_BAJA']],
  ['estadoCuentaStaff', ['HABILITADO', 'INHABILITADO']],
  ['estadoCuota', ['PENDIENTE', 'ACTIVA', 'VENCIDA']],
  ['metodoPago', ['EFECTIVO', 'MERCADO_PAGO']],
  ['estadoInscripcion', ['INSCRIPTO', 'CANCELADO', 'ASISTIO']],
  ['categoriaReceta', ['DESAYUNO', 'ALMUERZO', 'MERIENDA', 'CENA']],
  ['tipoNotificacion', ['VENCIMIENTO_CUOTA', 'CLASE_PROXIMA', 'PUNTUAR_CLASE', 'VENCIMIENTO_APTO_FISICO', 'INSCRIPCION_CLASE']],
];

const fail = (message) => {
  console.error(`[create-admin] ${message}`);
  process.exit(1);
};

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) fail('Definí ADMIN_EMAIL con un email válido.');
if (!password) fail('Definí ADMIN_PASSWORD.');
if (password.length < MIN_PASSWORD_LENGTH) fail(`ADMIN_PASSWORD debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);

const prisma = new PrismaClient();

try {
  for (const [model, nombres] of CATALOGOS) {
    for (const nombre of nombres) {
      await prisma[model].upsert({ where: { nombre }, update: {}, create: { nombre } });
    }
  }
  if (!(await prisma.gimnasio.findFirst())) {
    await prisma.gimnasio.create({ data: { nombre: 'FitLogic', direccion: 'A definir por el administrador', telefono: 'A definir por el administrador' } });
  }

  const rolAdmin = await prisma.rol.findUnique({ where: { nombre: 'ADMIN' } });
  const existente = await prisma.usuario.findFirst({ where: { rolId: rolAdmin.id }, select: { id: true } });
  if (existente) {
    console.log('[create-admin] Ya existe un administrador: no se crea ni se modifica nada.');
  } else {
    if (await prisma.usuario.findUnique({ where: { email } })) fail('Ya existe un usuario con ese ADMIN_EMAIL (con otro rol).');
    await prisma.usuario.create({
      data: {
        rolId: rolAdmin.id,
        nombre: process.env.ADMIN_NOMBRE?.trim() || 'Administrador',
        apellido: process.env.ADMIN_APELLIDO?.trim() || 'FitLogic',
        email,
        passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
        activo: true,
      },
    });
    console.log(`[create-admin] Administrador creado: ${email}`);
  }
} catch (error) {
  console.error('[create-admin] Error:', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
