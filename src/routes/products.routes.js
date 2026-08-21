import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import * as productsController from '../controllers/products.controller.js';
import { createProductValidator, listProductsValidator, toggleProductActiveValidator, updateProductValidator, productIdValidator } from '../validators/product.validator.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get('/', listProductsValidator, validateRequest, productsController.listProducts);
router.get('/:id', productIdValidator, validateRequest, productsController.getProduct);
router.post('/', createProductValidator, validateRequest, productsController.createProduct);
router.patch('/:id', updateProductValidator, validateRequest, productsController.updateProduct);
router.patch('/:id/active', toggleProductActiveValidator, validateRequest, productsController.toggleProductActive);
router.delete('/:id', productIdValidator, validateRequest, productsController.deleteProduct);

export default router;
