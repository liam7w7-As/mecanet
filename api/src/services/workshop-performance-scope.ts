import { calculateWorkshopCostReport } from './workshop-cost-report.calculator.js';

import type { CostReportAssignment, CostReportItem, CostReportSession } from './workshop-cost-report.calculator.js';
import type { WorkshopPerformanceFilters } from '@unithor/shared';

type ScopedItem = CostReportItem & { catalogItemId: number | null };

export function calculateFilteredReport(
  filters: WorkshopPerformanceFilters,
  source: { items: ScopedItem[]; assignments: CostReportAssignment[]; sessions: CostReportSession[] },
  start: Date, end: Date, now: Date,
) {
  const search = filters.search?.toLocaleLowerCase();
  const selectedItemIds = source.items.filter((item) => {
    const members = source.assignments.filter((row) => row.workOrderItemId === item.id && row.createdAt <= now);
    if (filters.userId && !(members.some((member) => member.userId === filters.userId && (!filters.specialtyId || member.specialtyId === filters.specialtyId)) ||
      (!members.length && item.assignedUserId === filters.userId && !filters.specialtyId))) return false;
    if (filters.specialtyId && !members.some((member) => member.specialtyId === filters.specialtyId && (!filters.userId || member.userId === filters.userId))) return false;
    if (search && ![item.descripcion, item.workOrder?.codigo, item.workOrder?.vehicle?.patente,
      ...members.flatMap((member) => [member.userName, member.specialtyName])].some((value) => value?.toLocaleLowerCase().includes(search))) return false;
    return true;
  }).map((item) => item.id);
  const selected = new Set(selectedItemIds);
  const report = calculateWorkshopCostReport(filters, { ...source, items: source.items.filter((item) => selected.has(item.id)) }, start, end, now, { includeWithoutActivity: true });
  return { ...report, selectedItemIds,
    sessionKeys: new Set(report.rows.map((row) => row.key)) };
}
