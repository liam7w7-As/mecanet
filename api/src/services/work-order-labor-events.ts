import { WorkOrderItemProgressEvent } from '../models/WorkOrderItemProgressEvent.js';

import type { ItemOperationalStatus } from '@unithor/shared';
import type { Transaction } from 'sequelize';

export type ItemProgressEventSource = 'check' | 'reverso' | 'ajuste' | 'migracion';

export interface ItemProgressEventInput {
  workOrderId: number;
  workOrderItemId: number | null;
  itemDescripcion: string;
  fromStatus: ItemOperationalStatus | null;
  toStatus: ItemOperationalStatus;
  performedByUserId: number | null;
  assignedUserId: number | null;
  horasEstimadas?: number | null;
  horasReales?: number | null;
  horasDelta?: number;
  fechaEfectiva?: string;
  progressReportId?: number | null;
  sessionId?: number | null;
  source?: ItemProgressEventSource;
  note?: string | null;
}

export const roundHours = (value: number): number => Math.round(value * 100) / 100;

export const minutesToHours = (minutes: number): number =>
  roundHours(Math.max(0, minutes) / 60);

export const toDateOnly = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const recordItemProgressEvent = async (
  input: ItemProgressEventInput,
  transaction: Transaction,
): Promise<void> => {
  await WorkOrderItemProgressEvent.create(
    {
      workOrderId: input.workOrderId,
      workOrderItemId: input.workOrderItemId,
      itemDescripcion: input.itemDescripcion.slice(0, 255),
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      performedByUserId: input.performedByUserId,
      assignedUserId: input.assignedUserId,
      horasEstimadas: input.horasEstimadas ?? null,
      horasReales: input.horasReales ?? null,
      horasDelta: input.horasDelta ?? 0,
      fechaEfectiva: input.fechaEfectiva ?? toDateOnly(),
      progressReportId: input.progressReportId ?? null,
      sessionId: input.sessionId ?? null,
      source: input.source ?? 'check',
      note: input.note ?? null,
      createdAt: new Date(),
    },
    { transaction },
  );
};
