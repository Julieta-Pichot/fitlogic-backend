import * as productsService from '../services/products.service.js';
import { sendSuccess } from '../utils/response.js';

export const listProducts = async (req, res, next) => {
  try {
    const data = await productsService.listProducts(req.user.gimnasioId, req.query);
    return sendSuccess(res, { data });
  } catch (error) {
    return next(error);
  }
};

export const getProduct = async (req, res, next) => {
  try {
    const data = await productsService.getProductById(req.user.gimnasioId, Number(req.params.id));
    return sendSuccess(res, { data });
  } catch (error) {
    return next(error);
  }
};

export const createProduct = async (req, res, next) => {
  try {
    const data = await productsService.createProduct(req.user.gimnasioId, req.user.id, req.body);
    return sendSuccess(res, {
      message: 'Producto creado correctamente',
      data,
      statusCode: 201,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateProduct = async (req, res, next) => {
  try {
    const data = await productsService.updateProduct(req.user.gimnasioId, req.user.id, Number(req.params.id), req.body);
    return sendSuccess(res, { message: 'Producto actualizado correctamente', data });
  } catch (error) {
    return next(error);
  }
};

export const toggleProductActive = async (req, res, next) => {
  try {
    const data = await productsService.toggleProductActive(req.user.gimnasioId, req.user.id, Number(req.params.id), req.body.activo);
    return sendSuccess(res, { message: 'Estado del producto actualizado', data });
  } catch (error) {
    return next(error);
  }
};

export const deleteProduct = async (req, res, next) => {
  try {
    await productsService.deleteProduct(req.user.gimnasioId, req.user.id, Number(req.params.id));
    return sendSuccess(res, { message: 'Producto eliminado correctamente' });
  } catch (error) {
    return next(error);
  }
};
