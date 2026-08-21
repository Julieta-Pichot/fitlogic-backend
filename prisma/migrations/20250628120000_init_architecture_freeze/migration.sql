-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL,
    `nombre` VARCHAR(50) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `estados_cliente` (
    `id` INTEGER NOT NULL,
    `nombre` VARCHAR(50) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `estados_cuota` (
    `id` INTEGER NOT NULL,
    `nombre` VARCHAR(50) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gimnasios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(50) NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `direccion` VARCHAR(200) NULL,
    `telefono` VARCHAR(50) NULL,
    `email` VARCHAR(100) NULL,
    `telefono_soporte` VARCHAR(50) NULL,
    `email_soporte` VARCHAR(100) NULL,
    `horario_atencion` VARCHAR(200) NULL,
    `activo` TINYINT NOT NULL DEFAULT 1,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `gimnasios_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracion_gimnasio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `gimnasio_id` INTEGER NOT NULL,
    `modo_sala_unica` TINYINT NOT NULL DEFAULT 0,
    `notif_nuevo_cliente` TINYINT NOT NULL DEFAULT 1,
    `notif_nuevo_pago` TINYINT NOT NULL DEFAULT 1,
    `notif_clase_proxima` TINYINT NOT NULL DEFAULT 1,
    `notif_apto_vencido` TINYINT NOT NULL DEFAULT 1,
    `codigo_soporte` VARCHAR(50) NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `configuracion_gimnasio_gimnasio_id_key`(`gimnasio_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `gimnasio_id` INTEGER NOT NULL,
    `rol_id` INTEGER NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `apellido` VARCHAR(100) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `telefono` VARCHAR(50) NULL,
    `activo` TINYINT NOT NULL DEFAULT 1,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_eliminacion` DATETIME(3) NULL,

    INDEX `usuarios_gimnasio_id_idx`(`gimnasio_id`),
    UNIQUE INDEX `usuarios_gimnasio_id_email_key`(`gimnasio_id`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `especialidades` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `gimnasio_id` INTEGER NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `activo` TINYINT NOT NULL DEFAULT 1,

    INDEX `especialidades_gimnasio_id_idx`(`gimnasio_id`),
    UNIQUE INDEX `especialidades_gimnasio_id_nombre_key`(`gimnasio_id`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `profesor_especialidades` (
    `profesor_id` INTEGER NOT NULL,
    `especialidad_id` INTEGER NOT NULL,

    PRIMARY KEY (`profesor_id`, `especialidad_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `estado_cliente_id` INTEGER NOT NULL,
    `objetivo_dias_semana` INTEGER NOT NULL DEFAULT 3,
    `objetivo_entrenamiento` VARCHAR(200) NULL,
    `observaciones_medicas` TEXT NULL,
    `racha_actual` INTEGER NOT NULL DEFAULT 0,
    `fecha_alta` DATE NULL,
    `fecha_baja` DATE NULL,

    UNIQUE INDEX `clientes_usuario_id_key`(`usuario_id`),
    INDEX `clientes_estado_cliente_id_idx`(`estado_cliente_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `profesores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `especialidad` VARCHAR(100) NULL,

    UNIQUE INDEX `profesores_usuario_id_key`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recepcionistas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,

    UNIQUE INDEX `recepcionistas_usuario_id_key`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `planes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `gimnasio_id` INTEGER NOT NULL,
    `nombre` VARCHAR(100) NULL,
    `duracion_dias` INTEGER NULL,
    `precio` DECIMAL(10, 2) NULL,
    `activo` TINYINT NOT NULL DEFAULT 1,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_eliminacion` DATETIME(3) NULL,
    `creado_por_id` INTEGER NULL,
    `actualizado_por_id` INTEGER NULL,

    INDEX `planes_gimnasio_id_idx`(`gimnasio_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cuotas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cliente_id` INTEGER NOT NULL,
    `plan_id` INTEGER NOT NULL,
    `estado_cuota_id` INTEGER NOT NULL,
    `fecha_inicio` DATE NULL,
    `fecha_vencimiento` DATE NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por_id` INTEGER NULL,
    `actualizado_por_id` INTEGER NULL,

    INDEX `cuotas_cliente_id_idx`(`cliente_id`),
    INDEX `cuotas_estado_cuota_id_idx`(`estado_cuota_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pagos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cliente_id` INTEGER NOT NULL,
    `cuota_id` INTEGER NULL,
    `venta_id` INTEGER NULL,
    `tipo_pago` INTEGER NOT NULL DEFAULT 1,
    `monto` DECIMAL(10, 2) NULL,
    `fecha_pago` DATETIME(3) NULL,
    `metodo_pago` INTEGER NULL,
    `estado_pago` INTEGER NULL,
    `referencia_externa` VARCHAR(200) NULL,
    `registrado_por_id` INTEGER NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pagos_cliente_id_idx`(`cliente_id`),
    INDEX `pagos_cuota_id_idx`(`cuota_id`),
    INDEX `pagos_venta_id_idx`(`venta_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `archivos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `gimnasio_id` INTEGER NOT NULL,
    `nombre_original` VARCHAR(255) NOT NULL,
    `ruta` VARCHAR(500) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `tamano_bytes` INTEGER NOT NULL,
    `subido_por_id` INTEGER NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `archivos_gimnasio_id_idx`(`gimnasio_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `aptos_fisicos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cliente_id` INTEGER NOT NULL,
    `archivo_id` INTEGER NULL,
    `archivo` VARCHAR(255) NULL,
    `fecha_carga` DATE NULL,
    `fecha_vencimiento` DATE NULL,
    `estado` INTEGER NOT NULL DEFAULT 1,
    `subido_por_id` INTEGER NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `aptos_fisicos_cliente_id_idx`(`cliente_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asistencias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `gimnasio_id` INTEGER NOT NULL,
    `cliente_id` INTEGER NOT NULL,
    `fecha_hora` DATETIME(3) NULL,
    `origen` INTEGER NOT NULL DEFAULT 2,

    INDEX `asistencias_gimnasio_id_idx`(`gimnasio_id`),
    INDEX `asistencias_cliente_id_idx`(`cliente_id`),
    INDEX `asistencias_fecha_hora_idx`(`fecha_hora`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ejercicios_catalogo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `gimnasio_id` INTEGER NOT NULL,
    `nombre` VARCHAR(150) NOT NULL,
    `categoria` VARCHAR(100) NULL,
    `activo` TINYINT NOT NULL DEFAULT 1,
    `creado_por_id` INTEGER NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ejercicios_catalogo_gimnasio_id_idx`(`gimnasio_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rutinas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `gimnasio_id` INTEGER NOT NULL,
    `cliente_id` INTEGER NULL,
    `profesor_id` INTEGER NULL,
    `nombre` VARCHAR(150) NULL,
    `descripcion` TEXT NULL,
    `categoria` VARCHAR(50) NULL,
    `grupos_musculares` TEXT NULL,
    `activa` TINYINT NOT NULL DEFAULT 1,
    `fecha_asignacion` DATE NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por_id` INTEGER NULL,
    `actualizado_por_id` INTEGER NULL,

    INDEX `rutinas_gimnasio_id_idx`(`gimnasio_id`),
    INDEX `rutinas_cliente_id_idx`(`cliente_id`),
    INDEX `rutinas_profesor_id_idx`(`profesor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ejercicios_rutina` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rutina_id` INTEGER NOT NULL,
    `ejercicio_catalogo_id` INTEGER NULL,
    `nombre` VARCHAR(150) NULL,
    `series` INTEGER NULL,
    `repeticiones` INTEGER NULL,
    `peso` DECIMAL(8, 2) NULL,
    `descanso_segundos` INTEGER NULL,
    `dia_semana` INTEGER NULL,
    `descripcion` TEXT NULL,
    `orden_visual` INTEGER NULL,

    INDEX `ejercicios_rutina_rutina_id_idx`(`rutina_id`),
    INDEX `ejercicios_rutina_ejercicio_catalogo_id_idx`(`ejercicio_catalogo_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rutina_dias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rutina_id` INTEGER NULL,
    `dia_semana` INTEGER NULL,

    INDEX `rutina_dias_rutina_id_idx`(`rutina_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recetas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `gimnasio_id` INTEGER NOT NULL,
    `profesor_id` INTEGER NULL,
    `categoria` INTEGER NULL,
    `nombre` VARCHAR(150) NULL,
    `descripcion` TEXT NULL,
    `calorias` INTEGER NULL,
    `proteinas` INTEGER NULL,
    `carbohidratos` INTEGER NULL,
    `grasas` INTEGER NULL,
    `tiempo_preparacion` INTEGER NULL,
    `foto` VARCHAR(255) NULL,
    `foto_id` INTEGER NULL,
    `activo` TINYINT NOT NULL DEFAULT 1,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por_id` INTEGER NULL,
    `actualizado_por_id` INTEGER NULL,

    INDEX `recetas_gimnasio_id_idx`(`gimnasio_id`),
    INDEX `recetas_profesor_id_idx`(`profesor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `receta_ingredientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `receta_id` INTEGER NOT NULL,
    `orden` INTEGER NOT NULL,
    `descripcion` VARCHAR(500) NOT NULL,

    INDEX `receta_ingredientes_receta_id_idx`(`receta_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `receta_pasos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `receta_id` INTEGER NOT NULL,
    `orden` INTEGER NOT NULL,
    `descripcion` TEXT NOT NULL,

    INDEX `receta_pasos_receta_id_idx`(`receta_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `gimnasio_id` INTEGER NOT NULL,
    `profesor_id` INTEGER NULL,
    `nombre` VARCHAR(100) NULL,
    `sala` VARCHAR(100) NULL,
    `cupo_maximo` INTEGER NULL,
    `recurrente` TINYINT NULL,
    `dia_semana` INTEGER NULL,
    `hora_inicio` VARCHAR(8) NULL,
    `hora_fin` VARCHAR(8) NULL,
    `activa` TINYINT NOT NULL DEFAULT 1,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por_id` INTEGER NULL,
    `actualizado_por_id` INTEGER NULL,

    INDEX `clases_gimnasio_id_idx`(`gimnasio_id`),
    INDEX `clases_profesor_id_idx`(`profesor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inscripciones_clase` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clase_id` INTEGER NOT NULL,
    `cliente_id` INTEGER NOT NULL,
    `estado` INTEGER NOT NULL DEFAULT 1,
    `fecha_inscripcion` DATETIME(3) NULL,

    INDEX `inscripciones_clase_clase_id_idx`(`clase_id`),
    INDEX `inscripciones_clase_cliente_id_idx`(`cliente_id`),
    UNIQUE INDEX `inscripciones_clase_clase_id_cliente_id_key`(`clase_id`, `cliente_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `puntuaciones_clase` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clase_id` INTEGER NOT NULL,
    `cliente_id` INTEGER NOT NULL,
    `fecha_sesion` DATE NOT NULL,
    `puntuacion` INTEGER NULL,
    `comentario` VARCHAR(500) NULL,

    UNIQUE INDEX `puntuaciones_clase_clase_id_cliente_id_fecha_sesion_key`(`clase_id`, `cliente_id`, `fecha_sesion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `productos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `gimnasio_id` INTEGER NOT NULL,
    `categoria` INTEGER NULL,
    `nombre` VARCHAR(150) NULL,
    `descripcion` TEXT NULL,
    `precio` DECIMAL(10, 2) NULL,
    `precio_original` DECIMAL(10, 2) NULL,
    `en_oferta` TINYINT NOT NULL DEFAULT 0,
    `stock` INTEGER NULL,
    `foto` VARCHAR(255) NULL,
    `foto_id` INTEGER NULL,
    `activo` TINYINT NOT NULL DEFAULT 1,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_eliminacion` DATETIME(3) NULL,
    `creado_por_id` INTEGER NULL,
    `actualizado_por_id` INTEGER NULL,

    INDEX `productos_gimnasio_id_idx`(`gimnasio_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promociones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `gimnasio_id` INTEGER NOT NULL,
    `nombre` VARCHAR(150) NOT NULL,
    `descripcion` TEXT NULL,
    `descuento_porcentaje` DECIMAL(5, 2) NOT NULL,
    `tipo` INTEGER NOT NULL,
    `fecha_inicio` DATE NOT NULL,
    `fecha_fin` DATE NOT NULL,
    `activo` TINYINT NOT NULL DEFAULT 1,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por_id` INTEGER NULL,
    `actualizado_por_id` INTEGER NULL,

    INDEX `promociones_gimnasio_id_idx`(`gimnasio_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promocion_productos` (
    `promocion_id` INTEGER NOT NULL,
    `producto_id` INTEGER NOT NULL,

    PRIMARY KEY (`promocion_id`, `producto_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promocion_planes` (
    `promocion_id` INTEGER NOT NULL,
    `plan_id` INTEGER NOT NULL,

    PRIMARY KEY (`promocion_id`, `plan_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ventas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `gimnasio_id` INTEGER NOT NULL,
    `codigo` VARCHAR(50) NOT NULL,
    `canal` INTEGER NOT NULL,
    `cliente_id` INTEGER NULL,
    `estado` INTEGER NOT NULL DEFAULT 1,
    `monto_total` DECIMAL(10, 2) NOT NULL,
    `metodo_pago` INTEGER NULL,
    `referencia_externa` VARCHAR(200) NULL,
    `registrado_por_id` INTEGER NULL,
    `pagado_en` DATETIME(3) NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ventas_gimnasio_id_idx`(`gimnasio_id`),
    INDEX `ventas_cliente_id_idx`(`cliente_id`),
    UNIQUE INDEX `ventas_gimnasio_id_codigo_key`(`gimnasio_id`, `codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `venta_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `venta_id` INTEGER NOT NULL,
    `producto_id` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `precio_unitario` DECIMAL(10, 2) NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,

    INDEX `venta_items_venta_id_idx`(`venta_id`),
    INDEX `venta_items_producto_id_idx`(`producto_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notificaciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `tipo` INTEGER NULL,
    `titulo` VARCHAR(150) NULL,
    `mensaje` TEXT NULL,
    `metadata` TEXT NULL,
    `leida` TINYINT NOT NULL DEFAULT 0,
    `fecha_envio` DATETIME(3) NULL,

    INDEX `notificaciones_usuario_id_idx`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `configuracion_gimnasio` ADD CONSTRAINT `configuracion_gimnasio_gimnasio_id_fkey` FOREIGN KEY (`gimnasio_id`) REFERENCES `gimnasios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_gimnasio_id_fkey` FOREIGN KEY (`gimnasio_id`) REFERENCES `gimnasios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_rol_id_fkey` FOREIGN KEY (`rol_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `especialidades` ADD CONSTRAINT `especialidades_gimnasio_id_fkey` FOREIGN KEY (`gimnasio_id`) REFERENCES `gimnasios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `profesor_especialidades` ADD CONSTRAINT `profesor_especialidades_profesor_id_fkey` FOREIGN KEY (`profesor_id`) REFERENCES `profesores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `profesor_especialidades` ADD CONSTRAINT `profesor_especialidades_especialidad_id_fkey` FOREIGN KEY (`especialidad_id`) REFERENCES `especialidades`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clientes` ADD CONSTRAINT `clientes_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clientes` ADD CONSTRAINT `clientes_estado_cliente_id_fkey` FOREIGN KEY (`estado_cliente_id`) REFERENCES `estados_cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `profesores` ADD CONSTRAINT `profesores_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recepcionistas` ADD CONSTRAINT `recepcionistas_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `planes` ADD CONSTRAINT `planes_gimnasio_id_fkey` FOREIGN KEY (`gimnasio_id`) REFERENCES `gimnasios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cuotas` ADD CONSTRAINT `cuotas_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cuotas` ADD CONSTRAINT `cuotas_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `planes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cuotas` ADD CONSTRAINT `cuotas_estado_cuota_id_fkey` FOREIGN KEY (`estado_cuota_id`) REFERENCES `estados_cuota`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos` ADD CONSTRAINT `pagos_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos` ADD CONSTRAINT `pagos_cuota_id_fkey` FOREIGN KEY (`cuota_id`) REFERENCES `cuotas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos` ADD CONSTRAINT `pagos_venta_id_fkey` FOREIGN KEY (`venta_id`) REFERENCES `ventas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos` ADD CONSTRAINT `pagos_registrado_por_id_fkey` FOREIGN KEY (`registrado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archivos` ADD CONSTRAINT `archivos_gimnasio_id_fkey` FOREIGN KEY (`gimnasio_id`) REFERENCES `gimnasios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archivos` ADD CONSTRAINT `archivos_subido_por_id_fkey` FOREIGN KEY (`subido_por_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aptos_fisicos` ADD CONSTRAINT `aptos_fisicos_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aptos_fisicos` ADD CONSTRAINT `aptos_fisicos_archivo_id_fkey` FOREIGN KEY (`archivo_id`) REFERENCES `archivos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aptos_fisicos` ADD CONSTRAINT `aptos_fisicos_subido_por_id_fkey` FOREIGN KEY (`subido_por_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asistencias` ADD CONSTRAINT `asistencias_gimnasio_id_fkey` FOREIGN KEY (`gimnasio_id`) REFERENCES `gimnasios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asistencias` ADD CONSTRAINT `asistencias_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ejercicios_catalogo` ADD CONSTRAINT `ejercicios_catalogo_gimnasio_id_fkey` FOREIGN KEY (`gimnasio_id`) REFERENCES `gimnasios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rutinas` ADD CONSTRAINT `rutinas_gimnasio_id_fkey` FOREIGN KEY (`gimnasio_id`) REFERENCES `gimnasios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rutinas` ADD CONSTRAINT `rutinas_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rutinas` ADD CONSTRAINT `rutinas_profesor_id_fkey` FOREIGN KEY (`profesor_id`) REFERENCES `profesores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ejercicios_rutina` ADD CONSTRAINT `ejercicios_rutina_rutina_id_fkey` FOREIGN KEY (`rutina_id`) REFERENCES `rutinas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ejercicios_rutina` ADD CONSTRAINT `ejercicios_rutina_ejercicio_catalogo_id_fkey` FOREIGN KEY (`ejercicio_catalogo_id`) REFERENCES `ejercicios_catalogo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rutina_dias` ADD CONSTRAINT `rutina_dias_rutina_id_fkey` FOREIGN KEY (`rutina_id`) REFERENCES `rutinas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recetas` ADD CONSTRAINT `recetas_gimnasio_id_fkey` FOREIGN KEY (`gimnasio_id`) REFERENCES `gimnasios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recetas` ADD CONSTRAINT `recetas_profesor_id_fkey` FOREIGN KEY (`profesor_id`) REFERENCES `profesores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recetas` ADD CONSTRAINT `recetas_foto_id_fkey` FOREIGN KEY (`foto_id`) REFERENCES `archivos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receta_ingredientes` ADD CONSTRAINT `receta_ingredientes_receta_id_fkey` FOREIGN KEY (`receta_id`) REFERENCES `recetas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receta_pasos` ADD CONSTRAINT `receta_pasos_receta_id_fkey` FOREIGN KEY (`receta_id`) REFERENCES `recetas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clases` ADD CONSTRAINT `clases_gimnasio_id_fkey` FOREIGN KEY (`gimnasio_id`) REFERENCES `gimnasios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clases` ADD CONSTRAINT `clases_profesor_id_fkey` FOREIGN KEY (`profesor_id`) REFERENCES `profesores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscripciones_clase` ADD CONSTRAINT `inscripciones_clase_clase_id_fkey` FOREIGN KEY (`clase_id`) REFERENCES `clases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscripciones_clase` ADD CONSTRAINT `inscripciones_clase_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `puntuaciones_clase` ADD CONSTRAINT `puntuaciones_clase_clase_id_fkey` FOREIGN KEY (`clase_id`) REFERENCES `clases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `puntuaciones_clase` ADD CONSTRAINT `puntuaciones_clase_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `productos` ADD CONSTRAINT `productos_gimnasio_id_fkey` FOREIGN KEY (`gimnasio_id`) REFERENCES `gimnasios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `productos` ADD CONSTRAINT `productos_foto_id_fkey` FOREIGN KEY (`foto_id`) REFERENCES `archivos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promociones` ADD CONSTRAINT `promociones_gimnasio_id_fkey` FOREIGN KEY (`gimnasio_id`) REFERENCES `gimnasios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promocion_productos` ADD CONSTRAINT `promocion_productos_promocion_id_fkey` FOREIGN KEY (`promocion_id`) REFERENCES `promociones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promocion_productos` ADD CONSTRAINT `promocion_productos_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promocion_planes` ADD CONSTRAINT `promocion_planes_promocion_id_fkey` FOREIGN KEY (`promocion_id`) REFERENCES `promociones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promocion_planes` ADD CONSTRAINT `promocion_planes_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `planes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ventas` ADD CONSTRAINT `ventas_gimnasio_id_fkey` FOREIGN KEY (`gimnasio_id`) REFERENCES `gimnasios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ventas` ADD CONSTRAINT `ventas_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ventas` ADD CONSTRAINT `ventas_registrado_por_id_fkey` FOREIGN KEY (`registrado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venta_items` ADD CONSTRAINT `venta_items_venta_id_fkey` FOREIGN KEY (`venta_id`) REFERENCES `ventas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venta_items` ADD CONSTRAINT `venta_items_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notificaciones` ADD CONSTRAINT `notificaciones_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
