import { describe, expect, it } from 'vitest';
import { salesAccessRecordsQuerySchema, updateSalesAccessSchema } from '../sales-access.schema.js';
describe('Sales access save contract', () => {
    it('requires a nonempty selected batch and deduplicates by kind and ID', () => {
        expect(updateSalesAccessSchema.safeParse({ mode: 'selected' }).success).toBe(false);
        expect(updateSalesAccessSchema.safeParse({ mode: 'selected', records: [] }).success).toBe(false);
        const first = { scopeType: 'work_order', targetId: 1 };
        const second = { scopeType: 'quotation', targetId: 1 };
        expect(updateSalesAccessSchema.parse({ mode: 'selected', records: [first, first, second] }).records).toEqual([first, second]);
    });
    it('rejects unknown keys, coerced body IDs and oversized raw batches', () => {
        for (const value of [
            { mode: 'own', salesAccessAll: true },
            { mode: 'selected', records: [{ scopeType: 'work_order', targetId: '1' }] },
            { mode: 'selected', records: [{ scopeType: 'work_order', targetId: 1, expiresAt: null }] },
            { mode: 'selected', records: Array.from({ length: 501 }, () => ({ scopeType: 'quotation', targetId: 1 })) },
        ])
            expect(updateSalesAccessSchema.safeParse(value).success).toBe(false);
        expect(updateSalesAccessSchema.parse({ mode: 'all' })).toEqual({ mode: 'all' });
        expect(updateSalesAccessSchema.parse({ mode: 'own' })).toEqual({ mode: 'own' });
    });
    it('defaults picker pagination and bounds search and page size', () => {
        expect(salesAccessRecordsQuerySchema.parse({ scopeType: 'quotation' })).toEqual({ scopeType: 'quotation', page: 1, pageSize: 10 });
        expect(salesAccessRecordsQuerySchema.parse({ scopeType: 'work_order', search: '  plate  ', page: '2', pageSize: '20' }))
            .toEqual({ scopeType: 'work_order', search: 'plate', page: 2, pageSize: 20 });
        expect(salesAccessRecordsQuerySchema.safeParse({ scopeType: 'quotation', pageSize: 21 }).success).toBe(false);
        expect(salesAccessRecordsQuerySchema.safeParse({ scopeType: 'quotation', search: 'x'.repeat(101) }).success).toBe(false);
    });
});
