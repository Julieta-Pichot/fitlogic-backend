import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import * as plansController from '../controllers/plans.controller.js';
import { createPlanValidator, listPlansValidator, togglePlanActiveValidator, updatePlanValidator, planIdValidator } from '../validators/plan.validator.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get('/', listPlansValidator, validateRequest, plansController.listPlans);
router.get('/:id', planIdValidator, validateRequest, plansController.getPlan);
router.post('/', createPlanValidator, validateRequest, plansController.createPlan);
router.patch('/:id', updatePlanValidator, validateRequest, plansController.updatePlan);
router.patch('/:id/active', togglePlanActiveValidator, validateRequest, plansController.togglePlanActive);
router.delete('/:id', planIdValidator, validateRequest, plansController.deletePlan);

export default router;
