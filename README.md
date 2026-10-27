# FitLogic — Backend

API REST del sistema de gestión de gimnasios FitLogic. Este repositorio es la
mitad "servidor" del proyecto: expone la lógica de negocio y el acceso a la
base de datos. La interfaz de usuario vive en un repositorio aparte,
[fitlogic-frontend](https://github.com/Julieta-Pichot/fitlogic-frontend).

## Descripción

FitLogic centraliza en una sola plataforma la gestión operativa de un
gimnasio: clientes, cuotas y pagos, asistencia, rutinas personalizadas,
clases y recetas saludables. El sistema contempla cuatro roles con
funcionalidades y permisos distintos:

- **Cliente**: consulta sus rutinas, se inscribe a clases, ve su historial de
  asistencia, el estado de su cuota y recetas saludables.
- **Profesor**: gestiona rutinas, clases y recetas.
- **Recepcionista**: da de alta clientes, registra pagos y asistencias, y
  administra el apto físico.
- **Administrador**: gestión global de usuarios, planes, promociones y
  configuración del gimnasio. Existe una única cuenta de administrador; el
  sistema no permite crear otras desde ninguna interfaz.

No hay registro público: las cuentas las crea siempre un rol autorizado
(el administrador crea profesores y recepcionistas; el recepcionista da de
alta a los clientes).

Este backend expone esa lógica como una API REST, separada del frontend, que
consume desde una base de datos MySQL/MariaDB a través de Prisma.

## Tecnologías utilizadas

- **Node.js** con **Express 5** — servidor y enrutamiento de la API.
- **Prisma** (`@prisma/client` + CLI de `prisma`) — ORM contra la base de
  datos.
- **MySQL / MariaDB** — motor de base de datos.
- **jsonwebtoken** — autenticación basada en JWT.
- **bcryptjs** — hash de contraseñas.
- **express-validator** — validación de datos de entrada.
- **multer** — carga de archivos (apto físico).
- **cors**, **dotenv** — configuración de CORS y variables de entorno.
- **nodemon** (dev) — recarga automática en desarrollo.
- Test runner nativo de Node (`node --test`).

## Requisitos

- **Node.js** (desarrollado y probado con la v24.16.0).
- **npm** (incluido con Node.js).
- Un servidor **MySQL o MariaDB** accesible, con una base de datos creada
  para el proyecto.

## Instalación

```bash
git clone https://github.com/Julieta-Pichot/fitlogic-backend.git
cd fitlogic-backend
npm install
```

## Configuración

1. Copiá `.env.example` a `.env`:

   ```bash
   cp .env.example .env
   ```

2. Completá las variables en `.env`:

   | Variable          | Descripción                                                        |
   | ----------------- | ------------------------------------------------------------------- |
   | `DATABASE_URL`    | Cadena de conexión a MySQL/MariaDB, formato `mysql://usuario:password@host:puerto/base`. |
   | `JWT_SECRET`      | Clave secreta para firmar los tokens de sesión. Usá una propia, no la de ejemplo. |
   | `JWT_EXPIRES_IN`  | Duración del token de sesión (por ejemplo `24h`).                    |
   | `PORT`            | Puerto donde escucha la API (por defecto `3001` si no se define).    |
   | `NODE_ENV`        | `development` o `production`.                                       |
   | `FRONTEND_URL`    | URL del frontend, se agrega a la whitelist de CORS.                  |

3. Generá el cliente de Prisma y aplicá las migraciones existentes contra tu
   base de datos:

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

4. (Opcional pero recomendado) Cargá datos de prueba — catálogos del sistema
   (roles, estados, métodos de pago, etc.), el registro único del gimnasio y
   cuatro usuarios de prueba (uno por rol):

   ```bash
   npm run db:seed
   ```

   Credenciales de los usuarios de prueba que crea el seed (misma contraseña
   para los cuatro: `123456`):

   | Rol           | Email                       |
   | ------------- | ---------------------------- |
   | Administrador | `admin@fitlogic.com`         |
   | Profesor      | `profesor@fitlogic.com`      |
   | Recepcionista | `recepcion@fitlogic.com`     |
   | Cliente       | `cliente@fitlogic.com`       |

## Cómo ejecutarlo

Levantar la API en modo desarrollo (con recarga automática vía nodemon):

```bash
npm run dev
```

Levantarla en modo producción:

```bash
npm start
```

Por defecto queda escuchando en `http://localhost:3001` (o el puerto que
hayas definido en `PORT`). Podés verificar que está arriba con:

```
GET http://localhost:3001/api/health
```

### Otros scripts disponibles

| Script             | Descripción                                              |
| ------------------ | --------------------------------------------------------- |
| `npm run db:generate` | Regenera el cliente de Prisma a partir del schema.      |
| `npm run db:migrate`  | Aplica las migraciones de Prisma (desarrollo).          |
| `npm run db:push`     | Sincroniza el schema con la base sin crear una migración. |
| `npm run db:studio`   | Abre Prisma Studio para explorar/editar datos.          |
| `npm run db:seed`     | Carga catálogos, el gimnasio y usuarios de prueba.      |
| `npm run db:seed:ejercicios` | Carga el catálogo base de ejercicios (idempotente). |
| `npm run db:migrate:profesor` | Aplica `db/migrations/001` y `002` (panel del profesor y duración de clases; idempotentes). |
| `npm test`            | Corre los tests (`node --test`).                        |

## Panel del profesor

- Migraciones `001_panel_profesor` y `002_duracion_clase` (columna `clase.duracion_minutos`). La 001: tabla `clase_dia` y columnas `clase_id` / `fecha_ocurrencia`
  (con UNIQUE) en `notificacion`. Está en `db/migrations/001_panel_profesor.sql` (para correr a
  mano, p. ej. en HeidiSQL) y en `prisma/migrations/1_panel_profesor` (para `prisma migrate deploy`).
  Ambas son idempotentes.
- Los avisos `CLASE_PROXIMA` (15 minutos antes de cada clase) los genera un scheduler interno
  (`src/services/notification-scheduler.js`, corre cada minuto, zona horaria
  `America/Argentina/Buenos_Aires`). Se desactiva con `DISABLE_SCHEDULER=true`.
- Las fotos de recetas se guardan en `uploads/recetas/` y se sirven en `/uploads/recetas/<archivo>`.
- Endpoints del profesor: `/api/profesor/*` y catálogo `/api/ejercicios` (rol PROFESOR + cuenta HABILITADA).

## Estructura del proyecto

```
src/
  controllers/   # Manejan la petición HTTP y llaman al service correspondiente
  services/      # Lógica de negocio y acceso a datos vía Prisma
  routes/        # Definición de endpoints por módulo
  validators/    # Reglas de validación de express-validator
  middlewares/   # Autenticación, manejo de errores, uploads, validación
  utils/         # Helpers (fechas, paginación, respuestas HTTP, etc.)
prisma/
  schema.prisma  # Modelo de datos
  migrations/    # Historial de migraciones
  seed.js        # Script de datos de prueba
uploads/         # Archivos subidos en runtime (aptos físicos). No se versiona.
```

## Deploy (Render + Aiven MySQL)

1. **Build command:** `npm ci` (el `postinstall` ejecuta `prisma generate`). **Start command:** `npm start`.
   Health check: `/api/health`.
2. **Variables de entorno** (ver `.env.example`): `DATABASE_URL` (con `sslaccept=strict`, `sslcert=/etc/secrets/ca.pem`
   y `connection_limit=5`), `JWT_SECRET`, `FRONTEND_URL` (lista separada por coma), `NODE_ENV=production` y las de
   Mercado Pago. En producción el servidor no arranca sin `JWT_SECRET` ni `DATABASE_URL`.
3. **Esquema:** `npx prisma migrate deploy` (contra la base de Aiven).
4. **Primer administrador:** `ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run create-admin` (10+ caracteres). `npm run db:seed`
   crea usuarios de prueba con contraseña conocida y se niega a correr con `NODE_ENV=production`.

### Limitaciones conocidas del plan gratuito de Render

- **Archivos subidos:** los aptos físicos y las fotos de recetas se guardan en el disco del servidor (`uploads/`). El disco
  del plan gratuito es efímero: **esos archivos se pierden en cada deploy o reinicio**. Solucionarlo requiere almacenamiento
  externo (S3, Cloudinary, etc.); por ahora no está implementado.
- **Servicio dormido:** tras 15 minutos sin tráfico el servicio se duerme. Mientras duerme no corre el scheduler (avisos de
  clase y de vencimiento, sondeo de pagos de Mercado Pago); los pagos se acreditan igual por webhook o con "Ya pagué,
  verificar". Los contadores del límite de intentos de login (en memoria) se reinician.

---

Proyecto desarrollado como Práctica Profesionalizante (Programación sobre
redes, Desarrollo de sistemas, Administración de Sistemas y de Redes) —
Curso 6°1, 2026. Integrantes: Julieta Pichot y Jessica Diaz.
