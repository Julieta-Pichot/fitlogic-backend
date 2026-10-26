// ============================================================================
// SEED DE PLANES (membresías base del gimnasio)
// ============================================================================
// Idempotente: crea solo los planes que no existen (compara por nombre) y NUNCA modifica ni
// borra planes ya cargados, así que respeta los precios que edites desde el panel de administración.
// Los precios son valores iniciales de referencia: ajustalos en Administrador > Planes.
//
// Uso:  npm run db:seed:planes
// ============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// [nombre, duración en días, precio en ARS]
const PLANES = [
  ['Plan Mensual', 30, 15000],
  ['Plan Trimestral', 90, 40000],
  ['Plan Semestral', 180, 75000],
  ['Plan Anual', 365, 140000],
];

async function main() {
  let created = 0;
  for (const [nombre, duracionDias, precio] of PLANES) {
    const existing = await prisma.plan.findFirst({ where: { nombre } });
    if (existing) continue;
    await prisma.plan.create({ data: { nombre, duracionDias, precio, activo: true } });
    created += 1;
  }
  console.log(`Planes: ${created} creados, ${PLANES.length - created} ya existían.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
