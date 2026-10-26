import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../../src/lib/prisma.js';

export const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3001/api';
export const PWD = 'Audit1234';
const PREFIX = 'tmp-audit-';

export const cleanup = async () => {
  const users = await prisma.usuario.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  const clients = await prisma.cliente.findMany({ where: { usuarioId: { in: uids } }, select: { id: true } });
  const cids = clients.map((c) => c.id);
  const profs = await prisma.profesor.findMany({ where: { usuarioId: { in: uids } }, select: { id: true } });
  const pids = profs.map((p) => p.id);
  const quotas = await prisma.cuota.findMany({ where: { clienteId: { in: cids } }, select: { id: true } });
  const qids = quotas.map((q) => q.id);
  const classes = await prisma.clase.findMany({ where: { profesorId: { in: pids } }, select: { id: true } });
  const clids = classes.map((c) => c.id);
  const routines = await prisma.rutina.findMany({ where: { OR: [{ clienteId: { in: cids } }, { profesorId: { in: pids } }] }, select: { id: true } });
  const rids = routines.map((r) => r.id);
  const recipes = await prisma.receta.findMany({ where: { profesorId: { in: pids } }, select: { id: true } });
  const reids = recipes.map((r) => r.id);
  await prisma.notificacion.deleteMany({ where: { OR: [{ usuarioId: { in: uids } }, { claseId: { in: clids } }] } });
  await prisma.puntuacionClase.deleteMany({ where: { OR: [{ claseId: { in: clids } }, { clienteId: { in: cids } }] } });
  await prisma.inscripcionClase.deleteMany({ where: { OR: [{ claseId: { in: clids } }, { clienteId: { in: cids } }] } });
  await prisma.claseDia.deleteMany({ where: { claseId: { in: clids } } });
  await prisma.clase.deleteMany({ where: { id: { in: clids } } });
  await prisma.asistencia.deleteMany({ where: { clienteId: { in: cids } } });
  await prisma.mpEventoPago.deleteMany({ where: { cuotaId: { in: qids } } });
  await prisma.pago.deleteMany({ where: { cuotaId: { in: qids } } });
  await prisma.cuota.deleteMany({ where: { id: { in: qids } } });
  await prisma.rutinaEjercicio.deleteMany({ where: { rutinaId: { in: rids } } });
  await prisma.rutinaDia.deleteMany({ where: { rutinaId: { in: rids } } });
  await prisma.rutina.deleteMany({ where: { id: { in: rids } } });
  await prisma.ingredienteReceta.deleteMany({ where: { recetaId: { in: reids } } });
  await prisma.pasoReceta.deleteMany({ where: { recetaId: { in: reids } } });
  await prisma.receta.deleteMany({ where: { id: { in: reids } } });
  await prisma.ejercicio.deleteMany({ where: { OR: [{ creadoPor: { in: pids } }, { nombre: { startsWith: 'AUDIT ' } }] } });
  await prisma.promocion.deleteMany({ where: { plan: { nombre: { startsWith: 'AUDIT ' } } } });
  await prisma.plan.deleteMany({ where: { nombre: { startsWith: 'AUDIT ' } } });
  await prisma.cliente.deleteMany({ where: { id: { in: cids } } });
  await prisma.profesor.deleteMany({ where: { id: { in: pids } } });
  await prisma.recepcionista.deleteMany({ where: { usuarioId: { in: uids } } });
  await prisma.usuario.deleteMany({ where: { id: { in: uids } } });
  return uids.length;
};

// Crea un usuario temporal por rol/estado. Devuelve ids para armar datos.
export const setup = async () => {
  await cleanup();
  const hash = await bcrypt.hash(PWD, 6);
  const roles = Object.fromEntries((await prisma.rol.findMany()).map((r) => [r.nombre, r.id]));
  const cEstado = Object.fromEntries((await prisma.estadoCliente.findMany()).map((r) => [r.nombre, r.id]));
  const sEstado = Object.fromEntries((await prisma.estadoCuentaStaff.findMany()).map((r) => [r.nombre, r.id]));
  const mk = (key, rol, extra = {}) => prisma.usuario.create({ data: { rolId: roles[rol], nombre: `Audit${key}`, apellido: 'Temp', email: `${PREFIX}${key}@test.local`, passwordHash: hash, activo: true, ...extra } });
  const U = {};
  U.adm = await mk('adm', 'ADMIN');
  for (const k of ['pa', 'pb', 'pdis']) {
    U[k] = await mk(k, 'PROFESOR');
    U[k].prof = await prisma.profesor.create({ data: { usuarioId: U[k].id, estadoCuentaStaffId: sEstado[k === 'pdis' ? 'INHABILITADO' : 'HABILITADO'] } });
  }
  for (const k of ['rec', 'rdis']) {
    U[k] = await mk(k, 'RECEPCIONISTA');
    await prisma.recepcionista.create({ data: { usuarioId: U[k].id, estadoCuentaStaffId: sEstado[k === 'rdis' ? 'INHABILITADO' : 'HABILITADO'] } });
  }
  const clientDefs = { ca: 'HABILITADO', cb: 'HABILITADO', cbaja: 'INHABILITADO_BAJA', cpago: 'INHABILITADO_PAGO', cinact: 'HABILITADO' };
  for (const [k, estado] of Object.entries(clientDefs)) {
    U[k] = await mk(k, 'CLIENTE', k === 'cinact' ? { activo: false } : {});
    U[k].cli = await prisma.cliente.create({ data: { usuarioId: U[k].id, estadoClienteId: cEstado[estado], objetivoDiasRacha: 3 } });
  }
  return U;
};

const jar = {};
export const api = async (path, { method = 'GET', body, token, form, raw = false, headers = {} } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  if (raw) return { status: res.status, text, headers: res.headers };
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text, headers: res.headers };
};
export const login = async (email, password = PWD) => {
  const r = await api('/auth/login', { method: 'POST', body: { email, password } });
  return { ...r, token: r.json?.data?.token };
};
export { prisma, jar };
