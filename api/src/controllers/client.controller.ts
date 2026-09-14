import * as clientService from '../services/client.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { ClientQueryInput, CreateClientInput, UpdateClientInput } from '@unithor/shared';
import type { Request, Response } from 'express';

const getParamId = (req: Request): number => Number(req.params.id);

const shouldIncludeVehicles = (req: Request): boolean => {
  return req.query.includeVehicles === 'true';
};

export const getClientsHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as ClientQueryInput;
    const result = await clientService.listClients(query);
    res.status(200).json(result);
  },
);

export const getClientByIdHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const client = await clientService.getClientById(getParamId(req), shouldIncludeVehicles(req));
    res.status(200).json({ client });
  },
);

export const createClientHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const client = await clientService.createClient(req.body as CreateClientInput);
    res.status(201).json({ client });
  },
);

export const updateClientHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const client = await clientService.updateClient(
      getParamId(req),
      req.body as UpdateClientInput,
    );
    res.status(200).json({ client });
  },
);

export const deleteClientHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await clientService.deleteClient(getParamId(req));
    res.status(204).send();
  },
);
