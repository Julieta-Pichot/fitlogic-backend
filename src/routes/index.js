import { Router } from 'express';
import authRoutes from './auth.routes.js';
import configRoutes from './config.routes.js';
import usersRoutes from './users.routes.js';
import plansRoutes from './plans.routes.js';
import productsRoutes from './products.routes.js';
import promotionsRoutes from './promotions.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/config', configRoutes);
router.use('/users', usersRoutes);
router.use('/plans', plansRoutes);
router.use('/products', productsRoutes);
router.use('/promotions', promotionsRoutes);

export default router;
