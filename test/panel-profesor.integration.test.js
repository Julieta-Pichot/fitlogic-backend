// Pruebas de integración contra la BD real configurada en .env (no usan mocks).
// Reproducen los dos 500 reportados: editar una clase y listar notificaciones fallaban cuando
// la tabla `notificacion` no tenía `clase_id` / `fecha_ocurrencia`.
// Crean sus propios datos (prefijo TEST-INT) con la forma de los reales -clase recurrente con
// días, inscriptos y avisos de distintos tipos- y los borran al terminar. Nunca modifican filas existentes.
// Si no hay BD alcanzable, se saltan.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import { findMissingSchema } from '../src/lib/schema-check.js';
import * as classes from '../src/services/classes.service.js';
import * as notifications from '../src/services/notifications.service.js';
import * as recipes from '../src/services/recipes.service.js';
import * as routines from '../src/services/routines.service.js';

let reachable = true;
let profesor;
let cliente;
let claseId;
const createdNotifications = [];
const createdRoutines = [];

const iso = (hour) => `2030-01-07T${String(hour).padStart(2, '0')}:10:00-03:00`; // lunes
const body = (extra = {}) => ({
  nombre: 'TEST-INT clase', sala: 'Sala A', cupoMaximo: 15, recurrente: true,
  fechaHora: iso(6), diasSemana: [1, 3, 5, 6], ...extra,
});

before(async () => {
  try {
    profesor = await prisma.profesor.findFirst({ where: { estadoCuentaStaff: { nombre: 'HABILITADO' }, usuario: { activo: true } } });
    cliente = await prisma.cliente.findFirst();
    if (!profesor || !cliente) throw new Error('sin datos base');
  } catch {
    reachable = false;
    return;
  }

  const clase = await classes.createClass(profesor.id, body());
  claseId = clase.id;
  const estado = await prisma.estadoInscripcion.findUnique({ where: { nombre: 'INSCRIPTO' } });
  await prisma.inscripcionClase.create({ data: { claseId, clienteId: cliente.id, estadoInscripcionId: estado.id } });

  // Avisos de distintos tipos: uno ligado a la clase (como los del scheduler) y otros sin clase.
  const tipos = await prisma.tipoNotificacion.findMany();
  for (const [index, tipo] of tipos.entries()) {
    const created = await prisma.notificacion.create({
      data: {
        usuarioId: profesor.usuarioId, tipoNotificacionId: tipo.id, titulo: `TEST-INT ${tipo.nombre}`, mensaje: 'x',
        leida: index === 0, ...(tipo.nombre === 'CLASE_PROXIMA' ? { claseId, fechaOcurrencia: new Date('2030-01-07T09:10:00Z') } : {}),
      },
    });
    createdNotifications.push(created.id);
  }
});

after(async () => {
  if (!reachable) return;
  for (const id of createdRoutines) {
    await prisma.rutinaEjercicio.deleteMany({ where: { rutinaId: id } });
    await prisma.rutinaDia.deleteMany({ where: { rutinaId: id } });
    await prisma.rutina.deleteMany({ where: { id } });
  }
  await prisma.notificacion.deleteMany({ where: { titulo: { startsWith: 'TEST-INT' } } });
  if (claseId) {
    await prisma.notificacion.deleteMany({ where: { claseId } });
    await prisma.inscripcionClase.deleteMany({ where: { claseId } });
    await prisma.claseDia.deleteMany({ where: { claseId } });
    await prisma.clase.deleteMany({ where: { id: claseId } });
  }
  await prisma.$disconnect();
});

const guard = (name, fn) => test(name, async (t) => (reachable ? fn(t) : t.skip('BD no disponible')));

guard('la BD real tiene la migración 001 aplicada (clase_dia y columnas de notificacion)', async () => {
  assert.deepEqual(await findMissingSchema(), []);
});

guard('GET notificaciones filtro=todas devuelve todos los tipos y el contador', async () => {
  const result = await notifications.listNotifications(profesor.usuarioId, { filtro: 'todas' });
  const mine = result.items.filter((item) => item.titulo.startsWith('TEST-INT'));
  assert.equal(mine.length, createdNotifications.length);
  assert.ok(mine.some((item) => item.tipo === 'CLASE_PROXIMA'));
  assert.ok(result.unreadCount >= createdNotifications.length - 1);
  assert.ok(mine.every((item) => typeof item.leida === 'boolean' && typeof item.fechaEnvio.getTime === 'function'));
  JSON.stringify(result); // debe poder serializarse
});

guard('GET notificaciones filtro=no_leidas excluye las leídas', async () => {
  const result = await notifications.listNotifications(profesor.usuarioId, { filtro: 'no_leidas' });
  assert.ok(result.items.every((item) => item.leida === false));
});

guard('marcar una como leída y marcar todas (solo las propias)', async () => {
  const target = createdNotifications[1];
  await notifications.markAsRead(profesor.usuarioId, target);
  assert.equal((await prisma.notificacion.findUnique({ where: { id: target } })).leida, true);
  await assert.rejects(() => notifications.markAsRead(profesor.usuarioId + 100000, target), { statusCode: 404 });

  const realUnread = await prisma.notificacion.count({ where: { usuarioId: profesor.usuarioId, leida: false, NOT: { titulo: { startsWith: 'TEST-INT' } } } });
  if (realUnread === 0) {
    await notifications.markAllAsRead(profesor.usuarioId);
    assert.equal((await notifications.listNotifications(profesor.usuarioId, {})).unreadCount, 0);
  }
});

guard('PUT clase con inscriptos, días y aviso asociado guarda y persiste clase_dia', async () => {
  const updated = await classes.updateClass(profesor.id, claseId, body({ nombre: 'TEST-INT editada', sala: 'Sala B', cupoMaximo: 20, diasSemana: [2, 4] }));
  assert.equal(updated.nombre, 'TEST-INT editada');
  assert.equal(updated.cupoMaximo, 20);
  assert.equal(updated.inscriptos, 1);
  // el día base (lunes) se agrega a los elegidos
  assert.deepEqual(updated.diasSemana, [1, 2, 4]);
  const rows = await prisma.claseDia.findMany({ where: { claseId }, orderBy: { diaSemana: 'asc' } });
  assert.deepEqual(rows.map((row) => row.diaSemana), [1, 2, 4]);
});

guard('PUT clase: días repetidos o con el día base duplicado no rompen el UNIQUE', async () => {
  const updated = await classes.updateClass(profesor.id, claseId, body({ diasSemana: [1, 1, '3', 3] }));
  assert.deepEqual(updated.diasSemana, [1, 3]);
});

guard('PUT clase: cupo menor a inscriptos => 409 con mensaje claro', async () => {
  await assert.rejects(() => classes.updateClass(profesor.id, claseId, body({ cupoMaximo: 0 })), { statusCode: 400 });
  const enrolled = await prisma.inscripcionClase.count({ where: { claseId } });
  assert.equal(enrolled, 1);
  await prisma.clase.update({ where: { id: claseId }, data: { cupoMaximo: 20 } });
  const extra = await prisma.cliente.findFirst({ where: { id: { not: cliente.id } } });
  if (extra) {
    const estado = await prisma.estadoInscripcion.findUnique({ where: { nombre: 'ASISTIO' } });
    await prisma.inscripcionClase.create({ data: { claseId, clienteId: extra.id, estadoInscripcionId: estado.id } });
    await assert.rejects(() => classes.updateClass(profesor.id, claseId, body({ cupoMaximo: 1 })), (error) => error.statusCode === 409 && /inscriptos/.test(error.message));
  }
});

guard('PUT clase: datos inválidos => 400 y clase ajena/inexistente => 404', async () => {
  await assert.rejects(() => classes.updateClass(profesor.id, claseId, body({ fechaHora: 'no-es-fecha' })), { statusCode: 400 });
  await assert.rejects(() => classes.updateClass(profesor.id, claseId, body({ diasSemana: [9] })), { statusCode: 400 });
  await assert.rejects(() => classes.updateClass(profesor.id, claseId, body({ diasSemana: [] })), { statusCode: 400 });
  await assert.rejects(() => classes.updateClass(profesor.id + 100000, claseId, body()), { statusCode: 404 });
  await assert.rejects(() => classes.updateClass(profesor.id, 999999999, body()), { statusCode: 404 });
});

guard('PUT clase: borra solo los avisos pendientes de la clase y conserva los leídos', async () => {
  const before = await prisma.notificacion.findMany({ where: { claseId } });
  assert.ok(before.length >= 1);
  await classes.updateClass(profesor.id, claseId, body());
  const unreadFuture = await prisma.notificacion.count({ where: { claseId, leida: false, fechaOcurrencia: { gte: new Date() } } });
  assert.equal(unreadFuture, 0);
});

guard('PUT rutina y PUT receta sobre datos reales funcionan (misma lógica de transacción)', async () => {
  const ejercicios = await prisma.ejercicio.findMany({ take: 2 });
  const created = await routines.createRoutine(profesor.id, {
    clienteId: cliente.id, nombre: 'TEST-INT rutina', activa: false, diasSemana: [7],
    ejercicios: ejercicios.map((e) => ({ ejercicioId: e.id, series: 3, repeticiones: 10 })),
  });
  createdRoutines.push(created.id);
  const updated = await routines.updateRoutine(profesor.id, created.id, {
    nombre: 'TEST-INT rutina 2', activa: false, diasSemana: [6, 7], ejercicios: [{ ejercicioId: ejercicios[0].id, series: 4, repeticiones: 8 }],
  });
  assert.equal(updated.ejercicios.length, 1);
  assert.deepEqual(updated.diasSemana, [6, 7]);
  await assert.rejects(() => routines.updateRoutine(profesor.id + 100000, created.id, { nombre: 'x', diasSemana: [1], ejercicios: [{ ejercicioId: ejercicios[0].id }] }), { statusCode: 404 });

  const categoria = await prisma.categoriaReceta.findFirst();
  const recipe = await recipes.createRecipe(profesor.id, { nombre: 'TEST-INT receta', categoriaRecetaId: categoria.id, ingredientes: [{ nombre: 'a' }], pasos: [{ descripcion: 'p' }] });
  try {
    const edited = await recipes.updateRecipe(profesor.id, recipe.id, { nombre: 'TEST-INT receta 2', categoriaRecetaId: categoria.id, ingredientes: [], pasos: [] });
    assert.equal(edited.nombre, 'TEST-INT receta 2');
  } finally {
    await recipes.deleteRecipe(profesor.id, recipe.id);
  }
});
