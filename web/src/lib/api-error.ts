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

export const getApiFieldErrors = (error: unknown): Record<string, string> => {
  if (!axios.isAxiosError<ApiErrorBody>(error)) return {};
  const details: unknown = error.response?.data?.error?.details;
  if (!Array.isArray(details)) return {};
  const fields: Record<string, string> = {};
  for (const detail of details as unknown[]) {
    if (typeof detail !== 'object' || detail === null) continue;
    if (
      'field' in detail &&
      'message' in detail &&
      typeof detail.field === 'string' &&
      typeof detail.message === 'string'
    ) {
      fields[detail.field] ??= detail.message;
    }
  }
  return fields;
};

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
