import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import * as usersController from '../controllers/users.controller.js';
import {
  createUserValidator,
  listUsersValidator,
  resetUserPasswordValidator,
  toggleUserActiveValidator,
  updateUserValidator,
  userIdValidator,
} from '../validators/user.validator.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get('/', listUsersValidator, validateRequest, usersController.listUsers);
router.get('/:id', userIdValidator, validateRequest, usersController.getUser);
router.post('/', createUserValidator, validateRequest, usersController.createUser);
router.patch('/:id', updateUserValidator, validateRequest, usersController.updateUser);
router.patch('/:id/active', toggleUserActiveValidator, validateRequest, usersController.toggleUserActive);
router.post(
  '/:id/reset-password',
  resetUserPasswordValidator,
  validateRequest,
  usersController.resetUserPassword
);

export default router;
