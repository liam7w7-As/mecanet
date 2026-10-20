import { describe, expect, it } from 'vitest';

import { canUploadWorkOrderInspectionPhotos } from '../permissions';

import type { UserPublic } from '../../stores/auth.store';

const user: UserPublic = { id: 1, nombre: 'Vendedor', email: 'vendedor@example.com', role: 'vendedor', permissions: [{ modulo: 'taller', accion: 'read' }] };

describe('Work order inspection photo upload access', () => {
  it('allows a salesperson to upload without workshop update permission', () => {
    expect(canUploadWorkOrderInspectionPhotos(user)).toBe(true);
  });
  it('requires workshop access for the salesperson', () => {
    expect(canUploadWorkOrderInspectionPhotos({ ...user, permissions: [] })).toBe(false);
  });
  it('does not give another reader or a mechanic permission to upload', () => {
    expect(canUploadWorkOrderInspectionPhotos({ ...user, role: 'finanzas' })).toBe(false);
    expect(canUploadWorkOrderInspectionPhotos({ ...user, role: 'mecanico', permissions: [{ modulo: 'taller', accion: 'update' }] })).toBe(false);
  });
  it('retains management upload access and rejects anonymous users', () => {
    expect(canUploadWorkOrderInspectionPhotos({ ...user, role: 'jefe', permissions: [{ modulo: 'taller', accion: 'update' }] })).toBe(true);
    expect(canUploadWorkOrderInspectionPhotos({ ...user, role: 'admin', permissions: [] })).toBe(true);
    expect(canUploadWorkOrderInspectionPhotos(null)).toBe(false);
  });
});
