import { describe, expect, it } from 'vitest';

import { ApiError } from '../ApiError.js';

describe('ApiError', () => {
  it('instancia un ApiError con statusCode, code y message personalizados', () => {
    const error = new ApiError(418, 'TEAPOT', "I'm a teapot", { extra: 'sugar' });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(418);
    expect(error.code).toBe('TEAPOT');
    expect(error.message).toBe("I'm a teapot");
    expect(error.details).toEqual({ extra: 'sugar' });
  });

  it('badRequest crea un error 400 con código BAD_REQUEST por defecto', () => {
    const error = ApiError.badRequest('Datos inválidos', [{ field: 'name' }], 'CUSTOM_BAD_REQ');

    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Datos inválidos');
    expect(error.code).toBe('CUSTOM_BAD_REQ');
    expect(error.details).toEqual([{ field: 'name' }]);
  });

  it('unauthorized crea un error 401', () => {
    const error = ApiError.unauthorized('No autenticado');

    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.message).toBe('No autenticado');
  });

  it('forbidden crea un error 403', () => {
    const error = ApiError.forbidden();

    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
    expect(error.message).toBe('Acceso denegado');
  });

  it('notFound crea un error 404', () => {
    const error = ApiError.notFound('Recurso no encontrado');

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Recurso no encontrado');
  });

  it('conflict crea un error 409', () => {
    const error = ApiError.conflict('El registro ya existe');

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
    expect(error.message).toBe('El registro ya existe');
  });

  it('unprocessable crea un error 422', () => {
    const error = ApiError.unprocessable('Entidad no procesable');

    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('UNPROCESSABLE_ENTITY');
  });

  it('internal crea un error 500', () => {
    const error = ApiError.internal('Fallo inesperado');

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(error.message).toBe('Fallo inesperado');
  });
});
