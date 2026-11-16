import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { laborKeys } from './useWorkOrderLabor';
import { workOrderKeys } from './useWorkOrders';
import { api } from '../lib/api';
import { hasUserPermission } from '../lib/permissions';
import { useAuthStore } from '../stores/auth.store';

import type { WorkOrder, WorkOrderWorksheet, WorkOrderWorksheetItem } from '../types/entities';
import type { ItemOperationalStatus, WorkOrderStatus } from '@unithor/shared';

export type WorkOrderQualityStatus = 'pendiente' | 'aprobado' | 'rechazado';

export interface WorkOrderQualityItem {
  id: number;
  descripcion: string;
  tipoLinea: WorkOrderWorksheetItem['tipoLinea'];
  estadoOperativo: ItemOperationalStatus;
  qualityStatus: WorkOrderQualityStatus;
  qualityReviewedAt: string | null;
  qualityReviewedBy: number | null;
  qualityNote: string | null;
}

export interface WorkOrderQualityHistoryEntry {
  id: number;
  workOrderItemId: number | null;
  decision: 'aprobado' | 'rechazado';
  reviewedBy: number | null;
  reviewerName: string;
  note: string | null;
  createdAt: string;
}

export interface WorkOrderQuality {
  workOrderId: number;
  estado: WorkOrderStatus;
  approvedAt: string | null;
  approvedBy: number | null;
  approvalNote: string | null;
  canConfirm: boolean;
  items: WorkOrderQualityItem[];
  history: WorkOrderQualityHistoryEntry[];
}

export interface WorkOrderQualityResponse { quality: WorkOrderQuality }
export interface WorkOrderQualityTeamMember { userId: number; specialtyId?: number | null; estimatedHours: number | null }
export type ReviewWorkOrderItemQualityInput =
  | { decision: 'aprobar'; nota?: string | null }
  | { decision: 'rechazar'; nota: string; members?: WorkOrderQualityTeamMember[] };
export interface ConfirmWorkOrderQualityInput { notas?: string | null }

const viewerKey = (): string => {
  const user = useAuthStore.getState().user;
  return `${user?.id ?? 'anonymous'}:${user?.role ?? 'none'}:${JSON.stringify(user?.permissions ?? null)}`;
};

export const workOrderQualityKeys = {
  all: ['work-order-quality'] as const,
  detail: (id: number) => ['work-order-quality', id] as const,
  viewer: (id: number, viewer: string) => ['work-order-quality', id, viewer] as const,
};

export const useWorkOrderQuality = (id: number, enabled = true) => {
  const user = useAuthStore((state) => state.user);
  const allowed = Boolean(user && ['desarrollador', 'admin', 'jefe', 'mecanico'].includes(user.role) && hasUserPermission(user, 'taller', 'read'));
  const identity = `${id}:${user?.id ?? 'anonymous'}:${user?.role ?? 'none'}`;
  const query = useQuery({
    queryKey: workOrderQualityKeys.viewer(id, viewerKey()),
    queryFn: async () => (await api.get<WorkOrderQualityResponse>(`/work-orders/${id}/quality`)).data.quality,
    enabled: enabled && allowed && Number.isInteger(id) && id > 0,
    meta: { qualityViewer: identity },
    // A permission refresh must not unmount the same viewer's in-progress drafts.
    placeholderData: (previous, previousQuery) => previousQuery?.meta?.qualityViewer === identity ? previous : undefined,
    refetchInterval: 30_000,
  });
  return { ...query, data: allowed ? query.data : undefined };
};

const requireQualityReviewer = (): void => {
  const user = useAuthStore.getState().user;
  if (!user || !['desarrollador', 'admin', 'jefe'].includes(user.role) || !hasUserPermission(user, 'taller', 'update')) {
    throw new Error('No tienes permiso para revisar la calidad de esta orden.');
  }
};

const useQualityMutation = <Input extends { id: number }>(request: (input: Input) => Promise<WorkOrderQuality>) => {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ['work-order-quality', 'mutation'],
    mutationFn: async (input: Input) => { requireQualityReviewer(); return request(input); },
    onSuccess: (quality, input) => {
      client.setQueryData(workOrderQualityKeys.viewer(input.id, viewerKey()), quality);
      const orderFields = { estado: quality.estado, qualityApprovedAt: quality.approvedAt, qualityApprovedBy: quality.approvedBy, qualityApprovalNote: quality.approvalNote };
      const updateItems = <T extends { id: number }>(items: T[]): T[] => items.map((item) => {
        const review = quality.items.find((entry) => entry.id === item.id);
        if (!review) return item;
        return { ...item, estadoOperativo: review.estadoOperativo, qualityStatus: review.qualityStatus, qualityReviewedAt: review.qualityReviewedAt, qualityReviewedBy: review.qualityReviewedBy, qualityNote: review.qualityNote };
      });
      // This prefix also reaches the restricted mechanic cache used by useManagedWorkOrder.
      client.setQueriesData<WorkOrder>({ queryKey: workOrderKeys.detail(input.id) }, (saved) => saved ? { ...saved, ...orderFields, ...(saved.items ? { items: updateItems(saved.items) } : {}) } : saved);
      client.setQueriesData<WorkOrderWorksheet>({ queryKey: laborKeys.worksheet(input.id) }, (saved) => saved ? {
        ...saved, workOrder: { ...saved.workOrder, ...orderFields }, items: updateItems(saved.items), servicios: updateItems(saved.servicios), repuestos: updateItems(saved.repuestos),
      } : saved);
      for (const queryKey of [workOrderQualityKeys.detail(input.id), ['work-order-labor'], ['work-orders'], ['quotations'], ['dashboard'], ['workshop-time']]) {
        void client.invalidateQueries({ queryKey });
      }
    },
  });
};

export const useReviewWorkOrderItemQualityMutation = () => useQualityMutation(
  async ({ id, itemId, data }: { id: number; itemId: number; data: ReviewWorkOrderItemQualityInput }) => (
    await api.post<WorkOrderQualityResponse>(`/work-orders/${id}/items/${itemId}/quality`, data)
  ).data.quality,
);

export const useConfirmWorkOrderQualityMutation = () => useQualityMutation(
  async ({ id, data }: { id: number; data?: ConfirmWorkOrderQualityInput }) => (
    await api.post<WorkOrderQualityResponse>(`/work-orders/${id}/quality/confirm`, data ?? {})
  ).data.quality,
);
