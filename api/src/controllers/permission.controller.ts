import * as permissionService from '../services/permission.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { Request, Response } from 'express';

const getRoleId = (req: Request): number => Number(req.params.id);

export const getRolesHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const roles = await permissionService.listAllRoles();
    res.status(200).json({ roles });
  },
);

export const getPermissionsHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const permissions = await permissionService.listAllPermissions();
    res.status(200).json({ permissions });
  },
);

export const getRolePermissionsHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const permissions = await permissionService.getRolePermissions(getRoleId(req));
    res.status(200).json({ permissions });
  },
);

export const updateRolePermissionsHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const roleId = getRoleId(req);
    const body = req.body as { roleId: number; permissionIds: number[] };

    if (body.roleId !== roleId) {
      throw ApiError.badRequest('El roleId del body debe coincidir con el parámetro de ruta');
    }

    const permissions = await permissionService.updateRolePermissions(
      roleId,
      body.permissionIds,
    );

    res.status(200).json({ permissions });
  },
);
