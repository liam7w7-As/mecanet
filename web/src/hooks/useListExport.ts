import { LIST_EXPORT_POLICIES } from '@unithor/shared';
import axios from 'axios';
import { useRef, useState } from 'react';

import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/api-error';
import { hasUserPermission } from '../lib/permissions';
import { useAuthStore } from '../stores/auth.store';
import { notifyError, notifySuccess } from '../stores/toast.store';

import type { UserPublic } from '../stores/auth.store';
import type { ListExportFormat, ListExportTarget } from '@unithor/shared';

export const canExportList = (user: UserPublic | null, target: ListExportTarget): boolean => {
  if (!user) return false;
  const policy = LIST_EXPORT_POLICIES[target];
  if (policy.roles && !policy.roles.includes(user.role)) return false;
  return (
    policy.read.some((area) => hasUserPermission(user, area, 'read')) &&
    policy.export.some((area) => hasUserPermission(user, area, 'export'))
  );
};

/** Pagination belongs to the table only; exports include the whole filtered result. */
export const listExportParams = (
  filters: object,
  includeOwner?: boolean,
): Record<string, string | number | boolean> => {
  const params: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(filters) as [string, unknown][]) {
    if (
      ['page', 'pageSize', 'userId', 'role', 'includeOwner'].includes(key) ||
      value === undefined ||
      value === null ||
      value === ''
    )
      continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
      params[key] = value;
  }
  if (includeOwner !== undefined) params.includeOwner = includeOwner;
  return params;
};

const exportErrorMessage = async (error: unknown): Promise<string> => {
  if (axios.isAxiosError<Blob>(error) && error.response?.data instanceof Blob) {
    try {
      const body: unknown = JSON.parse(await error.response.data.text());
      if (
        body &&
        typeof body === 'object' &&
        'error' in body &&
        body.error &&
        typeof body.error === 'object' &&
        'message' in body.error &&
        typeof body.error.message === 'string'
      ) {
        return body.error.message;
      }
    } catch {
      /* The API can also return a proxy error page. */
    }
  }
  return getApiErrorMessage(error, 'No se pudo exportar el listado. Intenta nuevamente.');
};

export const useListExport = (
  target: ListExportTarget,
  filters: object,
  includeOwner?: boolean,
) => {
  const user = useAuthStore((state) => state.user);
  const [pendingFormat, setPendingFormat] = useState<ListExportFormat | null>(null);
  const pending = useRef(false);
  const allowed = canExportList(user, target);
  const exportList = async (format: ListExportFormat): Promise<void> => {
    if (pending.current || !canExportList(useAuthStore.getState().user, target)) return;
    const actor = useAuthStore.getState().user;
    // Open during the click event so browsers/PWA do not block the PDF after await.
    const pdfWindow = format === 'pdf' ? window.open('about:blank', '_blank') : null;
    if (format === 'pdf' && !pdfWindow) {
      notifyError(
        'Permite abrir pestañas emergentes para visualizar el PDF y vuelve a intentarlo.',
      );
      return;
    }
    if (pdfWindow) pdfWindow.opener = null;
    pending.current = true;
    setPendingFormat(format);
    try {
      const response = await api.get<Blob>(`/exports/${target}/${format}`, {
        params: listExportParams(filters, includeOwner),
        responseType: 'blob',
      });
      const current = useAuthStore.getState().user;
      if (
        current?.id !== actor?.id ||
        current?.role !== actor?.role ||
        !canExportList(current, target)
      ) {
        pdfWindow?.close();
        return;
      }
      const expectedType =
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const responseType = String(response.headers['content-type'] ?? response.data.type);
      if (!responseType.includes(expectedType) || !response.data.size)
        throw new Error('Respuesta de exportación inválida');
      const objectUrl = URL.createObjectURL(response.data);
      if (pdfWindow && !pdfWindow.closed) {
        pdfWindow.location.href = objectUrl;
      } else if (format === 'excel') {
        const link = document.createElement('a');
        link.href = objectUrl;
        const suggested = String(response.headers['content-disposition'] ?? '').match(
          /filename="([^"/\\]+)"/i,
        )?.[1];
        link.download =
          suggested ?? `UNITHOR-${target}-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      window.setTimeout(
        () => URL.revokeObjectURL(objectUrl),
        format === 'pdf' ? 5 * 60_000 : 30_000,
      );
      notifySuccess(
        format === 'pdf'
          ? 'PDF abierto en otra pestaña con los filtros actuales.'
          : 'Excel exportado con los filtros actuales.',
      );
    } catch (error) {
      pdfWindow?.close();
      if (useAuthStore.getState().user?.id === actor?.id)
        notifyError(await exportErrorMessage(error));
    } finally {
      pending.current = false;
      setPendingFormat(null);
    }
  };
  return { allowed, pendingFormat, exportList };
};
