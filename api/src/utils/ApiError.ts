export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES] | string;

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(
    message = 'Solicitud inválida',
    details?: unknown,
    code: string = ERROR_CODES.BAD_REQUEST,
  ): ApiError {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(
    message = 'No autenticado',
    code: string = ERROR_CODES.UNAUTHORIZED,
  ): ApiError {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'Acceso denegado', code: string = ERROR_CODES.FORBIDDEN): ApiError {
    return new ApiError(403, code, message);
  }

  static notFound(
    message = 'Recurso no encontrado',
    code: string = ERROR_CODES.NOT_FOUND,
  ): ApiError {
    return new ApiError(404, code, message);
  }

  static conflict(
    message = 'Conflicto con el recurso actual',
    code: string = ERROR_CODES.CONFLICT,
    details?: unknown,
  ): ApiError {
    return new ApiError(409, code, message, details);
  }

  static unprocessable(
    message = 'Entidad no procesable',
    details?: unknown,
    code: string = ERROR_CODES.UNPROCESSABLE_ENTITY,
  ): ApiError {
    return new ApiError(422, code, message, details);
  }

  static internal(
    message = 'Error interno del servidor',
    code: string = ERROR_CODES.INTERNAL_SERVER_ERROR,
  ): ApiError {
    return new ApiError(500, code, message);
  }
}
