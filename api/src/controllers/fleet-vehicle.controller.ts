import * as fleetVehicleService from '../services/fleet-vehicle.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type {
  CreateFleetVehicleInput,
  FleetVehicleQueryInput,
  UpdateFleetVehicleInput,
} from '@unithor/shared';
import type { Request, Response } from 'express';

const getParamId = (req: Request): number => Number(req.params.id);

export const getFleetVehiclesHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as FleetVehicleQueryInput;
    const result = await fleetVehicleService.listFleetVehicles(query, req.user?.role);
    res.status(200).json(result);
  },
);

export const getFleetVehicleByIdHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const fleetVehicle = await fleetVehicleService.getFleetVehicleById(getParamId(req), req.user?.role);
    res.status(200).json({ fleetVehicle });
  },
);

export const createFleetVehicleHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const fleetVehicle = await fleetVehicleService.createFleetVehicle(
      req.body as CreateFleetVehicleInput,
      req.user?.role,
    );
    res.status(201).json({ fleetVehicle });
  },
);

export const updateFleetVehicleHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const fleetVehicle = await fleetVehicleService.updateFleetVehicle(
      getParamId(req),
      req.body as UpdateFleetVehicleInput,
      req.user?.role,
    );
    res.status(200).json({ fleetVehicle });
  },
);

export const deleteFleetVehicleHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await fleetVehicleService.deleteFleetVehicle(getParamId(req));
    res.status(200).json({ message: 'Vehículo de flota eliminado' });
  },
);
