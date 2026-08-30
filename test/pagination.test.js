import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePaginationParams } from '../src/utils/pagination.js';

test('calcula paginación con valores válidos', () => {
  const result = parsePaginationParams({ page: '2', limit: '25' });

  assert.deepEqual(result, { page: 2, limit: 25, skip: 25 });
});

test('usa valores predeterminados cuando recibe datos inválidos', () => {
  const result = parsePaginationParams({ page: 'invalida', limit: 'sin limite' });

  assert.deepEqual(result, { page: 1, limit: 20, skip: 0 });
});

test('ajusta valores que exceden los límites permitidos', () => {
  const result = parsePaginationParams({ page: '0', limit: '999' });

  assert.deepEqual(result, { page: 1, limit: 100, skip: 0 });
});
