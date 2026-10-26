// ============================================================================
// Datos demo SOLO PARA LOS TESTS de integración (no hay comandos npm para sembrarlos).
// Cada test usa una etiqueta propia (tag) y limpia lo que crea; no toca usuarios existentes.
// Se niega a correr con NODE_ENV=production.
// ============================================================================
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import prisma from '../../src/lib/prisma.js';
import { enrollInClass } from '../../src/services/cliente-classes.service.js';
import { generateExpiryReminders } from '../../src/services/notification-scheduler.js';
import { getGymParts, gymWallTimeToDate, shiftCalendarDay } from '../../src/utils/timezone.js';

export const DEMO_CLIENT_EMAIL = 'demo.cliente@fitlogic.test';
export const DEMO_PROFESSOR_EMAIL = 'demo.profesor@fitlogic.test';
export const DEMO_PASSWORD = 'Demo1234';

// `tag` permite un segundo juego de datos independiente (lo usan los tests para no pisar tu demo).
const names = (tag) =>
  tag
    ? { client: `${tag}.cliente@fitlogic.test`, professor: `${tag}.profesor@fitlogic.test`, prefix: `TESTDEMO-${tag} ` }
    : { client: DEMO_CLIENT_EMAIL, professor: DEMO_PROFESSOR_EMAIL, prefix: 'DEMO ' };

const DAY = 86_400_000;

const assertDevelopment = () => {
  if (process.env.NODE_ENV === 'production') throw new Error('Los datos demo no se pueden usar con NODE_ENV=production');
};

export const unseedDemo = async ({ tag = '' } = {}) => {
  assertDevelopment();
  const n = names(tag);
  const users = await prisma.usuario.findMany({ where: { email: { in: [n.client, n.professor] } }, select: { id: true } });
  const userIds = users.map((user) => user.id);
  const clients = await prisma.cliente.findMany({ where: { usuarioId: { in: userIds } }, select: { id: true } });
  const clientIds = clients.map((client) => client.id);
  const professors = await prisma.profesor.findMany({ where: { usuarioId: { in: userIds } }, select: { id: true } });
  const professorIds = professors.map((professor) => professor.id);
  const classes = await prisma.clase.findMany({ where: { OR: [{ nombre: { startsWith: n.prefix } }, { profesorId: { in: professorIds } }] }, select: { id: true } });
  const classIds = classes.map((clase) => clase.id);
  const plans = await prisma.plan.findMany({ where: { nombre: { startsWith: n.prefix } }, select: { id: true } });
  const planIds = plans.map((plan) => plan.id);
  // SOLO las cuotas de los clientes demo: aunque un cliente real haya usado un plan DEMO, su cuota no se toca.
  const quotas = await prisma.cuota.findMany({ where: { clienteId: { in: clientIds } }, select: { id: true } });
  const quotaIds = quotas.map((quota) => quota.id);
  const routines = await prisma.rutina.findMany({ where: { OR: [{ clienteId: { in: clientIds } }, { profesorId: { in: professorIds } }] }, select: { id: true } });
  const routineIds = routines.map((routine) => routine.id);

  await prisma.notificacion.deleteMany({ where: { OR: [{ usuarioId: { in: userIds } }, { claseId: { in: classIds } }] } });
  await prisma.puntuacionClase.deleteMany({ where: { OR: [{ claseId: { in: classIds } }, { clienteId: { in: clientIds } }] } });
  await prisma.inscripcionClase.deleteMany({ where: { OR: [{ claseId: { in: classIds } }, { clienteId: { in: clientIds } }] } });
  await prisma.claseDia.deleteMany({ where: { claseId: { in: classIds } } });
  await prisma.clase.deleteMany({ where: { id: { in: classIds } } });
  await prisma.asistencia.deleteMany({ where: { clienteId: { in: clientIds } } });
  await prisma.mpEventoPago.deleteMany({ where: { cuotaId: { in: quotaIds } } });
  await prisma.pago.deleteMany({ where: { cuotaId: { in: quotaIds } } });
  await prisma.cuota.deleteMany({ where: { id: { in: quotaIds } } });
  const recipes = await prisma.receta.findMany({ where: { profesorId: { in: professorIds } }, select: { id: true } });
  const recipeIds = recipes.map((recipe) => recipe.id);
  await prisma.ingredienteReceta.deleteMany({ where: { recetaId: { in: recipeIds } } });
  await prisma.pasoReceta.deleteMany({ where: { recetaId: { in: recipeIds } } });
  await prisma.receta.deleteMany({ where: { id: { in: recipeIds } } });
  await prisma.rutinaEjercicio.deleteMany({ where: { rutinaId: { in: routineIds } } });
  await prisma.rutinaDia.deleteMany({ where: { rutinaId: { in: routineIds } } });
  await prisma.rutina.deleteMany({ where: { id: { in: routineIds } } });
  // Los planes DEMO que todavía usa una cuota ajena a la demo se conservan (se reutilizan al volver a sembrar).
  const usedPlans = await prisma.cuota.findMany({ where: { planId: { in: planIds } }, select: { planId: true }, distinct: ['planId'] });
  const keep = new Set(usedPlans.map((item) => item.planId));
  const removablePlans = planIds.filter((id) => !keep.has(id));
  await prisma.promocion.deleteMany({ where: { planId: { in: planIds } } });
  await prisma.plan.deleteMany({ where: { id: { in: removablePlans } } });
  await prisma.cliente.deleteMany({ where: { id: { in: clientIds } } });
  await prisma.profesor.deleteMany({ where: { id: { in: professorIds } } });
  await prisma.usuario.deleteMany({ where: { id: { in: userIds } } });

  return { usuarios: userIds.length, clases: classIds.length, planes: removablePlans.length, planesConservados: keep.size, cuotas: quotaIds.length, rutinas: routineIds.length };
};

export const seedDemo = async ({ tag = '' } = {}) => {
  assertDevelopment();
  const n = names(tag);
  await unseedDemo({ tag });

  const now = new Date();
  const today = getGymParts(now);
  const dayKey = (offset) => shiftCalendarDay(today, offset);
  const at = (offset, hour, minute = 0) => {
    const day = dayKey(offset);
    return gymWallTimeToDate(day.year, day.month, day.day, hour, minute);
  };
  const dateOnly = (offset) => {
    const day = dayKey(offset);
    return new Date(Date.UTC(day.year, day.month - 1, day.day));
  };

  const [roleClient, roleProfessor, enabledClient, enabledStaff, active, cash] = await Promise.all([
    prisma.rol.findUnique({ where: { nombre: 'CLIENTE' } }),
    prisma.rol.findUnique({ where: { nombre: 'PROFESOR' } }),
    prisma.estadoCliente.findUnique({ where: { nombre: 'HABILITADO' } }),
    prisma.estadoCuentaStaff.findUnique({ where: { nombre: 'HABILITADO' } }),
    prisma.estadoCuota.findUnique({ where: { nombre: 'ACTIVA' } }),
    prisma.metodoPago.findUnique({ where: { nombre: 'EFECTIVO' } }),
  ]);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const professorUser = await prisma.usuario.create({
    data: { rolId: roleProfessor.id, nombre: 'Profe', apellido: 'Demo', email: n.professor, passwordHash, activo: true },
  });
  const professor = await prisma.profesor.create({ data: { usuarioId: professorUser.id, estadoCuentaStaffId: enabledStaff.id, especialidad: 'Demo' } });

  const clientUser = await prisma.usuario.create({
    data: { rolId: roleClient.id, nombre: 'Cliente', apellido: 'Demo', email: n.client, passwordHash, telefono: '+54 11 5555-0000', activo: true },
  });
  const client = await prisma.cliente.create({
    data: {
      usuarioId: clientUser.id,
      estadoClienteId: enabledClient.id,
      objetivoEntrenamiento: 'Ganar masa muscular (demo)',
      objetivoDiasRacha: 4, // valor explícito de demostración (no es un default del sistema)
      fechaAlta: dateOnly(-60),
      // Apto físico por vencer en 5 días: dispara el aviso de vencimiento.
      aptoFisicoFechaCarga: dateOnly(-360),
      aptoFisicoFechaVencimiento: dateOnly(5),
    },
  });

  // Planes y promoción (los planes son un catálogo global: el unseed los borra).
  const ensurePlan = async (name, duracionDias, precio) => {
    const existing = await prisma.plan.findFirst({ where: { nombre: name } });
    return existing
      ? prisma.plan.update({ where: { id: existing.id }, data: { duracionDias, precio, activo: true } })
      : prisma.plan.create({ data: { nombre: name, duracionDias, precio } });
  };
  const monthly = await ensurePlan(`${n.prefix}Plan Mensual`, 30, 15000);
  const quarterly = await ensurePlan(`${n.prefix}Plan Trimestral`, 90, 40000);
  await prisma.promocion.create({
    data: { planId: quarterly.id, nombre: `${n.prefix}15% OFF`, descuento: 15, fechaInicio: dateOnly(-2), fechaFin: dateOnly(20), activa: true },
  });

  // Cuota ACTIVA que vence en 8 días (dispara el aviso de cuota) con su pago.
  const quota = await prisma.cuota.create({
    data: { clienteId: client.id, planId: monthly.id, estadoCuotaId: active.id, fechaInicio: dateOnly(-22), fechaVencimiento: dateOnly(8) },
  });
  await prisma.pago.create({
    data: {
      cuotaId: quota.id, metodoPagoId: cash.id, monto: 15000, montoNeto: 15000, comision: 0, medioPago: 'Efectivo',
      fechaAcreditacion: at(-22, 18, 30), fechaPago: at(-22, 18, 30), referenciaExterna: `${tag ? 'TEST' : 'DEMO'}-EFECTIVO-1`,
    },
  });

  // Cuota anterior (ya reemplazada => VENCIDA) pagada con Mercado Pago: bruto, comisión y neto de ejemplo.
  const [expired, mercadoPago] = await Promise.all([
    prisma.estadoCuota.findUnique({ where: { nombre: 'VENCIDA' } }),
    prisma.metodoPago.findUnique({ where: { nombre: 'MERCADO_PAGO' } }),
  ]);
  const previous = await prisma.cuota.create({
    data: { clienteId: client.id, planId: monthly.id, estadoCuotaId: expired.id, fechaInicio: dateOnly(-52), fechaVencimiento: dateOnly(-22) },
  });
  const mpRef = `${tag ? '9' : '8'}00000${previous.id}`;
  await prisma.pago.create({
    data: {
      cuotaId: previous.id, metodoPagoId: mercadoPago.id, monto: 15000, montoNeto: 14337.5, comision: 662.5,
      medioPago: 'Tarjeta de crédito VISA', ultimosDigitos: '3704', fechaPago: at(-52, 11, 5), fechaAcreditacion: at(-38, 0, 0), referenciaExterna: mpRef,
    },
  });
  await prisma.mpEventoPago.create({
    data: {
      mpPaymentId: mpRef, cuotaId: previous.id, estado: 'approved', detalleEstado: 'accredited', monto: 15000, origen: 'WEBHOOK', procesado: true,
      payloadResumen: { id: mpRef, status: 'approved', status_detail: 'accredited', transaction_amount: 15000, currency_id: 'ARS', payment_type_id: 'credit_card', payment_method_id: 'visa' },
      fechaRecepcion: at(-52, 11, 5),
    },
  });

  // Asistencias: semana en curso (lunes, un día a las 23:30 locales y hoy) y semanas anteriores.
  const monday = -(today.diaSemana - 1);
  const attendance = [at(monday, 8, 0), at(monday, 19, 15), at(0, 7, 30)];
  if (today.diaSemana >= 3) attendance.push(at(-1, 23, 30)); // ayer a las 23:30 locales (ya es "mañana" en UTC)
  for (const offset of [-8, -10, -13, -15, -20, -27, -34, -41]) attendance.push(at(offset, 18, 0));
  await prisma.asistencia.createMany({ data: attendance.map((fechaHora) => ({ clienteId: client.id, fechaHora })) });

  // Rutina activa que incluye el día de hoy.
  const exercises = await prisma.ejercicio.findMany({ where: { activo: true }, orderBy: { id: 'asc' }, take: 3 });
  const days = [...new Set([today.diaSemana, ((today.diaSemana + 1) % 7) + 1, ((today.diaSemana + 3) % 7) + 1])];
  await prisma.rutina.create({
    data: {
      clienteId: client.id,
      profesorId: professor.id,
      nombre: `${n.prefix}Full body`,
      descripcion: 'Rutina de demostración.',
      objetivo: 'Fuerza: Pecho, Espalda',
      nivelDificultad: 'Intermedio',
      frecuenciaSemanal: days.length,
      duracionEstimada: 60,
      fechaAsignacion: dateOnly(-3),
      dias: { create: days.map((diaSemana) => ({ diaSemana })) },
      ejercicios: { create: exercises.map((exercise, index) => ({ ejercicioId: exercise.id, series: 3, repeticiones: 10 + index, descansoSegundos: 60, ordenVisual: index + 1 })) },
    },
  });

  // Clase todos los días a las 21:00 + inscripción (por el servicio real: genera la notificación INSCRIPCION_CLASE).
  const demoClass = await prisma.clase.create({
    data: {
      profesorId: professor.id,
      nombre: `${n.prefix}Funcional`,
      sala: 'Sala DEMO',
      cupoMaximo: 12,
      recurrente: true,
      duracionMinutos: 60,
      fechaHora: at(-7, 21, 0),
      dias: { create: [1, 2, 3, 4, 5, 6, 7].map((diaSemana) => ({ diaSemana })) },
    },
  });
  await enrollInClass({ ...client, estadoCliente: enabledClient }, demoClass.id);

  // Recetas del profesor demo: una con información nutricional completa, una parcial y una sin datos ("No informado").
  const categories = Object.fromEntries((await prisma.categoriaReceta.findMany()).map((category) => [category.nombre, category.id]));
  const firstCategory = Object.values(categories)[0];
  await prisma.receta.create({
    data: {
      profesorId: professor.id, categoriaRecetaId: categories.ALMUERZO ?? firstCategory, nombre: `${n.prefix}Pollo con arroz integral`,
      descripcion: 'Plato completo y alto en proteínas (demo).', calorias: 520, proteinasG: 42.5, carbohidratosG: 55, grasasG: 14, porciones: 2,
      otroDatoNutricional: 'Fibra 6g', tiempoPreparacion: 35,
      ingredientes: { create: [{ nombre: 'Pechuga de pollo', cantidad: '300', unidad: 'g' }, { nombre: 'Arroz integral', cantidad: '1', unidad: 'taza' }] },
      pasos: { create: [{ numeroPaso: 1, descripcion: 'Cocinar el arroz.' }, { numeroPaso: 2, descripcion: 'Grillar el pollo y servir.' }] },
    },
  });
  await prisma.receta.create({
    data: { profesorId: professor.id, categoriaRecetaId: categories.DESAYUNO ?? firstCategory, nombre: `${n.prefix}Avena con frutas`, descripcion: 'Solo se informan las calorías (demo).', calorias: 310, tiempoPreparacion: 10 },
  });
  await prisma.receta.create({
    data: { profesorId: professor.id, categoriaRecetaId: categories.MERIENDA ?? firstCategory, nombre: `${n.prefix}Tostado simple`, descripcion: 'Sin información nutricional (demo).' },
  });

  // Avisos de vencimiento (cuota y apto) con el mismo generador que usa el scheduler.
  await generateExpiryReminders(now);

  return { email: n.client, password: DEMO_PASSWORD, clienteId: client.id, usuarioId: clientUser.id };
};

export const disconnect = () => prisma.$disconnect();
