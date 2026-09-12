import { describe, expect, it } from 'vitest';

import { getPagination } from '../paginate.js';

describe('paginate utility', () => {
  it('aplica valores por defecto cuando no se proveen parámetros', () => {
    const pagination = getPagination();

    expect(pagination.page).toBe(1);
    expect(pagination.limit).toBe(20);
    expect(pagination.offset).toBe(0);
  });

  it('calcula offset correctamente con valores personalizados', () => {
    const pagination = getPagination({ page: 3, limit: 15 });

    expect(pagination.page).toBe(3);
    expect(pagination.limit).toBe(15);
    expect(pagination.offset).toBe(30);
  });

  it('acota limit al máximo permitido (100) y corrige páginas negativas', () => {
    const pagination = getPagination({ page: -2, limit: 500 });

    expect(pagination.page).toBe(1);
    expect(pagination.limit).toBe(100);
    expect(pagination.offset).toBe(0);
  });

  it('calcula meta correctamente para primera página', () => {
    const pagination = getPagination({ page: 1, limit: 10 });
    const meta = pagination.meta(45);

    expect(meta).toEqual({
      page: 1,
      limit: 10,
      total: 45,
      totalPages: 5,
      hasNext: true,
      hasPrev: false,
    });
  });

  it('calcula meta correctamente para página intermedia', () => {
    const pagination = getPagination({ page: 3, limit: 10 });
    const meta = pagination.meta(45);

    expect(meta).toEqual({
      page: 3,
      limit: 10,
      total: 45,
      totalPages: 5,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('calcula meta correctamente para última página', () => {
    const pagination = getPagination({ page: 5, limit: 10 });
    const meta = pagination.meta(45);

    expect(meta).toEqual({
      page: 5,
      limit: 10,
      total: 45,
      totalPages: 5,
      hasNext: false,
      hasPrev: true,
    });
  });

  it('calcula meta correctamente cuando no hay registros (total 0)', () => {
    const pagination = getPagination({ page: 1, limit: 10 });
    const meta = pagination.meta(0);

    expect(meta).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
  });
});
