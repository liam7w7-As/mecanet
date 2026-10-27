import { describe, expect, it } from 'vitest';
import { supplierQuerySchema, updateSupplierSchema } from '../supplier.schema.js';
describe('updateSupplierSchema', () => {
    it('normaliza RUT, email y textos de contacto', () => {
        const parsed = updateSupplierSchema.parse({
            nombre: '  Proveedor Nuevo  ',
            rut: '76.543.210-9',
            email: '  CONTACTO@Example.COM ',
            telefono: ' +56 9 8765 4321 ',
            direccion: '  Av. Siempre Viva 742  ',
        });
        expect(parsed).toEqual({
            nombre: 'Proveedor Nuevo',
            rut: '765432109',
            email: 'contacto@example.com',
            telefono: '+56 9 8765 4321',
            direccion: 'Av. Siempre Viva 742',
        });
    });
    it('permite guardar campos opcionales vacíos como null', () => {
        expect(updateSupplierSchema.parse({
            rut: '',
            telefono: '',
            email: '',
            direccion: '',
            contactoNombre: '',
            notas: '',
        })).toEqual({
            rut: null,
            telefono: null,
            email: null,
            direccion: null,
            contactoNombre: null,
            notas: null,
        });
    });
    it('rechaza un RUT con formato inválido y un email mal formado', () => {
        expect(updateSupplierSchema.safeParse({ rut: 'ABC' }).success).toBe(false);
        expect(updateSupplierSchema.safeParse({ email: 'sin-arroba' }).success).toBe(false);
    });
    it('exige al menos un campo para actualizar', () => {
        expect(updateSupplierSchema.safeParse({}).success).toBe(false);
    });
});
describe('supplierQuerySchema', () => {
    it('interpreta el filtro de datos incompletos y pagina por defecto', () => {
        expect(supplierQuerySchema.parse({ soloIncompletos: 'true' })).toMatchObject({
            page: 1,
            pageSize: 20,
            soloIncompletos: true,
        });
        expect(supplierQuerySchema.parse({ soloIncompletos: '0' }).soloIncompletos).toBe(false);
    });
});
