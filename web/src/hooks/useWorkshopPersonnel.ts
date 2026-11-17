import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';
import { hasUserPermission } from '../lib/permissions';
import { useAuthStore } from '../stores/auth.store';

import type {
  WorkshopPersonnelConfig, WorkshopSpecialty, WorkshopSpecialtyRate, WorkshopWorkerProfile,
  WorkshopScheduleConfig, WorkshopShiftException, CreateSpecialtyInput, UpdateSpecialtyInput,
  CreateSpecialtyRateInput, UpdateWorkerSpecialtiesInput, UpdateWorkshopScheduleInput, CreateWorkshopScheduleExceptionInput,
} from '@unithor/shared';

export const workshopPersonnelKeys = {
  all: ['workshop-personnel'] as const,
  config: (viewer: string) => ['workshop-personnel', 'config', viewer] as const,
};

/** Role and permission scoped cache prevents configuration prices leaking across sessions. */
export const useWorkshopPersonnel = (enabled = true) => {
  const user = useAuthStore((state) => state.user);
  const allowed = Boolean(user && ['desarrollador', 'admin', 'jefe'].includes(user.role) && hasUserPermission(user, 'taller', 'read'));
  const viewer = `${user?.id ?? 'anonymous'}:${user?.role ?? 'none'}:${JSON.stringify(user?.permissions ?? null)}`;
  const query = useQuery({
    queryKey: workshopPersonnelKeys.config(viewer),
    queryFn: async ({ signal }) => (await api.get<WorkshopPersonnelConfig>('/workshop-personnel/config', { signal })).data,
    enabled: enabled && allowed,
    staleTime: 30_000,
  });
  return { ...query, data: allowed ? query.data : undefined };
};

const usePersonnelMutation = <Input, Output>(request: (input: Input) => Promise<Output>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workshopPersonnelKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['work-orders'] }),
        queryClient.invalidateQueries({ queryKey: ['work-order-labor'] }),
        queryClient.invalidateQueries({ queryKey: ['workshop-time'] }),
      ]);
    },
  });
};

export const useCreateWorkshopSpecialty = () => usePersonnelMutation<CreateSpecialtyInput, WorkshopSpecialty>(async (input) =>
  (await api.post<WorkshopSpecialty>('/workshop-personnel/specialties', input)).data);
export const useUpdateWorkshopSpecialty = () => usePersonnelMutation<{ id: number; input: UpdateSpecialtyInput }, WorkshopSpecialty>(async ({ id, input }) =>
  (await api.patch<WorkshopSpecialty>(`/workshop-personnel/specialties/${id}`, input)).data);
export const useSeedWorkshopSpecialties = () => usePersonnelMutation<void, WorkshopSpecialty[]>(async () =>
  (await api.post<WorkshopSpecialty[]>('/workshop-personnel/specialties/seed', {})).data);
export const useAppendWorkshopSpecialtyRate = () => usePersonnelMutation<{ specialtyId: number; input: CreateSpecialtyRateInput }, WorkshopSpecialtyRate>(async ({ specialtyId, input }) =>
  (await api.post<WorkshopSpecialtyRate>(`/workshop-personnel/specialties/${specialtyId}/rates`, input)).data);
export const useUpdateWorkerSpecialties = () => usePersonnelMutation<{ userId: number; input: UpdateWorkerSpecialtiesInput }, WorkshopWorkerProfile>(async ({ userId, input }) =>
  (await api.put<WorkshopWorkerProfile>(`/workshop-personnel/workers/${userId}/profile`, input)).data);
export const useUpdateWorkshopSchedule = () => usePersonnelMutation<UpdateWorkshopScheduleInput, WorkshopScheduleConfig>(async (input) =>
  (await api.put<WorkshopScheduleConfig>('/workshop-personnel/schedule', input)).data);
export const useAppendWorkshopShiftException = () => usePersonnelMutation<{ userId: number; input: CreateWorkshopScheduleExceptionInput }, WorkshopShiftException>(async ({ userId, input }) =>
  (await api.post<WorkshopShiftException>(`/workshop-personnel/workers/${userId}/exceptions`, input)).data);
