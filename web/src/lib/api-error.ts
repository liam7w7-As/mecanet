import axios, { AxiosError } from 'axios';

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

/** Downloads return error bodies as Blob too; keep the API's useful message. */
export const normalizeBlobApiError = async (error: unknown): Promise<unknown> => {
  if (!axios.isAxiosError<unknown>(error) || !(error.response?.data instanceof Blob)) return error;
  try {
    const body: unknown = JSON.parse(await error.response.data.text());
    if (body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object' && 'message' in body.error && typeof body.error.message === 'string') {
      return new AxiosError(error.message, error.code, error.config, error.request, {
        ...error.response, data: { error: { message: body.error.message } },
      });
    }
  } catch { /* A proxy error may be HTML instead of JSON. */ }
  return error;
};

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
