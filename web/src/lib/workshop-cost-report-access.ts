import { isWorkshopCostReportRole } from '@unithor/shared';

import { hasUserPermission } from './permissions';

import type { UserPublic } from '../stores/auth.store';

export const canReadWorkshopCosts = (user: UserPublic | null): boolean =>
  Boolean(
    user &&
    isWorkshopCostReportRole(user.role) &&
    (hasUserPermission(user, 'taller', 'read') || hasUserPermission(user, 'finanzas', 'read')),
  );

export const canExportWorkshopCosts = (user: UserPublic | null): boolean =>
  Boolean(
    user &&
    canReadWorkshopCosts(user) &&
    (['taller', 'finanzas'] as const).some(
      (module) =>
        hasUserPermission(user, module, 'read') && hasUserPermission(user, module, 'export'),
    ),
  );
