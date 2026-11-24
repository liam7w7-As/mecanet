import { CashClosure } from './CashClosure.js';
import { CashMovement } from './CashMovement.js';
import { CatalogItem } from './CatalogItem.js';
import { Client } from './Client.js';
import { CompanySettings } from './CompanySettings.js';
import { CustomerEmail } from './CustomerEmail.js';
import { DpConfiguration } from './DpConfiguration.js';
import { DpConfigurationRevision } from './DpConfigurationRevision.js';
import { FleetDocument } from './FleetDocument.js';
import { FleetDocumentVersion } from './FleetDocumentVersion.js';
import { FleetVehicle } from './FleetVehicle.js';
import { Notification } from './Notification.js';
import { Payment } from './Payment.js';
import { Permission } from './Permission.js';
import { Purchase } from './Purchase.js';
import { PurchaseItem } from './PurchaseItem.js';
import { Quotation } from './Quotation.js';
import { QuotationItem } from './QuotationItem.js';
import { RefreshToken } from './RefreshToken.js';
import { Role } from './Role.js';
import { RolePermission } from './RolePermission.js';
import { SalesAccessGrant } from './SalesAccessGrant.js';
import { Specialty } from './Specialty.js';
import { SpecialtyRate } from './SpecialtyRate.js';
import { StockBalance } from './StockBalance.js';
import { StockMovement } from './StockMovement.js';
import { Supplier } from './Supplier.js';
import { User } from './User.js';
import { Vehicle } from './Vehicle.js';
import { Warehouse } from './Warehouse.js';
import { WorkerSpecialty } from './WorkerSpecialty.js';
import { WorkOrder } from './WorkOrder.js';
import { WorkOrderDelivery } from './WorkOrderDelivery.js';
import { WorkOrderDpStage } from './WorkOrderDpStage.js';
import { WorkOrderEvent } from './WorkOrderEvent.js';
import { WorkOrderInspection } from './WorkOrderInspection.js';
import { WorkOrderInspectionPhoto } from './WorkOrderInspectionPhoto.js';
import { WorkOrderItem } from './WorkOrderItem.js';
import { WorkOrderItemAssignment } from './WorkOrderItemAssignment.js';
import { WorkOrderItemProgressEvent } from './WorkOrderItemProgressEvent.js';
import { WorkOrderItemSession } from './WorkOrderItemSession.js';
import { WorkOrderObservation } from './WorkOrderObservation.js';
import { WorkOrderObservationFile } from './WorkOrderObservationFile.js';
import { WorkOrderPriceSuggestion } from './WorkOrderPriceSuggestion.js';
import { WorkOrderProgressReport } from './WorkOrderProgressReport.js';
import { WorkOrderQualityReview } from './WorkOrderQualityReview.js';
import { WorkOrderRequest } from './WorkOrderRequest.js';
import { WorkshopAlertSettings } from './WorkshopAlertSettings.js';
import { WorkshopCommercialReview } from './WorkshopCommercialReview.js';
import { WorkshopSchedule } from './WorkshopSchedule.js';
import { WorkshopScheduleException } from './WorkshopScheduleException.js';
import { WorkshopTimeRequest } from './WorkshopTimeRequest.js';

import type { Sequelize } from 'sequelize-typescript';

export const models = [
  DpConfiguration,
  DpConfigurationRevision,
  WorkshopCommercialReview,
  WorkshopAlertSettings,
  WorkOrderQualityReview,
  Specialty,
  SpecialtyRate,
  WorkerSpecialty,
  WorkshopSchedule,
  WorkshopScheduleException,
  WorkshopTimeRequest,
  WorkOrderItemAssignment,

  CustomerEmail,
  Role,
  Permission,
  RolePermission,
  SalesAccessGrant,
  User,
  RefreshToken,
  Client,
  Vehicle,
  FleetVehicle,
  FleetDocument,
  FleetDocumentVersion,
  CatalogItem,
  CashClosure,
  CashMovement,
  Warehouse,
  StockBalance,
  StockMovement,
  WorkOrder,
  WorkOrderDelivery,
  WorkOrderDpStage,
  WorkOrderEvent,
  WorkOrderItem,
  WorkOrderItemSession,
  WorkOrderItemProgressEvent,
  WorkOrderObservation,
  WorkOrderObservationFile,
  WorkOrderPriceSuggestion,
  WorkOrderProgressReport,
  WorkOrderRequest,
  WorkOrderInspection,
  WorkOrderInspectionPhoto,
  Quotation,
  QuotationItem,
  Payment,
  Supplier,
  Purchase,
  PurchaseItem,
  Notification,
  CompanySettings,
];

export function initModels(sequelize: Sequelize): void {
  sequelize.addModels(models);
}

export {
  DpConfiguration,
  DpConfigurationRevision,
  WorkshopCommercialReview,
  WorkshopAlertSettings,
  WorkOrderQualityReview,
  Specialty,
  SpecialtyRate,
  WorkerSpecialty,
  WorkshopSchedule,
  WorkshopScheduleException,
  WorkshopTimeRequest,
  WorkOrderItemAssignment,

  CustomerEmail,
  Role,
  Permission,
  RolePermission,
  SalesAccessGrant,
  User,
  RefreshToken,
  Client,
  Vehicle,
  FleetVehicle,
  FleetDocument,
  FleetDocumentVersion,
  CatalogItem,
  CashClosure,
  CashMovement,
  Warehouse,
  StockBalance,
  StockMovement,
  WorkOrder,
  WorkOrderDelivery,
  WorkOrderDpStage,
  WorkOrderEvent,
  WorkOrderItem,
  WorkOrderItemSession,
  WorkOrderItemProgressEvent,
  WorkOrderObservation,
  WorkOrderObservationFile,
  WorkOrderPriceSuggestion,
  WorkOrderProgressReport,
  WorkOrderRequest,
  WorkOrderInspection,
  WorkOrderInspectionPhoto,
  Quotation,
  QuotationItem,
  Payment,
  Supplier,
  Purchase,
  PurchaseItem,
  Notification,
  CompanySettings,
};
