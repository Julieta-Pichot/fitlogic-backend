import fs from 'fs';
import { ValidationError } from '../errors/AppError.js';

// En las requests multipart el JSON viaja en el campo de texto `payload`.
// Lo parsea y lo deja en req.body para que las validaciones y servicios lo traten igual
// que un body JSON normal. Si es inválido, borra el archivo ya subido.
export const parseMultipartPayload = (req, _res, next) => {
  if (typeof req.body?.payload !== 'string') return next();

  try {
    const parsed = JSON.parse(req.body.payload);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('payload inválido');
    req.body = parsed;
    return next();
  } catch {
    if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
    return next(new ValidationError('Los datos enviados no son válidos'));
  }
};

// Si la validación falla después de subir el archivo, no deja la imagen huérfana en el servidor.
export const discardUploadOnError = (error, req, _res, next) => {
  if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
  return next(error);
};
