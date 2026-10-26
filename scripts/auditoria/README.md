# Scripts de auditoría

Pruebas de punta a punta contra el **backend en marcha** (`http://localhost:3001`, o `AUDIT_BASE=http://localhost:3931/api`).
Crean usuarios temporales con el prefijo `tmp-audit-` (contraseña de prueba) y los borran al terminar (`lib.mjs` → `cleanup`).
Ejecutalos desde la carpeta `backend/`: `node scripts/auditoria/<archivo>.mjs`.

| Script | Qué verifica |
| ------ | ------------ |
| `matriz-roles.mjs` | Matriz endpoint × rol (401/403/permitido), fuga de `password_hash`, cuentas inhabilitadas, límite de intentos de login |
| `idor-jwt-archivos.mjs` | IDOR entre clientes y entre profesores, JWT inválidos, inyección, subida de archivos, CORS y cabeceras |
| `recepcion-dashboard-pagos.mjs` | Cards del admin y de recepción contra SQL (frontera de mes/día en Buenos Aires), alta de cliente, cobro en caja |
| `asistencia-profesor-scheduler.mjs` | Asistencia, ejercicios, rutinas, clases (salones, cupos, borrado) y aviso del scheduler (tarda ~3 min) |
| `admin-soporte-planes-usuarios.mjs` | Soporte (tabla `gimnasio`, se restaura), planes, usuarios, contraseñas y recetas con archivos |
| `mercadopago-recepcion-config.mjs` | Checkout real contra MP (credenciales del vendedor de prueba) y configuración de recepción |
| `esquema-y-migraciones.mjs` | Crea bases temporales, compara el esquema real contra `fitLogic real.sql` y contra `prisma migrate deploy`, prueba idempotencia |
| `seeds.mjs` | Corre los 3 seeds dos veces sobre una base temporal y verifica que no duplican ni pisan contraseñas |
| `integridad-bd.mjs` | Consultas de solo lectura de filas huérfanas o inconsistentes |
| `secretos.mjs` | Busca credenciales en archivos y en el historial de git (enmascaradas) |

**Cuidado:** nunca apuntes `DATABASE_URL` de producción a estos scripts. `DELETE /plans/:id` es una baja lógica (`activo = 0`):
los scripts solo la usan con planes temporales.
