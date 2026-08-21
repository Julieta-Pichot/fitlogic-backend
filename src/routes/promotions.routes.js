import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import * as promotionsController from '../controllers/promotions.controller.js';
import {
  createPromotionValidator,
  listPromotionsValidator,
  promotionIdValidator,
  togglePromotionActiveValidator,
  updatePromotionValidator,
} from '../validators/promotion.validator.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get('/', listPromotionsValidator, validateRequest, promotionsController.listPromotions);
router.get('/:id', promotionIdValidator, validateRequest, promotionsController.getPromotion);
router.post('/', createPromotionValidator, validateRequest, promotionsController.createPromotion);
router.patch('/:id', updatePromotionValidator, validateRequest, promotionsController.updatePromotion);
router.patch('/:id/active', togglePromotionActiveValidator, validateRequest, promotionsController.togglePromotionActive);
router.delete('/:id', promotionIdValidator, validateRequest, promotionsController.deletePromotion);

export default router;
