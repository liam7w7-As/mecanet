import { z } from 'zod';

import {
  paginationSchema,
  createCatalogItemSchema,
  updateCatalogItemSchema,
  catalogItemQuerySchema,
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
export type {
  WorkOrderItemInput,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrderQueryInput,
  ChangeWorkOrderStatusInput,
} from '../schemas/index.js';

// Cotizaciones
export type {
  ConvertQuotationInput,
  QuotationItemInput,
  CreateQuotationInput,
  UpdateQuotationInput,
  QuotationQueryInput,
} from '../schemas/index.js';

// Pagos
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
export type PaymentQueryInput = z.infer<typeof paymentQuerySchema>;

// Permisos y roles
export type { UpdateRolePermissionsInput, RoleQueryInput } from '../schemas/index.js';

// Búsqueda
export type { QuickSearchQueryInput, LookupByPlateInput } from '../schemas/index.js';
