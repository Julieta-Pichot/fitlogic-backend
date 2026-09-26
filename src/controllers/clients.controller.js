import * as clientsService from '../services/clients.service.js';
import { sendSuccess } from '../utils/response.js';

export const listClients = async (req, res, next) => {
  try { return sendSuccess(res, { data: await clientsService.listClients(req.query) }); } catch (error) { return next(error); }
};

export const getClient = async (req, res, next) => {
  try { return sendSuccess(res, { data: await clientsService.getClientById(req.params.id) }); } catch (error) { return next(error); }
};

export const getCurrentClient = async (req, res, next) => {
  try { return sendSuccess(res, { data: await clientsService.getCurrentClient(req.user.id) }); } catch (error) { return next(error); }
};

export const createClient = async (req, res, next) => {
  try { return sendSuccess(res, { message: 'Cliente creado correctamente', data: await clientsService.createClient(req.user.id, req.body), statusCode: 201 }); } catch (error) { return next(error); }
};

export const updateClient = async (req, res, next) => {
  try { return sendSuccess(res, { message: 'Cliente actualizado correctamente', data: await clientsService.updateClient(req.params.id, req.body) }); } catch (error) { return next(error); }
};

export const updateMedicalClearance = async (req, res, next) => {
  try {
    const data = await clientsService.updateMedicalClearance(req.params.id, req.body.archivo, req.body.fechaCarga);
    return sendSuccess(res, { message: 'Apto físico actualizado correctamente', data });
  } catch (error) { return next(error); }
};

export const uploadMedicalClearance = async (req, res, next) => {
  try {
    const data = await clientsService.uploadMedicalClearance(req.params.id, req.file);
    return sendSuccess(res, { message: 'Apto físico cargado correctamente', data });
  } catch (error) { return next(error); }
};

export const changeClientStatus = async (req, res, next) => {
  try {
    const data = await clientsService.changeClientStatus(req.params.id, req.body.estado);
    return sendSuccess(res, { message: 'Estado del cliente actualizado', data });
  } catch (error) { return next(error); }
};
