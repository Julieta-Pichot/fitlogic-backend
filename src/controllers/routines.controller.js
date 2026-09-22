import * as routinesService from '../services/routines.service.js';
import { sendSuccess } from '../utils/response.js';

export const listRoutines = async (req, res, next) => {
  try { return sendSuccess(res, { data: await routinesService.listRoutinesForProfessor(req.user.id, req.query) }); } catch (error) { return next(error); }
};
export const listMyRoutines = async (req, res, next) => {
  try { return sendSuccess(res, { data: await routinesService.listRoutinesForClient(req.user.id, req.query) }); } catch (error) { return next(error); }
};
export const createRoutine = async (req, res, next) => {
  try { return sendSuccess(res, { message: 'Rutina creada correctamente', data: await routinesService.createRoutine(req.user.id, req.body), statusCode: 201 }); } catch (error) { return next(error); }
};
export const listExercises = async (_req, res, next) => {
  try { return sendSuccess(res, { data: await routinesService.listExercises() }); } catch (error) { return next(error); }
};
export const createExercise = async (req, res, next) => {
  try { return sendSuccess(res, { message: 'Ejercicio creado correctamente', data: await routinesService.createExercise(req.user.id, req.body), statusCode: 201 }); } catch (error) { return next(error); }
};
