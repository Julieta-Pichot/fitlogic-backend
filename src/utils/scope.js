import { NotFoundError, ForbiddenError } from '../errors/AppError.js';

export const assertGymOwnership = (resourceGimnasioId, userGimnasioId, resourceName = 'Recurso') => {
  if (resourceGimnasioId == null) {
    throw new NotFoundError(`${resourceName} no encontrado`);
  }

  if (resourceGimnasioId !== userGimnasioId) {
    throw new ForbiddenError('No tenés permiso para acceder a este recurso');
  }
};

export const gymScope = (gimnasioId) => ({
  gimnasioId,
});

export const activeOnly = () => ({
  activo: 1,
  fechaEliminacion: null,
});

export const softDeleteData = (userId) => ({
  activo: 0,
  fechaEliminacion: new Date(),
  actualizadoPorId: userId,
});
