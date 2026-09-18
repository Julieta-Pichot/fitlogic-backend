-- CreateTable
CREATE TABLE `gimnasio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `direccion` VARCHAR(200) NULL,
    `telefono` VARCHAR(50) NULL,
    `email_soporte` VARCHAR(150) NULL,
    `identidad_visual` VARCHAR(255) NULL,
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rol` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `rol_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rol_id` INTEGER NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `apellido` VARCHAR(100) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `telefono` VARCHAR(50) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `usuario_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `estado_cliente` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `estado_cliente_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cliente` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `estado_cliente_id` INTEGER NOT NULL,
    `objetivo_entrenamiento` VARCHAR(255) NULL,
    `objetivo_dias_racha` INTEGER NOT NULL DEFAULT 3,
    `fecha_alta` DATE NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `apto_fisico_archivo` VARCHAR(255) NULL,
    `apto_fisico_fecha_carga` DATE NULL,
    `apto_fisico_fecha_vencimiento` DATE NULL,

    UNIQUE INDEX `cliente_usuario_id_key`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `estado_cuenta_staff` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `estado_cuenta_staff_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `profesor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `estado_cuenta_staff_id` INTEGER NOT NULL,
    `especialidad` VARCHAR(100) NULL,

    UNIQUE INDEX `profesor_usuario_id_key`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recepcionista` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `estado_cuenta_staff_id` INTEGER NOT NULL,

    UNIQUE INDEX `recepcionista_usuario_id_key`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `duracion_dias` INTEGER NOT NULL,
    `precio` DECIMAL(10, 2) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `estado_cuota` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `estado_cuota_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cuota` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cliente_id` INTEGER NOT NULL,
    `plan_id` INTEGER NOT NULL,
    `estado_cuota_id` INTEGER NOT NULL,
    `fecha_inicio` DATE NOT NULL,
    `fecha_vencimiento` DATE NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `metodo_pago` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `metodo_pago_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pago` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cuota_id` INTEGER NOT NULL,
    `metodo_pago_id` INTEGER NOT NULL,
    `monto` DECIMAL(10, 2) NOT NULL,
    `fecha_pago` DATETIME(3) NOT NULL,
    `referencia_externa` VARCHAR(200) NULL,

    UNIQUE INDEX `pago_cuota_id_key`(`cuota_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promocion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `plan_id` INTEGER NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `descripcion` TEXT NULL,
    `descuento` DECIMAL(5, 2) NOT NULL,
    `fecha_inicio` DATE NOT NULL,
    `fecha_fin` DATE NOT NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asistencia` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cliente_id` INTEGER NOT NULL,
    `fecha_hora` DATETIME(3) NOT NULL,

    INDEX `asistencia_cliente_id_fecha_hora_idx`(`cliente_id`, `fecha_hora`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rutina` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cliente_id` INTEGER NOT NULL,
    `profesor_id` INTEGER NOT NULL,
    `nombre` VARCHAR(150) NOT NULL,
    `descripcion` TEXT NULL,
    `objetivo` VARCHAR(150) NULL,
    `frecuencia_semanal` INTEGER NULL,
    `duracion_estimada` INTEGER NULL,
    `nivel_dificultad` VARCHAR(50) NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `fecha_asignacion` DATE NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `rutina_cliente_id_activa_idx`(`cliente_id`, `activa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rutina_dia` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rutina_id` INTEGER NOT NULL,
    `dia_semana` INTEGER NOT NULL,

    UNIQUE INDEX `rutina_dia_rutina_id_dia_semana_key`(`rutina_id`, `dia_semana`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ejercicio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(150) NOT NULL,
    `grupo_muscular` VARCHAR(50) NULL,
    `tipo` VARCHAR(50) NULL,
    `descripcion` TEXT NULL,
    `video_url` VARCHAR(500) NULL,
    `creado_por` INTEGER NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rutina_ejercicio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rutina_id` INTEGER NOT NULL,
    `ejercicio_id` INTEGER NOT NULL,
    `series` INTEGER NULL,
    `repeticiones` INTEGER NULL,
    `descanso_segundos` INTEGER NULL,
    `orden_visual` INTEGER NULL,
    `observaciones` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clase` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `profesor_id` INTEGER NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `sala` VARCHAR(100) NULL,
    `cupo_maximo` INTEGER NOT NULL,
    `recurrente` BOOLEAN NOT NULL DEFAULT false,
    `fecha_hora` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `estado_inscripcion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `estado_inscripcion_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inscripcion_clase` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clase_id` INTEGER NOT NULL,
    `cliente_id` INTEGER NOT NULL,
    `estado_inscripcion_id` INTEGER NOT NULL,
    `fecha_inscripcion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `inscripcion_clase_clase_id_cliente_id_key`(`clase_id`, `cliente_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `puntuacion_clase` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clase_id` INTEGER NOT NULL,
    `cliente_id` INTEGER NOT NULL,
    `puntuacion` TINYINT NOT NULL,
    `comentario` VARCHAR(500) NULL,

    UNIQUE INDEX `puntuacion_clase_clase_id_cliente_id_key`(`clase_id`, `cliente_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categoria_receta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `categoria_receta_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `receta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `profesor_id` INTEGER NOT NULL,
    `categoria_receta_id` INTEGER NOT NULL,
    `nombre` VARCHAR(150) NOT NULL,
    `descripcion` TEXT NULL,
    `calorias` INTEGER NULL,
    `tiempo_preparacion` INTEGER NULL,
    `foto` VARCHAR(255) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ingrediente_receta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `receta_id` INTEGER NOT NULL,
    `nombre` VARCHAR(150) NOT NULL,
    `cantidad` VARCHAR(50) NULL,
    `unidad` VARCHAR(30) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `paso_receta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `receta_id` INTEGER NOT NULL,
    `numero_paso` INTEGER NOT NULL,
    `descripcion` TEXT NOT NULL,

    UNIQUE INDEX `paso_receta_receta_id_numero_paso_key`(`receta_id`, `numero_paso`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tipo_notificacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `tipo_notificacion_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notificacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `tipo_notificacion_id` INTEGER NOT NULL,
    `titulo` VARCHAR(150) NOT NULL,
    `mensaje` TEXT NOT NULL,
    `leida` BOOLEAN NOT NULL DEFAULT false,
    `fecha_envio` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notificacion_usuario_id_leida_idx`(`usuario_id`, `leida`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `usuario` ADD CONSTRAINT `usuario_rol_id_fkey` FOREIGN KEY (`rol_id`) REFERENCES `rol`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cliente` ADD CONSTRAINT `cliente_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cliente` ADD CONSTRAINT `cliente_estado_cliente_id_fkey` FOREIGN KEY (`estado_cliente_id`) REFERENCES `estado_cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `profesor` ADD CONSTRAINT `profesor_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `profesor` ADD CONSTRAINT `profesor_estado_cuenta_staff_id_fkey` FOREIGN KEY (`estado_cuenta_staff_id`) REFERENCES `estado_cuenta_staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recepcionista` ADD CONSTRAINT `recepcionista_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recepcionista` ADD CONSTRAINT `recepcionista_estado_cuenta_staff_id_fkey` FOREIGN KEY (`estado_cuenta_staff_id`) REFERENCES `estado_cuenta_staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cuota` ADD CONSTRAINT `cuota_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cuota` ADD CONSTRAINT `cuota_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cuota` ADD CONSTRAINT `cuota_estado_cuota_id_fkey` FOREIGN KEY (`estado_cuota_id`) REFERENCES `estado_cuota`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pago` ADD CONSTRAINT `pago_cuota_id_fkey` FOREIGN KEY (`cuota_id`) REFERENCES `cuota`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pago` ADD CONSTRAINT `pago_metodo_pago_id_fkey` FOREIGN KEY (`metodo_pago_id`) REFERENCES `metodo_pago`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promocion` ADD CONSTRAINT `promocion_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asistencia` ADD CONSTRAINT `asistencia_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rutina` ADD CONSTRAINT `rutina_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rutina` ADD CONSTRAINT `rutina_profesor_id_fkey` FOREIGN KEY (`profesor_id`) REFERENCES `profesor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rutina_dia` ADD CONSTRAINT `rutina_dia_rutina_id_fkey` FOREIGN KEY (`rutina_id`) REFERENCES `rutina`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ejercicio` ADD CONSTRAINT `ejercicio_creado_por_fkey` FOREIGN KEY (`creado_por`) REFERENCES `profesor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rutina_ejercicio` ADD CONSTRAINT `rutina_ejercicio_rutina_id_fkey` FOREIGN KEY (`rutina_id`) REFERENCES `rutina`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rutina_ejercicio` ADD CONSTRAINT `rutina_ejercicio_ejercicio_id_fkey` FOREIGN KEY (`ejercicio_id`) REFERENCES `ejercicio`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clase` ADD CONSTRAINT `clase_profesor_id_fkey` FOREIGN KEY (`profesor_id`) REFERENCES `profesor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscripcion_clase` ADD CONSTRAINT `inscripcion_clase_clase_id_fkey` FOREIGN KEY (`clase_id`) REFERENCES `clase`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscripcion_clase` ADD CONSTRAINT `inscripcion_clase_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscripcion_clase` ADD CONSTRAINT `inscripcion_clase_estado_inscripcion_id_fkey` FOREIGN KEY (`estado_inscripcion_id`) REFERENCES `estado_inscripcion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `puntuacion_clase` ADD CONSTRAINT `puntuacion_clase_clase_id_fkey` FOREIGN KEY (`clase_id`) REFERENCES `clase`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `puntuacion_clase` ADD CONSTRAINT `puntuacion_clase_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receta` ADD CONSTRAINT `receta_profesor_id_fkey` FOREIGN KEY (`profesor_id`) REFERENCES `profesor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receta` ADD CONSTRAINT `receta_categoria_receta_id_fkey` FOREIGN KEY (`categoria_receta_id`) REFERENCES `categoria_receta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ingrediente_receta` ADD CONSTRAINT `ingrediente_receta_receta_id_fkey` FOREIGN KEY (`receta_id`) REFERENCES `receta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paso_receta` ADD CONSTRAINT `paso_receta_receta_id_fkey` FOREIGN KEY (`receta_id`) REFERENCES `receta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notificacion` ADD CONSTRAINT `notificacion_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notificacion` ADD CONSTRAINT `notificacion_tipo_notificacion_id_fkey` FOREIGN KEY (`tipo_notificacion_id`) REFERENCES `tipo_notificacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
