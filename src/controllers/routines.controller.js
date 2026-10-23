import * as routinesService from '../services/routines.service.js';
import * as exercisesService from '../services/exercises.service.js';
import { sendSuccess } from '../utils/response.js';

export const listMyRoutines = async (req, res) =>
  sendSuccess(res, { data: await routinesService.listRoutinesForClient(req.user.id, req.query) });

export const listRoutines = async (req, res) =>
  sendSuccess(res, { data: await routinesService.listRoutinesForProfessor(req.profesor.id) });

export const getRoutine = async (req, res) =>
  sendSuccess(res, { data: await routinesService.getRoutineForProfessor(req.profesor.id, req.params.id) });

export const createRoutine = async (req, res) =>
  sendSuccess(res, {
    message: 'Rutina creada correctamente',
    data: await routinesService.createRoutine(req.profesor.id, req.body),
    statusCode: 201,
  });

export const updateRoutine = async (req, res) =>
  sendSuccess(res, {
    message: 'Rutina actualizada correctamente',
    data: await routinesService.updateRoutine(req.profesor.id, req.params.id, req.body),
  });

export const listExercises = async (_req, res) =>
  sendSuccess(res, { data: await exercisesService.listExercises() });

export const createExercise = async (req, res) => {
  const { ejercicio, existente } = await exercisesService.createOrReuseExercise(req.profesor.id, req.body);
  return sendSuccess(res, {
    message: existente ? 'El ejercicio ya existía en el catálogo y se reutilizó' : 'Ejercicio creado correctamente',
    data: { ...ejercicio, existente },
    statusCode: existente ? 200 : 201,
  });
};
