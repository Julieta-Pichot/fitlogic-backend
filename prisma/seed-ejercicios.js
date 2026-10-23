// ============================================================================
// SEED DEL CATÁLOGO DE EJERCICIOS (ejercicios base, creado_por = NULL)
// ============================================================================
// Idempotente: compara por nombre sin distinguir mayúsculas, acentos ni
// espacios extra, así que se puede correr cuantas veces haga falta sin
// duplicar nada (ni pisar ejercicios cargados por profesores).
//
// Uso:  npm run db:seed:ejercicios
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { normalizeExerciseName } from '../src/utils/text.js';

const prisma = new PrismaClient();

const EJERCICIOS = [
  // Piernas
  ['Sentadilla', 'Piernas', 'Fuerza', 'Sentadilla libre con barra apoyada en la espalda alta.'],
  ['Sentadilla frontal', 'Piernas', 'Fuerza', 'Sentadilla con la barra apoyada al frente de los hombros.'],
  ['Prensa de piernas', 'Piernas', 'Fuerza', 'Empuje de plataforma en máquina inclinada.'],
  ['Zancadas', 'Piernas', 'Fuerza', 'Paso largo alternando piernas, con o sin mancuernas.'],
  ['Sentadilla búlgara', 'Piernas', 'Fuerza', 'Sentadilla unilateral con el pie trasero elevado.'],
  ['Extensión de cuádriceps', 'Piernas', 'Fuerza', 'Extensión de rodillas en máquina.'],
  ['Curl femoral', 'Piernas', 'Fuerza', 'Flexión de rodillas en máquina para isquiotibiales.'],
  ['Peso muerto rumano', 'Piernas', 'Fuerza', 'Bisagra de cadera con barra, piernas casi extendidas.'],
  ['Elevación de talones', 'Piernas', 'Fuerza', 'Trabajo de gemelos de pie o sentado.'],
  // Glúteos
  ['Hip thrust', 'Glúteos', 'Fuerza', 'Empuje de cadera con la espalda apoyada en un banco.'],
  ['Puente de glúteos', 'Glúteos', 'Fuerza', 'Elevación de cadera acostado boca arriba.'],
  ['Patada de glúteo en polea', 'Glúteos', 'Fuerza', 'Extensión de cadera con polea baja y tobillera.'],
  // Pecho
  ['Press de banca', 'Pecho', 'Fuerza', 'Press horizontal con barra en banco plano.'],
  ['Press inclinado con mancuernas', 'Pecho', 'Fuerza', 'Press en banco inclinado con mancuernas.'],
  ['Aperturas con mancuernas', 'Pecho', 'Fuerza', 'Aperturas en banco plano para aislar el pecho.'],
  ['Cruces en polea', 'Pecho', 'Fuerza', 'Cruce de poleas altas para el pecho.'],
  ['Flexiones de brazos', 'Pecho', 'Funcional', 'Flexiones con el peso corporal.'],
  ['Fondos en paralelas', 'Pecho', 'Fuerza', 'Fondos con el torso inclinado al frente.'],
  // Espalda
  ['Peso muerto', 'Espalda', 'Fuerza', 'Levantamiento de barra desde el piso.'],
  ['Dominadas', 'Espalda', 'Fuerza', 'Tracción vertical con el peso corporal.'],
  ['Jalón al pecho', 'Espalda', 'Fuerza', 'Tracción vertical en polea alta.'],
  ['Remo con barra', 'Espalda', 'Fuerza', 'Remo inclinado con barra.'],
  ['Remo con mancuerna', 'Espalda', 'Fuerza', 'Remo unilateral apoyado en un banco.'],
  ['Remo en polea baja', 'Espalda', 'Fuerza', 'Remo sentado en polea baja.'],
  ['Hiperextensiones', 'Espalda', 'Fuerza', 'Extensión de tronco en banco romano.'],
  // Hombros
  ['Press militar', 'Hombros', 'Fuerza', 'Press vertical con barra o mancuernas.'],
  ['Elevaciones laterales', 'Hombros', 'Fuerza', 'Elevación lateral con mancuernas.'],
  ['Elevaciones frontales', 'Hombros', 'Fuerza', 'Elevación frontal con mancuernas o disco.'],
  ['Pájaros con mancuernas', 'Hombros', 'Fuerza', 'Elevación posterior para el deltoides trasero.'],
  ['Face pull', 'Hombros', 'Fuerza', 'Tracción de cuerda en polea alta hacia la cara.'],
  // Brazos
  ['Curl de bíceps con barra', 'Brazos', 'Fuerza', 'Flexión de codos con barra recta o Z.'],
  ['Curl martillo', 'Brazos', 'Fuerza', 'Flexión de codos con agarre neutro.'],
  ['Curl de bíceps con mancuernas', 'Brazos', 'Fuerza', 'Flexión alternada de codos con mancuernas.'],
  ['Extensión de tríceps en polea', 'Brazos', 'Fuerza', 'Extensión de codos con cuerda o barra en polea alta.'],
  ['Press francés', 'Brazos', 'Fuerza', 'Extensión de tríceps acostado con barra Z.'],
  ['Fondos en banco', 'Brazos', 'Funcional', 'Fondos de tríceps apoyado en un banco.'],
  // Abdomen / core
  ['Plancha', 'Abdomen', 'Funcional', 'Isométrico apoyado en antebrazos y puntas de pie.'],
  ['Abdominales', 'Abdomen', 'Funcional', 'Flexión de tronco acostado boca arriba.'],
  ['Elevación de piernas', 'Abdomen', 'Funcional', 'Elevación de piernas colgado o acostado.'],
  ['Bicicleta abdominal', 'Abdomen', 'Funcional', 'Rotación alternada de codo a rodilla opuesta.'],
  ['Plancha lateral', 'Abdomen', 'Funcional', 'Isométrico lateral apoyado en un antebrazo.'],
  ['Russian twist', 'Abdomen', 'Funcional', 'Rotación de tronco sentado con o sin peso.'],
  // Cardio / funcional
  ['Burpees', 'Cuerpo completo', 'Cardio', 'Ejercicio combinado de sentadilla, plancha y salto.'],
  ['Cinta (trote)', 'Cuerpo completo', 'Cardio', 'Trote o caminata en cinta de correr.'],
  ['Bicicleta fija', 'Piernas', 'Cardio', 'Pedaleo en bicicleta ergométrica.'],
  ['Remo ergómetro', 'Cuerpo completo', 'Cardio', 'Remo en máquina de remo.'],
  ['Elíptico', 'Cuerpo completo', 'Cardio', 'Trabajo cardiovascular en elíptico.'],
  ['Soga (saltos)', 'Cuerpo completo', 'Cardio', 'Saltos con soga.'],
  ['Mountain climbers', 'Cuerpo completo', 'Cardio', 'Rodillas al pecho alternadas en posición de plancha.'],
  ['Kettlebell swing', 'Cuerpo completo', 'Funcional', 'Balanceo de kettlebell con extensión de cadera.'],
  // Movilidad / flexibilidad
  ['Estiramiento de isquiotibiales', 'Piernas', 'Flexibilidad', 'Estiramiento de la cara posterior del muslo.'],
  ['Estiramiento de cuádriceps', 'Piernas', 'Flexibilidad', 'Estiramiento de pie llevando el talón al glúteo.'],
  ['Movilidad de cadera', 'Cuerpo completo', 'Movilidad', 'Círculos y aperturas de cadera.'],
];

async function main() {
  const existentes = await prisma.ejercicio.findMany({ select: { nombre: true } });
  const nombres = new Set(existentes.map((item) => normalizeExerciseName(item.nombre)));

  const nuevos = EJERCICIOS.filter(([nombre]) => !nombres.has(normalizeExerciseName(nombre))).map(
    ([nombre, grupoMuscular, tipo, descripcion]) => ({
      nombre,
      grupoMuscular,
      tipo,
      descripcion,
      creadoPor: null,
      activo: true,
    })
  );

  if (nuevos.length) await prisma.ejercicio.createMany({ data: nuevos });

  console.log(
    `Ejercicios base: ${nuevos.length} creados, ${EJERCICIOS.length - nuevos.length} ya existían.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
