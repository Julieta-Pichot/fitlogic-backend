export const ROLES = {
  ADMIN: 1,
  PROFESOR: 2,
  RECEPCIONISTA: 3,
  CLIENTE: 4,
};

export const ROLE_NAMES = {
  1: 'admin',
  2: 'profesor',
  3: 'recepcionista',
  4: 'cliente',
};

export const ESTADOS_CLIENTE = {
  HABILITADO: 1,
  INHABILITADO_PAGO: 2,
  INHABILITADO_BAJA: 3,
};

export const ESTADOS_CUOTA = {
  ACTIVA: 1,
  VENCIDA: 2,
  PENDIENTE: 3,
};

export const METODOS_PAGO = {
  EFECTIVO: 1,
  TRANSFERENCIA: 2,
  MERCADOPAGO: 3,
  TARJETA: 4,
};

export const ESTADOS_PAGO = {
  COMPLETADO: 1,
  PENDIENTE: 2,
  RECHAZADO: 3,
};

export const TIPOS_PAGO = {
  CUOTA: 1,
  VENTA: 2,
};

export const ORIGEN_ASISTENCIA = {
  MOLINETE: 1,
  MANUAL: 2,
};

export const INSCRIPCION_ESTADO = {
  INSCRITO: 1,
  CANCELADO: 2,
  LISTA_ESPERA: 3,
};

export const TIPOS_NOTIFICACION = {
  PAGO: 1,
  CLASE: 2,
  APTO: 3,
  CUENTA: 4,
  CALIFICACION: 5,
};

export const CANAL_VENTA = {
  RECEPCION: 1,
  CLIENTE: 2,
};

export const ESTADO_VENTA = {
  PENDIENTE: 1,
  PAGADO: 2,
  CANCELADO: 3,
};

export const TIPO_PROMOCION = {
  TIENDA: 1,
  PLAN: 2,
};

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

export const normalizeRoleName = (roleName) =>
  roleName
    ?.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const roleNameToKey = (roleName) => {
  const normalized = normalizeRoleName(roleName);

  const map = {
    admin: 'admin',
    profesor: 'profesor',
    recepcionista: 'recepcionista',
    cliente: 'cliente',
  };

  return map[normalized] ?? null;
};
