import { z } from 'zod';
import { WORK_ORDER_STATUS } from '../constants/work-order-status.js';
/** Internal reporting only. Grants cannot opt a mechanic or salesperson into costs. */
export const WORKSHOP_COST_REPORT_ROLES = ['admin', 'desarrollador', 'jefe', 'finanzas'];
export const isWorkshopCostReportRole = (role) => WORKSHOP_COST_REPORT_ROLES.some((allowed) => allowed === role);
const today = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
}).format(new Date());
export const workshopCostReportQuerySchema = z
    .object({
    fechaDesde: z
        .string()
        .date()
        .default(() => `${today().slice(0, 7)}-01`),
    fechaHasta: z.string().date().default(today),
    workOrderId: z.coerce.number().int().positive().optional(),
    userId: z.coerce.number().int().positive().optional(),
    specialtyId: z.coerce.number().int().positive().optional(),
    estado: z.enum(WORK_ORDER_STATUS).optional(),
    search: z.string().trim().max(120).optional(),
})
    .strict()
    .refine((filters) => filters.fechaDesde <= filters.fechaHasta, {
    message: 'La fecha desde no puede ser posterior a la fecha hasta',
    path: ['fechaHasta'],
});
