import * as classesService from '../services/classes.service.js';
import { sendSuccess } from '../utils/response.js';
export const listClasses = async (req, res, next) => { try { return sendSuccess(res, { data: await classesService.listClasses(req.user.id, req.user.rol.nombre) }); } catch (error) { return next(error); } };
export const createClass = async (req, res, next) => { try { return sendSuccess(res, { message: 'Clase creada correctamente', data: await classesService.createClass(req.user.id, req.body), statusCode: 201 }); } catch (error) { return next(error); } };
export const enroll = async (req, res, next) => { try { return sendSuccess(res, { message: 'Inscripción creada correctamente', data: await classesService.enroll(req.user.id, req.params.id), statusCode: 201 }); } catch (error) { return next(error); } };
export const rate = async (req, res, next) => { try { return sendSuccess(res, { message: 'Clase puntuada correctamente', data: await classesService.rateClass(req.user.id, req.params.id, req.body.puntuacion, req.body.comentario) }); } catch (error) { return next(error); } };
