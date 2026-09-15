import axios from 'axios';

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export const isApiConflict = (error: unknown): boolean =>
  axios.isAxiosError<ApiErrorBody>(error) && error.response?.status === 409;

export const getApiErrorMessage = (
  error: unknown,
  fallback = 'No fue posible completar la operación',
): string => {
  if (!axios.isAxiosError<ApiErrorBody>(error)) {
    return fallback;
  }

  if (!error.response) {
    return 'No se pudo conectar con el servidor. Intente nuevamente.';
  }

  return error.response.data?.error?.message ?? fallback;
};
