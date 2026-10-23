// Integración contra la BD real (.env): validación de sala/profesor ocupados al crear y editar clases.
// Usa dos profesores temporales y salas con prefijo TEST-INT; borra todo al terminar y no toca
// ninguna fila existente. Se salta si no hay BD alcanzable.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import * as classes from '../src/services/classes.service.js';

let reachable = true;
let profA;
let profB;
const userIds = [];
const suffix = Date.now();
const room = `TEST-INT Sala ${suffix}`;

const at = (date, time) => `${date}T${time}:00-03:00`;
const body = (over = {}) => ({
  nombre: 'TEST-INT clase', sala: room, cupoMaximo: 10, recurrente: false, diasSemana: [],
  fechaHora: at('2030-01-08', '10:00'), horaFin: '11:00', ...over, // 2030-01-08 = martes
});

before(async () => {
  try {
    const rol = await prisma.rol.findUnique({ where: { nombre: 'PROFESOR' } });
    const mk = async (tag) => {
      const user = await prisma.usuario.create({
        data: { rolId: rol.id, nombre: `Temp${tag}`, apellido: 'Test', email: `tmp-int-${tag}-${suffix}@test.local`, passwordHash: 'x', activo: true },
      });
      userIds.push(user.id);
      return prisma.profesor.create({ data: { usuarioId: user.id, estadoCuentaStaffId: 1 } });
    };
    profA = await mk('A');
    profB = await mk('B');
  } catch {
    reachable = false;
  }
});

after(async () => {
  if (!reachable) return;
  const created = await prisma.clase.findMany({ where: { sala: { startsWith: 'TEST-INT' } }, select: { id: true } });
  const ids = created.map((c) => c.id);
  await prisma.notificacion.deleteMany({ where: { claseId: { in: ids } } });
  await prisma.claseDia.deleteMany({ where: { claseId: { in: ids } } });
  await prisma.clase.deleteMany({ where: { id: { in: ids } } });
  await prisma.profesor.deleteMany({ where: { id: { in: [profA?.id, profB?.id].filter(Boolean) } } });
  await prisma.usuario.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

const guard = (name, fn) => test(name, async (t) => (reachable ? fn(t) : t.skip('BD no disponible')));
const clean = () => prisma.clase.deleteMany({ where: { sala: { startsWith: 'TEST-INT' } } }).then(() => prisma.claseDia.deleteMany({ where: { clase: null } }).catch(() => {}));
const reset = async () => {
  const rows = await prisma.clase.findMany({ where: { sala: { startsWith: 'TEST-INT' } }, select: { id: true } });
  const ids = rows.map((r) => r.id);
  await prisma.claseDia.deleteMany({ where: { claseId: { in: ids } } });
  await prisma.clase.deleteMany({ where: { id: { in: ids } } });
};
void clean;
const conflict = (code = 'SALA_OCUPADA') => (error) => error.statusCode === 409 && error.code === code;

guard('mismo salón, día y hora => 409 SALA_OCUPADA con quién y cuándo (cruza profesores)', async () => {
  await reset();
  await classes.createClass(profA.id, body({ nombre: 'Spinning' }));
  await assert.rejects(() => classes.createClass(profB.id, body()), (error) => {
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, 'SALA_OCUPADA');
    assert.match(error.message, new RegExp(`La sala ${room} ya está ocupada el 08/01/2030 \\(martes\\) de 10:00 a 11:00 por la clase 'Spinning' a cargo de TempA Test`));
    assert.deepEqual(
      { n: error.conflictos[0].nombre, p: error.conflictos[0].profesor, i: error.conflictos[0].horaInicio, f: error.conflictos[0].horaFin },
      { n: 'Spinning', p: 'TempA Test', i: '10:00', f: '11:00' }
    );
    return true;
  });
});

guard('solapamiento parcial => 409; contiguo, otro horario y otro salón => permitido', async () => {
  await reset();
  await classes.createClass(profA.id, body());
  await assert.rejects(() => classes.createClass(profB.id, body({ fechaHora: at('2030-01-08', '10:30'), horaFin: '11:30' })), conflict());
  await classes.createClass(profB.id, body({ nombre: 'Contigua', fechaHora: at('2030-01-08', '11:00'), horaFin: '12:00' }));
  await classes.createClass(profB.id, body({ nombre: 'Tarde', fechaHora: at('2030-01-08', '15:00'), horaFin: '16:00' }));
  await classes.createClass(profB.id, body({ nombre: 'Otro salón', sala: `${room} B` }));
});

guard('la sala se compara sin mayúsculas ni espacios sobrantes', async () => {
  await reset();
  await classes.createClass(profA.id, body());
  await assert.rejects(() => classes.createClass(profB.id, body({ sala: `  ${room.toLowerCase().replace(/ /g, '   ')} ` })), conflict());
});

guard('única vs recurrente y recurrente vs recurrente', async () => {
  await reset();
  // recurrente martes y jueves desde el 1/1/2030, 10:00-11:00
  await classes.createClass(profA.id, body({ recurrente: true, diasSemana: [2, 4], fechaHora: at('2030-01-01', '10:00') }));
  await assert.rejects(() => classes.createClass(profB.id, body({ fechaHora: at('2030-01-15', '10:30'), horaFin: '11:30' })), (e) => conflict()(e) && e.conflictos[0].dias.join() === '2');
  await classes.createClass(profB.id, body({ nombre: 'Miércoles', fechaHora: at('2030-01-16', '10:00') }));
  await classes.createClass(profB.id, body({ nombre: 'Antes de vigencia', fechaHora: at('2029-12-25', '10:00') }));
  await assert.rejects(() => classes.createClass(profB.id, body({ recurrente: true, diasSemana: [4, 5], fechaHora: at('2030-01-03', '10:30'), horaFin: '11:30' })), (e) => conflict()(e) && e.conflictos[0].dias.join() === '4');
  await classes.createClass(profB.id, body({ nombre: 'Sin días compartidos', recurrente: true, diasSemana: [5, 6], fechaHora: at('2030-01-04', '10:00') }));
});

guard('varios días en conflicto se listan todos', async () => {
  await reset();
  await classes.createClass(profA.id, body({ recurrente: true, diasSemana: [2, 4], fechaHora: at('2030-01-01', '10:00') }));
  await assert.rejects(() => classes.createClass(profB.id, body({ recurrente: true, diasSemana: [2, 4], fechaHora: at('2030-01-01', '10:00') })), (e) => conflict()(e) && /martes, jueves/.test(e.message));
});

guard('editar: no choca consigo misma; si genera conflicto => 409; cambiar solo nombre de una clase ya en conflicto se permite', async () => {
  await reset();
  const a = await classes.createClass(profA.id, body({ nombre: 'A' }));
  const b = await classes.createClass(profB.id, body({ nombre: 'B', fechaHora: at('2030-01-08', '12:00'), horaFin: '13:00' }));
  const same = await classes.updateClass(profA.id, a.id, body({ nombre: 'A editada', cupoMaximo: 12 }));
  assert.equal(same.nombre, 'A editada');
  assert.equal(same.horaFin, '11:00');
  await assert.rejects(() => classes.updateClass(profB.id, b.id, body({ nombre: 'B', fechaHora: at('2030-01-08', '10:30'), horaFin: '11:30' })), conflict());
  // B no cambió en BD
  assert.equal((await prisma.clase.findUnique({ where: { id: b.id } })).duracionMinutos, 60);

  // conflicto preexistente (creado directo en BD): editar solo el nombre se permite, mover horario no
  const pre = await prisma.clase.create({ data: { profesorId: profB.id, nombre: 'Preexistente', sala: room, cupoMaximo: 5, fechaHora: new Date(at('2030-01-08', '10:15')), duracionMinutos: 60 } });
  const renamed = await classes.updateClass(profB.id, pre.id, body({ nombre: 'Preexistente 2', cupoMaximo: 5, fechaHora: at('2030-01-08', '10:15'), horaFin: '11:15' }));
  assert.equal(renamed.nombre, 'Preexistente 2');
  await assert.rejects(() => classes.updateClass(profB.id, pre.id, body({ nombre: 'x', fechaHora: at('2030-01-08', '10:20'), horaFin: '11:15' })), conflict());
});

guard('mismo profesor en dos salones a la vez => 409 PROFESOR_OCUPADO', async () => {
  await reset();
  await classes.createClass(profA.id, body({ nombre: 'Primera' }));
  await assert.rejects(() => classes.createClass(profA.id, body({ nombre: 'Segunda', sala: `${room} B`, fechaHora: at('2030-01-08', '10:30'), horaFin: '11:30' })), conflict('PROFESOR_OCUPADO'));
  await classes.createClass(profA.id, body({ nombre: 'Después', sala: `${room} B`, fechaHora: at('2030-01-08', '11:00'), horaFin: '12:00' }));
});

guard('hora fin: se guarda la duración y se rechaza fin <= inicio, formato inválido o cruzar medianoche; sala obligatoria', async () => {
  await reset();
  const created = await classes.createClass(profA.id, body({ fechaHora: at('2030-01-08', '09:15'), horaFin: '10:45' }));
  assert.equal(created.duracionMinutos, 90);
  assert.equal(created.horaFin, '10:45');
  for (const horaFin of ['09:15', '08:00', '00:30', '25:00', 'abc']) {
    await assert.rejects(() => classes.createClass(profA.id, body({ sala: `${room} C`, fechaHora: at('2030-01-08', '09:15'), horaFin })), { statusCode: 400 });
  }
  await assert.rejects(() => classes.createClass(profA.id, body({ sala: '   ' })), { statusCode: 400 });
  await assert.rejects(() => classes.createClass(profA.id, body({ sala: `${room} D`, fechaHora: at('2030-01-08', '23:30'), horaFin: undefined })), { statusCode: 400 });
});

guard('día de la semana en Buenos Aires cerca de medianoche (martes 23:30 choca con recurrente de martes)', async () => {
  await reset();
  await classes.createClass(profA.id, body({ recurrente: true, diasSemana: [2], fechaHora: at('2030-01-01', '23:00'), horaFin: '23:50' }));
  await assert.rejects(() => classes.createClass(profB.id, body({ fechaHora: at('2030-01-08', '23:30'), horaFin: '23:45' })), conflict());
  await classes.createClass(profB.id, body({ nombre: 'Miércoles', fechaHora: at('2030-01-09', '23:30'), horaFin: '23:45' }));
});

guard('concurrencia: dos altas simultáneas en la misma sala y horario => queda una sola', async () => {
  await reset();
  const results = await Promise.allSettled([
    classes.createClass(profA.id, body({ nombre: 'Carrera 1' })),
    classes.createClass(profB.id, body({ nombre: 'Carrera 2' })),
    classes.createClass(profB.id, body({ nombre: 'Carrera 3' })),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(results.filter((r) => r.status === 'rejected').every((r) => r.reason.statusCode === 409));
  assert.equal(await prisma.clase.count({ where: { sala: room } }), 1);
});

guard('disponibilidad: informa conflicto sin escribir y excluye la clase editada', async () => {
  await reset();
  const a = await classes.createClass(profA.id, body({ nombre: 'Base' }));
  const before = await prisma.clase.count({ where: { sala: room } });
  const busy = await classes.checkAvailability(profB.id, { sala: room, fechaHora: at('2030-01-08', '10:30'), horaFin: '11:30' });
  assert.equal(busy.disponible, false);
  assert.equal(busy.error, 'SALA_OCUPADA');
  assert.match(busy.message, /Base/);
  const free = await classes.checkAvailability(profB.id, { sala: room, fechaHora: at('2030-01-08', '11:00'), horaFin: '12:00' });
  assert.equal(free.disponible, true);
  const own = await classes.checkAvailability(profA.id, { claseId: a.id, sala: room, fechaHora: at('2030-01-08', '10:30'), horaFin: '11:30' });
  assert.equal(own.disponible, true);
  assert.equal(await prisma.clase.count({ where: { sala: room } }), before);
});
