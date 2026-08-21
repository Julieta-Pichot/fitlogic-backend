import { PAGINATION } from '../constants/index.js';

export const parsePaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || PAGINATION.DEFAULT_PAGE);
  const rawLimit = parseInt(query.limit, 10) || PAGINATION.DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, rawLimit), PAGINATION.MAX_LIMIT);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

export const buildPaginationMeta = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit) || 0,
});

export const buildPaginatedResponse = (items, pagination) => ({
  items,
  pagination: buildPaginationMeta(pagination),
});

export const parseSortParams = (query, allowedFields, defaultField = 'fechaCreacion') => {
  const sortBy = allowedFields.includes(query.sortBy) ? query.sortBy : defaultField;
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

  return { sortBy, sortOrder };
};

export const parseSearchParam = (query) => {
  const search = query.search?.trim();
  return search || undefined;
};
