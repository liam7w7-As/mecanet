import { z } from 'zod';

import {
  paginationSchema,
  createCatalogItemSchema,
  updateCatalogItemSchema,
  catalogItemQuerySchema,
  createWorkOrderSchema,
  createWorkOrderItemSchema,
  updateWorkOrderSchema,
  workOrderQuerySchema,
  createQuotationSchema,
  createQuotationItemSchema,
  updateQuotationSchema,
  quotationQuerySchema,
  createPaymentSchema,
  updatePaymentSchema,
  paymentQuerySchema,
} from '../schemas/index.js';

// Auth
export type { LoginInput, RegisterInput } from '../schemas/index.js';

// Usuarios
export type {
  CreateUserInput,
  UpdateUserInput,
  UserQueryInput,
  ChangePasswordInput,
} from '../schemas/index.js';

// Paginación
export type PaginationInput = z.infer<typeof paginationSchema>;

// Clientes
export type { CreateClientInput, UpdateClientInput, ClientQueryInput } from '../schemas/index.js';

// Vehículos
export type { CreateVehicleInput, UpdateVehicleInput, VehicleQueryInput } from '../schemas/index.js';

// Catálogos
export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;
export type CatalogItemQueryInput = z.infer<typeof catalogItemQuerySchema>;

// Órdenes de Trabajo
export type CreateWorkOrderItemInput = z.infer<typeof createWorkOrderItemSchema>;
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
export type WorkOrderQueryInput = z.infer<typeof workOrderQuerySchema>;

// Cotizaciones
export type CreateQuotationItemInput = z.infer<typeof createQuotationItemSchema>;
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type QuotationQueryInput = z.infer<typeof quotationQuerySchema>;

// Pagos
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
export type PaymentQueryInput = z.infer<typeof paymentQuerySchema>;

// Permisos y roles
export type { UpdateRolePermissionsInput, RoleQueryInput } from '../schemas/index.js';

// Búsqueda
export type { QuickSearchQueryInput, LookupByPlateInput } from '../schemas/index.js';
