import { Router } from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/auth.controller.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';

const router = Router();

router.post(
  '/login',
  [
    body('email').trim().isEmail().withMessage('Email inválido'),
    body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
    validateRequest,
  ],
  authController.login
);

router.get('/me', authenticateToken, authController.me);

router.post(
  '/change-password',
  authenticateToken,
  [
    body('currentPassword').notEmpty().withMessage('La contraseña actual es requerida'),
    body('newPassword').isLength({ min: 6 }).withMessage('La nueva contraseña debe tener al menos 6 caracteres'),
    validateRequest,
  ],
  authController.changePassword
);

export default router;
