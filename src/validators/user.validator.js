import { body, param, query } from 'express-validator';
import { ROLES } from '../constants/index.js';

const roleIds = Object.values(ROLES);

export const listUsersValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('Página inválida'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite inválido'),
  query('search').optional().isString().trim(),
  query('rolId').optional().isInt().withMessage('Rol inválido'),
  query('activo').optional().isIn(['0', '1']).withMessage('Estado activo inválido'),
  query('sortBy').optional().isIn(['nombre', 'apellido', 'email', 'fechaCreacion']),
  query('sortOrder').optional().isIn(['asc', 'desc']),
];

export const userIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('ID de usuario inválido'),
];

export const createUserValidator = [
  body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 100 }),
  body('apellido').trim().notEmpty().withMessage('El apellido es obligatorio').isLength({ max: 100 }),
  body('email').trim().isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('telefono').optional({ nullable: true }).trim().isLength({ max: 50 }),
  body('rolId')
    .isInt()
    .withMessage('Rol inválido')
    .custom((value) => roleIds.includes(Number(value)))
    .withMessage('Rol no permitido'),
  body('especialidades').optional().isArray().withMessage('Especialidades inválidas'),
  body('especialidades.*').optional().isString().trim().notEmpty(),
  body('objetivoDiasSemana')
    .optional()
    .isInt({ min: 1, max: 7 })
    .withMessage('Objetivo de días inválido'),
];

export const updateUserValidator = [
  ...userIdValidator,
  body('nombre').optional().trim().notEmpty().isLength({ max: 100 }),
  body('apellido').optional().trim().notEmpty().isLength({ max: 100 }),
  body('email').optional().trim().isEmail().normalizeEmail(),
  body('telefono').optional({ nullable: true }).trim().isLength({ max: 50 }),
  body('rolId')
    .optional()
    .isInt()
    .custom((value) => roleIds.includes(Number(value)))
    .withMessage('Rol no permitido'),
  body('especialidades').optional().isArray(),
  body('especialidades.*').optional().isString().trim().notEmpty(),
  body('objetivoDiasSemana').optional().isInt({ min: 1, max: 7 }),
];

export const toggleUserActiveValidator = [
  ...userIdValidator,
  body('activo').isIn([0, 1]).withMessage('Estado activo inválido'),
];

export const resetUserPasswordValidator = [
  ...userIdValidator,
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres'),
];
