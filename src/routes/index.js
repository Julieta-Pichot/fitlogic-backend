import { Router } from 'express';
import authRoutes from './auth.routes.js';
import configRoutes from './config.routes.js';
import usersRoutes from './users.routes.js';
import plansRoutes from './plans.routes.js';
import promotionsRoutes from './promotions.routes.js';
import clientsRoutes from './clients.routes.js';
import attendanceRoutes from './attendance.routes.js';
import quotasRoutes from './quotas.routes.js';
import routinesRoutes from './routines.routes.js';
import classesRoutes from './classes.routes.js';
import recipesRoutes from './recipes.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import recepcionRoutes from './recepcion.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/config', configRoutes);
router.use('/users', usersRoutes);
router.use('/plans', plansRoutes);
router.use('/promotions', promotionsRoutes);
router.use('/clients', clientsRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/quotas', quotasRoutes);
router.use('/routines', routinesRoutes);
router.use('/classes', classesRoutes);
router.use('/recipes', recipesRoutes);
router.use('/admin/dashboard', dashboardRoutes);
router.use('/recepcion', recepcionRoutes);

export default router;
