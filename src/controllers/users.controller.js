import * as usersService from '../services/users.service.js';
import { sendSuccess } from '../utils/response.js';

export const listUsers = async (req, res, next) => {
  try {
    const data = await usersService.listUsers(req.user.gimnasioId, req.query);
    return sendSuccess(res, { data });
  } catch (error) {
    return next(error);
  }
};

export const getUser = async (req, res, next) => {
  try {
    const data = await usersService.getUserById(req.user.gimnasioId, Number(req.params.id));
    return sendSuccess(res, { data });
  } catch (error) {
    return next(error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const data = await usersService.createUser(req.user.gimnasioId, req.user.id, req.body);
    return sendSuccess(res, {
      message: 'Usuario creado correctamente',
      data,
      statusCode: 201,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const data = await usersService.updateUser(
      req.user.gimnasioId,
      req.user.id,
      Number(req.params.id),
      req.body
    );
    return sendSuccess(res, { message: 'Usuario actualizado correctamente', data });
  } catch (error) {
    return next(error);
  }
};

export const toggleUserActive = async (req, res, next) => {
  try {
    const data = await usersService.toggleUserActive(
      req.user.gimnasioId,
      req.user.id,
      Number(req.params.id),
      Number(req.body.activo)
    );
    return sendSuccess(res, { message: 'Estado del usuario actualizado', data });
  } catch (error) {
    return next(error);
  }
};

export const resetUserPassword = async (req, res, next) => {
  try {
    await usersService.resetUserPassword(
      req.user.gimnasioId,
      req.user.id,
      Number(req.params.id),
      req.body.newPassword
    );
    return sendSuccess(res, { message: 'Contraseña restablecida correctamente' });
  } catch (error) {
    return next(error);
  }
};
