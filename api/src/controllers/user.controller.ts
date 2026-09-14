import * as userService from '../services/user.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { CreateUserInput, UpdateUserInput, UserQueryInput } from '@unithor/shared';
import type { Request, Response } from 'express';

const getCurrentUserId = (req: Request): number => {
  if (!req.user) {
    throw ApiError.unauthorized('No autenticado');
  }
  return req.user.id;
};

const getParamId = (req: Request): number => Number(req.params.id);

export const getUsersHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as UserQueryInput;
    const result = await userService.listUsers(query);
    res.status(200).json(result);
  },
);

export const getUserHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await userService.getUserById(getParamId(req));
    res.status(200).json({ user });
  },
);

export const createUserHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await userService.createUser(req.body as CreateUserInput);
    res.status(201).json({ user });
  },
);

export const updateUserHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = getParamId(req);
    const currentUserId = getCurrentUserId(req);
    const data = req.body as UpdateUserInput;

    if (id === currentUserId && data.activo === false) {
      throw ApiError.badRequest('Un usuario no puede desactivarse a sí mismo');
    }

    const user = await userService.updateUser(id, data);
    res.status(200).json({ user });
  },
);

export const deleteUserHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await userService.deleteUser(getParamId(req), getCurrentUserId(req));
    res.status(204).send();
  },
);

export const toggleStatusHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await userService.toggleUserStatus(
      getParamId(req),
      (req.body as { activo: boolean }).activo,
      getCurrentUserId(req),
    );
    res.status(200).json({ user });
  },
);
