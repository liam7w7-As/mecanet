import { workshopCostReportFixture } from './workshop-cost-report';

import type {
  WorkshopCommercialReviewRecord,
  WorkshopCommercialSnapshot,
  WorkshopPerformanceReport,
} from '@unithor/shared';

export const commercialSnapshotFixture: WorkshopCommercialSnapshot = {
  actualHours: 10,
  theoreticalNet: 20000,
  quotedNet: 15000,
  receivedNet: 7500,
  referenceHourlyRate: 2000,
  equivalentQuotedHours: 7.5,
  equivalentReceivedHours: 3.75,
  hoursDifference: -2.5,
  netDifference: -5000,
  actualCost: 10000,
  commercialMargin: 5000,
};
export const commercialReviewFixture: WorkshopCommercialReviewRecord = {
  id: 10,
  workOrderId: 40,
  workOrderItemId: 41,
  reason: 'descuento',
  note: 'Descuento autorizado',
  createdBy: 1,
  createdByName: 'Jefe de taller',
  createdAt: '2026-11-02T16:00:00Z',
  snapshot: { ...commercialSnapshotFixture, actualHours: 12 },
};
export const workshopPerformanceFixture: WorkshopPerformanceReport = {
  ...workshopCostReportFixture,
  filters: { ...workshopCostReportFixture.filters, groupBy: 'day' },
  options: {
    ...workshopCostReportFixture.options,
    vehicles: [{ id: 5, patente: 'ABCD12' }],
    services: [{ id: 41, description: 'Diagnóstico de motor', workOrderCodigo: 'OT-COST-40' }],
  },
  analysis: {
    utilization: {
      workers: 2,
      registeredHours: 2,
      regularHours: 1.5,
      extraHours: 0.5,
      scheduledHours: 16,
      unregisteredHours: 14,
      registeredPercent: 12.5,
    },
    efficiency: { estimatedHours: 2, actualHours: 2, percent: 100, deviationHours: 0 },
    quality: {
      reviewedServices: 2,
      firstPassApproved: 1,
      firstPassPercent: 50,
      rejections: 1,
      pendingServices: 1,
      reworkHours: 0.5,
    },
    commercial: {
      totals: commercialSnapshotFixture,
      services: [
        {
          ...commercialSnapshotFixture,
          workOrderId: 40,
          workOrderCodigo: 'OT-COST-40',
          workOrderItemId: 41,
          description: 'Diagnóstico de motor',
          patente: 'ABCD12',
          quotationId: 50,
          quotationCode: 'COT-50',
          latestReview: null,
        },
      ],
      reviews: [],
    },
    periods: [
      {
        key: '2026-11-01',
        label: '01/11/2026',
        registeredHours: 2,
        extraHours: 0.5,
        scheduledHours: 16,
        unregisteredHours: 14,
        utilizationPercent: 12.5,
      },
    ],
  },
};
