import { param, query } from 'express-validator';
import { PAYMENT_SORT_FIELDS } from '../services/ingresos.service.js';

const isoDate = (field) =>
  query(field).optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage(`"${field}" debe tener el formato AAAA-MM-DD`);

export const rangeQuery = [isoDate('desde'), isoDate('hasta')];

export const chartQuery = [...rangeQuery, query('agrupar').optional().isIn(['auto', 'dia', 'mes']).withMessage('Agrupación inválida')];

export const paymentsQuery = [
  ...rangeQuery,
  query('metodo').optional().isIn(['EFECTIVO', 'MERCADO_PAGO']).withMessage('Método inválido'),
  query('planId').optional().isInt({ min: 1 }).withMessage('Plan inválido'),
  query('q').optional().isString().trim().isLength({ max: 100 }).withMessage('La búsqueda no puede superar los 100 caracteres'),
  query('orden').optional().isIn(PAYMENT_SORT_FIELDS).withMessage('Orden inválido'),
  query('dir').optional().isIn(['asc', 'desc']).withMessage('Dirección inválida'),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

export const paymentIdParam = [param('id').isInt({ min: 1 }).withMessage('ID de pago inválido')];
export const quotaIdParam = [param('cuotaId').isInt({ min: 1 }).withMessage('ID de cuota inválido')];
