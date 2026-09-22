import { query } from 'express-validator';

export const dashboardStatsValidator = [
  query('months').optional().isIn(['6', '12']).withMessage('El rango de meses debe ser 6 o 12'),
];
