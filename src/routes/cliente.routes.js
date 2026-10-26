import { Router } from 'express';
import { authenticateToken, requireClienteContext } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import * as controller from '../controllers/cliente.controller.js';
import { notificationIdValidator, notificationListValidator } from '../validators/profesor.validator.js';
import { checkoutValidator, recipesQuery, clientPasswordValidator, dayQuery, enrollValidator, idParam, pageQuery } from '../validators/cliente.validator.js';

const router = Router();

// Todo este router exige token válido y rol CLIENTE; solo expone datos del propio cliente.
router.use(authenticateToken, ...requireClienteContext);

router.get('/inicio', controller.getHome);

router.get('/rutinas', controller.listRoutines);
router.get('/rutinas/historial', controller.listRoutineHistory);
router.get('/rutinas/:id', idParam, validateRequest, controller.getRoutine);

router.get('/clases', dayQuery, validateRequest, controller.listClasses);
router.get('/clases/mias', controller.listMyClasses);
router.post('/clases/:id/inscripcion', enrollValidator, validateRequest, controller.enroll);
router.delete('/clases/:id/inscripcion', idParam, validateRequest, controller.cancelEnrollment);

router.get('/categorias-receta', controller.listRecipeCategories);
router.get('/recetas', recipesQuery, validateRequest, controller.listRecipes);
router.get('/recetas/:id', idParam, validateRequest, controller.getRecipe);

router.get('/planes', controller.listPlans);
router.post('/membresia/checkout', checkoutValidator, validateRequest, controller.createCheckout);
router.get('/membresia/pago/config', controller.getCheckoutConfig);
router.get('/membresia/pago/verificar', controller.verifyPayment);
router.delete('/membresia/solicitudes/:id', idParam, validateRequest, controller.discardRequest);

router.get('/perfil', controller.getProfile);
router.put('/perfil/password', clientPasswordValidator, validateRequest, controller.changePassword);
router.get('/pagos', pageQuery, validateRequest, controller.listPayments);
router.get('/pagos/:id/comprobante', idParam, validateRequest, controller.getReceipt);
router.get('/asistencias', pageQuery, validateRequest, controller.listAttendances);
router.get('/apto-fisico/archivo', controller.downloadMedicalClearance);

router.get('/notificaciones', notificationListValidator, validateRequest, controller.listNotifications);
router.patch('/notificaciones/leidas', controller.markAllNotificationsRead);
router.patch('/notificaciones/:id/leida', notificationIdValidator, validateRequest, controller.markNotificationRead);

export default router;
