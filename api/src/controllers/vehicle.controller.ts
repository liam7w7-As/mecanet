import * as vehicleService from '../services/vehicle.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { CreateVehicleInput, UpdateVehicleInput, VehicleQueryInput } from '@unithor/shared';
import type { Request, Response } from 'express';

const getParamId = (req: Request): number => Number(req.params.id);

export const getVehiclesHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as VehicleQueryInput;
    const result = await vehicleService.listVehicles(query);
    res.status(200).json(result);
  },
);

export const getVehicleByIdHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const vehicle = await vehicleService.getVehicleById(getParamId(req));
    res.status(200).json({ vehicle });
  },
);

export const getVehicleByPatenteHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const vehicle = await vehicleService.getVehicleByPatente(String(req.params.patente));
    res.status(200).json({ vehicle });
  },
);

export const createVehicleHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const vehicle = await vehicleService.createVehicle(req.body as CreateVehicleInput);
    res.status(201).json({ vehicle });
  },
);

export const updateVehicleHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const vehicle = await vehicleService.updateVehicle(
      getParamId(req),
      req.body as UpdateVehicleInput,
    );
    res.status(200).json({ vehicle });
  },
);

export const deleteVehicleHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await vehicleService.deleteVehicle(getParamId(req));
    res.status(204).send();
  },
);
