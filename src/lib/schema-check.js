import prisma from './prisma.js';

// Tablas/columnas que el panel del profesor necesita (migración 001_panel_profesor).
// Si la base real no las tiene, el servidor lo dice al arrancar en vez de fallar con un 500 críptico.
const REQUIRED = {
  clase_dia: ['id', 'clase_id', 'dia_semana'],
  notificacion: ['clase_id', 'fecha_ocurrencia', 'clave_dedup'],
  clase: ['duracion_minutos'],
  receta: ['proteinas_g', 'carbohidratos_g', 'grasas_g', 'porciones', 'otro_dato_nutricional'],
  pago: ['monto_neto', 'comision', 'medio_pago', 'ultimos_digitos', 'fecha_acreditacion'],
  cuota: ['mp_preference_id', 'mp_expira_en'],
  mp_evento_pago: ['mp_payment_id', 'cuota_id', 'estado', 'procesado', 'payload_resumen'],
};

export const findMissingSchema = async (db = prisma) => {
  const rows = await db.$queryRaw`
    SELECT table_name AS tabla, column_name AS columna
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name IN ('clase_dia', 'notificacion', 'clase', 'receta', 'pago', 'cuota', 'mp_evento_pago')`;

  const present = new Set(rows.map((row) => `${row.tabla ?? row.TABLE_NAME}.${row.columna ?? row.COLUMN_NAME}`));
  const missing = [];
  for (const [table, columns] of Object.entries(REQUIRED)) {
    for (const column of columns) if (!present.has(`${table}.${column}`)) missing.push(`${table}.${column}`);
  }
  return missing;
};

// Devuelve true si el esquema está completo.
export const verifySchemaOnStartup = async () => {
  try {
    const missing = await findMissingSchema();
    if (missing.length === 0) return true;
    console.error(
      `[schema] Falta migrar la base de datos. Columnas inexistentes: ${missing.join(', ')}.\n` +
        '[schema] Ejecutá: npm run db:migrate:profesor (migraciones 001 a 007)'
    );
  } catch (error) {
    console.error('[schema] No se pudo verificar el esquema de la base:', error);
  }
  return false;
};
