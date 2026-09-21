import { CatalogItem } from './CatalogItem.js';
import { Client } from './Client.js';
import { Payment } from './Payment.js';
import { Permission } from './Permission.js';
import { Quotation } from './Quotation.js';
import { QuotationItem } from './QuotationItem.js';
import { RefreshToken } from './RefreshToken.js';
import { Role } from './Role.js';
import { RolePermission } from './RolePermission.js';
import { User } from './User.js';
import { Vehicle } from './Vehicle.js';
import { WorkOrder } from './WorkOrder.js';
import { WorkOrderDelivery } from './WorkOrderDelivery.js';
import { WorkOrderInspection } from './WorkOrderInspection.js';
import { WorkOrderInspectionPhoto } from './WorkOrderInspectionPhoto.js';
import { WorkOrderItem } from './WorkOrderItem.js';

import type { Sequelize } from 'sequelize-typescript';

export const models = [
  Role,
  Permission,
  RolePermission,
  User,
  RefreshToken,
  Client,
  Vehicle,
  CatalogItem,
  WorkOrder,
  WorkOrderDelivery,
  WorkOrderItem,
  WorkOrderInspection,
  WorkOrderInspectionPhoto,
  Quotation,
  QuotationItem,
  Payment,
];

export function initModels(sequelize: Sequelize): void {
  sequelize.addModels(models);
}

export {
  Role,
  Permission,
  RolePermission,
  User,
  RefreshToken,
  Client,
  Vehicle,
  CatalogItem,
  WorkOrder,
  WorkOrderDelivery,
  WorkOrderItem,
  WorkOrderInspection,
  WorkOrderInspectionPhoto,
  Quotation,
  QuotationItem,
  Payment,
};
