import * as classesService from '../services/classes.service.js';
import { sendSuccess } from '../utils/response.js';

export const listClasses = async (req, res) =>
  sendSuccess(res, { data: await classesService.listClasses(req.user.id, req.user.rol.nombre) });

export const enroll = async (req, res) =>
  sendSuccess(res, { message: 'Inscripción creada correctamente', data: await classesService.enroll(req.user.id, req.params.id), statusCode: 201 });

export const rate = async (req, res) =>
  sendSuccess(res, { message: 'Clase puntuada correctamente', data: await classesService.rateClass(req.user.id, req.params.id, req.body.puntuacion, req.body.comentario) });

export const listProfessorClasses = async (req, res) =>
  sendSuccess(res, { data: await classesService.listClassesForProfessor(req.profesor.id) });

export const createClass = async (req, res) =>
  sendSuccess(res, { message: 'Clase creada correctamente', data: await classesService.createClass(req.profesor.id, req.body), statusCode: 201 });

export const updateClass = async (req, res) =>
  sendSuccess(res, { message: 'Clase actualizada correctamente', data: await classesService.updateClass(req.profesor.id, req.params.id, req.body) });

export const deleteClass = async (req, res) =>
  sendSuccess(res, { message: 'Clase eliminada correctamente', data: await classesService.deleteClass(req.profesor.id, req.params.id) });

export const checkAvailability = async (req, res) =>
  sendSuccess(res, { data: await classesService.checkAvailability(req.profesor.id, req.body) });
