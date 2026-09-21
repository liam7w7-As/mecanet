import * as inspectionPhotoService from '../services/work-order-inspection-photo.service.js';
import { generateWorkOrderPdf } from '../services/work-order-pdf.service.js';
import { generateWorkOrderReceptionPdf } from '../services/work-order-reception-pdf.service.js';
import * as workOrderService from '../services/work-order.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  ChangeWorkOrderStatusInput,
  DeliverWorkOrderInput,
  WorkOrderQueryInput,
  WorkOrderInspectionPhotoSlot,
} from '@unithor/shared';
import type { Request, Response } from 'express';

const getParamId = (req: Request): number => Number(req.params.id);

const getPhotoSlot = (req: Request): WorkOrderInspectionPhotoSlot =>
  req.params.slot as WorkOrderInspectionPhotoSlot;

const getCurrentUserId = (req: Request): number => {
  if (!req.user) {
    throw ApiError.internal('Error de programación: controlador requiere authenticate previo');
  }

  return req.user.id;
};

export const getWorkOrdersHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as WorkOrderQueryInput;
    const result = await workOrderService.listWorkOrders(query);
    res.status(200).json(result);
  },
);

export const getWorkOrderByIdHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const workOrder = await workOrderService.getWorkOrderById(getParamId(req));
    res.status(200).json({ workOrder });
  },
);

export const getWorkOrderPdfHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = getParamId(req);
    const [workOrder, pdfBytes] = await Promise.all([
      workOrderService.getWorkOrderById(id),
      generateWorkOrderPdf(id),
    ]);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${workOrder.codigo}.pdf"`);
    res.end(Buffer.from(pdfBytes));
  },
);

export const getWorkOrderReceptionPdfHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = getParamId(req);
    const [workOrder, pdfBytes] = await Promise.all([
      workOrderService.getWorkOrderById(id),
      generateWorkOrderReceptionPdf(id),
    ]);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${workOrder.codigo}-comprobante-recepcion.pdf"`,
    );
    res.end(Buffer.from(pdfBytes));
  },
);

export const createWorkOrderHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const workOrder = await workOrderService.createWorkOrder(
      req.body as CreateWorkOrderInput,
      getCurrentUserId(req),
    );
    res.status(201).json({ workOrder });
  },
);

export const uploadWorkOrderInspectionPhotoHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      throw ApiError.badRequest('Debe adjuntar una foto en el campo photo');
    }

    const photo = await inspectionPhotoService.saveInspectionPhoto(
      getParamId(req),
      getPhotoSlot(req),
      req.file,
      getCurrentUserId(req),
    );
    res.status(201).json({ photo });
  },
);

export const getWorkOrderInspectionPhotoHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { photo, bytes } = await inspectionPhotoService.getInspectionPhoto(
      getParamId(req),
      getPhotoSlot(req),
    );

    res.setHeader('Content-Type', photo.mimeType);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename="inspeccion-${photo.slot}"`);
    res.end(bytes);
  },
);

export const deleteWorkOrderInspectionPhotoHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await inspectionPhotoService.deleteInspectionPhoto(getParamId(req), getPhotoSlot(req));
    res.status(204).send();
  },
);

export const updateWorkOrderHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const workOrder = await workOrderService.updateWorkOrder(
      getParamId(req),
      req.body as UpdateWorkOrderInput,
      getCurrentUserId(req),
    );
    res.status(200).json({ workOrder });
  },
);

export const changeWorkOrderStatusHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { nuevoEstado, motivo } = req.body as ChangeWorkOrderStatusInput;
    const workOrder = await workOrderService.changeStatus(
      getParamId(req),
      nuevoEstado,
      getCurrentUserId(req),
      motivo,
    );
    res.status(200).json({ workOrder });
  },
);

export const deliverWorkOrderHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const workOrder = await workOrderService.deliverWorkOrder(
      getParamId(req),
      req.body as DeliverWorkOrderInput,
      getCurrentUserId(req),
    );
    res.status(200).json({ workOrder });
  },
);

export const deleteWorkOrderHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await workOrderService.deleteWorkOrder(getParamId(req));
    res.status(204).send();
  },
);
