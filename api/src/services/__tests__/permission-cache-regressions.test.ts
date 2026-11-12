import { afterEach, describe, expect, it, vi } from 'vitest';

// The DB-backed runner registers the models; the race itself uses deferred reads.
import '../../config/database.js';
import { Permission } from '../../models/Permission.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { hasPermission, invalidatePermissionCache } from '../permission.service.js';

describe('Phase 7 permission cache invalidation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    invalidatePermissionCache();
  });

  it.each([false, true])('does not restore a revoked grant after invalidation (all=%s)', async (all) => {
    invalidatePermissionCache();
    const role = Role.build({ id: 70001, nombre: 'vendedor', descripcion: null });
    role.permissions = [Permission.build({ id: 70001, modulo: 'admin', accion: 'update' })];
    const currentRole = Role.build({ id: role.id, nombre: role.nombre, descripcion: null });
    currentRole.permissions = [];
    const user = User.build({ id: 70001, nombre: 'Cache User', email: 'cache@unithor.local', passwordHash: 'unused', roleId: role.id, activo: true });
    user.role = role;
    vi.spyOn(User, 'findByPk').mockResolvedValue(user);
    let release!: (value: Role) => void;
    let started!: () => void;
    const startedRead = new Promise<void>((resolve) => { started = resolve; });
    const oldRead = new Promise<Role>((resolve) => { release = resolve; });
    vi.spyOn(Role, 'findOne')
      .mockImplementationOnce(() => { started(); return oldRead; })
      .mockResolvedValue(currentRole);

    const pending = hasPermission(user.id, 'admin', 'update');
    await startedRead;
    invalidatePermissionCache(all ? undefined : role.id);
    release(role);

    expect(await pending).toBe(false);
    expect(await hasPermission(user.id, 'admin', 'update')).toBe(false);
  });
});
