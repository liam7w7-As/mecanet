export interface VehicleOwner {
  id: number;
  rut: string | null;
  nombre: string;
  tipo: 'cliente' | 'empresa';
  telefono: string | null;
}

export interface Vehicle {
  id: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  color: string | null;
  vinChasis: string | null;
  motor: string | null;
  kilometraje: number | null;
  combustible: string | null;
  transmision: string | null;
  clientId: number | null;
  createdAt: string;
  updatedAt: string;
  client?: VehicleOwner | null;
}

export type FleetVehicleStatus = import('@unithor/shared').FleetVehicleStatus;
export type FleetExpiryInfo = import('@unithor/shared').FleetExpiryInfo;

export interface FleetVehicleNextExpiry {
  documentId: number;
  nombre: string;
  fechaVencimiento: string;
  state: import('@unithor/shared').FleetExpiryState;
  daysRemaining: number | null;
}

export interface FleetVehicleDocumentSummary {
  total: number;
  expired: number;
  expiringSoon: number;
  nextExpiry: FleetVehicleNextExpiry | null;
}

export interface FleetDocument {
  id: number;
  fleetVehicleId: number;
  nombre: string;
  referencia: string | null;
  notas: string | null;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  archivoNombre: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  version: number;
  tieneArchivo: boolean;
  subidoPor: number | null;
  expiry: FleetExpiryInfo;
  createdAt: string;
  updatedAt: string;
}

export interface FleetDocumentVersion {
  id: number;
  version: number;
  archivoNombre: string;
  mimeType: string;
  sizeBytes: number;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  referencia: string | null;
  notas: string | null;
  subidoPor: number | null;
  createdAt: string;
  esActual: false;
}

export interface FleetVehicle {
  id: number;
  patente: string;
  codigoInterno: string | null;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  color: string | null;
  vinChasis: string | null;
  motor: string | null;
  kilometraje: number | null;
  combustible: string | null;
  transmision: string | null;
  estadoOperativo: FleetVehicleStatus;
  sucursal: string | null;
  responsable: string | null;
  createdAt: string;
  updatedAt: string;
  documentSummary: FleetVehicleDocumentSummary;
}

export interface FleetVehicleDetail extends FleetVehicle {
  documents: FleetDocument[];
}

export interface ClientVehicleSummary {
  id: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
}

export interface Client {
  id: number;
  rut: string | null;
  nombre: string;
  tipo: 'cliente' | 'empresa';
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  region: string | null;
  comuna: string | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
  vehicles?: ClientVehicleSummary[];
  vehiclesCount?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface QuickSearchClient {
  id: number;
  rut: string | null;
  nombre: string;
  tipo: 'cliente' | 'empresa';
  telefono: string | null;
  email: string | null;
  vehiclesCount: number;
}

export interface QuickSearchVehicle {
  id: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  client: Pick<VehicleOwner, 'id' | 'nombre' | 'rut'> | null;
}

export interface QuickSearchResult {
  clients: QuickSearchClient[];
  vehicles: QuickSearchVehicle[];
}

export interface CatalogItem {
  id: number;
  tipo: 'parte' | 'estandar' | 'especifico';
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  unidadMedida: import('@unithor/shared').UnitMeasure;
  precio: number;
  stock: number;
  stockMinimo: number;
  horasHombreEstandar: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderClient {
  id: number;
  rut: string | null;
  nombre: string;
  telefono: string | null;
  email?: string | null;
  direccion?: string | null;
}

export interface WorkOrderVehicle {
  id: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
  ano?: number | null;
}

export interface WorkOrderVehicleOwner {
  clientId: number | null;
  nombre: string | null;
  rut: string | null;
}

export interface WorkOrderCreator {
  id: number;
  nombre: string;
  email: string;
}

export interface WorkOrderContact {
  clientId: number | null;
  nombre: string | null;
  rut: string | null;
  telefono: string | null;
  email: string | null;
}

export interface WorkOrderBilling extends WorkOrderContact {
  tipo: 'cliente' | 'empresa' | null;
  direccion: string | null;
  region: string | null;
  comuna: string | null;
}

export interface WorkOrderItem {
  id: number;
  catalogItemId: number | null;
  descripcion: string;
  tipoLinea: import('@unithor/shared').CatalogType;
  unidadMedida: import('@unithor/shared').UnitMeasure;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  estadoOperativo: import('@unithor/shared').ItemOperationalStatus;
  notasOperativas: string | null;
  horasHombreEstimadas: number | null;
  horasHombreReales: number | null;
  assignedUserId: number | null;
  laborValidatedBy: number | null;
  laborValidatedAt: string | null;
  laborValidationNote: string | null;
  assignedUser?: { id: number; nombre: string } | null;
  validator?: { id: number; nombre: string } | null;
  stockConsumido: boolean;
  stockConsumidoCantidad: number;
  stockConsumidoAt: string | null;
  stockConsumidoWarehouseId?: number | null;
  catalogItem?: ItemCatalogInfo | null;
}

export interface WorkOrderQuotationSummary {
  id: number;
  codigo: string;
  estadoPago: import('@unithor/shared').QuotationStatus;
  total: number;
  pagado: number;
  saldoPendiente: number;
}

export interface WorkOrderInspectionPhoto {
  id: number;
  slot: import('@unithor/shared').WorkOrderInspectionPhotoSlot;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: number | null;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface WorkOrderInspection {
  id: number;
  nivelCombustible: import('@unithor/shared').FuelLevel | null;
  llantaDelanteraIzquierda: import('@unithor/shared').TireCondition | null;
  llantaDelanteraDerecha: import('@unithor/shared').TireCondition | null;
  llantaTraseraIzquierda: import('@unithor/shared').TireCondition | null;
  llantaTraseraDerecha: import('@unithor/shared').TireCondition | null;
  inventario: import('@unithor/shared').VehicleInventoryItem[];
  objetosValor: string | null;
  observaciones: string | null;
  inspectedBy: number | null;
  createdAt: string;
  updatedAt: string;
  photos: WorkOrderInspectionPhoto[];
}

export interface WorkOrderDelivery {
  id: number;
  kilometrajeSalida: number;
  receptorNombre: string;
  receptorRut: string | null;
  receptorTelefono: string | null;
  checklist: import('@unithor/shared').WorkOrderDeliveryChecklistItem[];
  conformidad: boolean;
  firmaRecepcion: string;
  observaciones: string | null;
  deliveredBy: number | null;
  deliveredAt: string;
  deliverer?: { id: number; nombre: string } | null;
}

export interface WorkOrderRelation {
  id: number;
  codigo: string;
  tipoIngreso: import('@unithor/shared').WorkOrderEntryType;
  estado: import('@unithor/shared').WorkOrderStatus;
  coberturaGarantia: boolean;
  fechaIngreso: string | null;
}

export interface WorkOrderEvent {
  id: number;
  tipo: import('@unithor/shared').WorkOrderEventType;
  descripcion: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor?: { id: number; nombre: string } | null;
}

export interface WorkOrderProgressReport {
  id: number;
  porcentaje: number;
  comentario: string;
  bloqueos: string | null;
  horasCerradas?: number | null;
  createdAt: string;
  mechanic?: { id: number; nombre: string } | null;
}

export interface WorkOrderRequest {
  id: number;
  workOrderItemId: number | null;
  catalogItemId: number | null;
  tipo: import('@unithor/shared').WorkOrderRequestType;
  estado: import('@unithor/shared').WorkOrderRequestStatus;
  motivo: string;
  cantidad: number | null;
  precioSugerido: number | null;
  precioAprobado: number | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  deliveredWarehouseId: number | null;
  deliveredBy: number | null;
  deliveredAt: string | null;
  deliveryNote: string | null;
  createdAt: string;
  catalogItem?: { id: number; codigo: string | null; nombre: string; precio: number } | null;
  workOrderItem?: { id: number; descripcion: string; precioUnitario: number } | null;
  requester?: { id: number; nombre: string } | null;
  reviewer?: { id: number; nombre: string } | null;
  deliveredWarehouse?: { id: number; codigo: string; nombre: string } | null;
  deliverer?: { id: number; nombre: string } | null;
}

export interface WorkOrder {
  id: number;
  codigo: string;
  tipoIngreso?: import('@unithor/shared').WorkOrderEntryType;
  sourceWorkOrderId?: number | null;
  coberturaGarantia?: boolean;
  clientId: number | null;
  contactClientId?: number | null;
  billingClientId?: number | null;
  vehicleId: number | null;
  estado: import('@unithor/shared').WorkOrderStatus;
  descripcion: string | null;
  kilometrajeIngreso: number | null;
  fechaIngreso: string | null;
  fechaEntrega: string | null;
  createdBy: number | null;
  assignedMechanicId?: number | null;
  createdAt: string;
  updatedAt: string;
  client?: WorkOrderClient | null;
  contactClient?: WorkOrderClient | null;
  billingClient?: WorkOrderClient | null;
  vehicle?: WorkOrderVehicle | null;
  vehicleOwner?: WorkOrderVehicleOwner | null;
  creator?: WorkOrderCreator | null;
  assignedMechanic?: WorkOrderCreator | null;
  items?: WorkOrderItem[];
  quotation?: WorkOrderQuotationSummary | null;
  contact?: WorkOrderContact | null;
  billing?: WorkOrderBilling | null;
  inspection?: WorkOrderInspection | null;
  delivery?: WorkOrderDelivery | null;
  sourceWorkOrder?: WorkOrderRelation | null;
  relatedWorkOrders?: WorkOrderRelation[];
  events?: WorkOrderEvent[];
  progressReports?: WorkOrderProgressReport[];
  requests?: WorkOrderRequest[];
}

export interface QuotationClient {
  id: number;
  rut: string | null;
  nombre: string;
  telefono: string | null;
  email?: string | null;
  direccion?: string | null;
}

export interface QuotationVehicle {
  id: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
}

export interface QuotationAdvisor {
  id: number;
  nombre: string;
  email: string;
}

export interface QuotationWorkOrder {
  id: number;
  codigo: string;
  estado: string;
  updatedAt?: string;
  inspectionPhotos?: WorkOrderInspectionPhoto[];
}

export interface ItemCatalogInfo {
  id: number;
  tipo: import('@unithor/shared').CatalogType;
  codigo: string | null;
  nombre: string;
  stock?: number;
}

export interface QuotationItem {
  id: number;
  catalogItemId: number | null;
  descripcion: string;
  tipoLinea: import('@unithor/shared').CatalogType;
  unidadMedida: import('@unithor/shared').UnitMeasure;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  descuentoTipo?: import('@unithor/shared').DiscountType | null;
  descuentoValor?: number;
  estadoOperativo: import('@unithor/shared').ItemOperationalStatus;
  notasOperativas: string | null;
  catalogItem?: ItemCatalogInfo | null;
}

export interface Quotation {
  id: number;
  codigo: string;
  workOrderId: number | null;
  clientId: number | null;
  vehicleId: number | null;
  asesorId: number | null;
  estadoPago: import('@unithor/shared').QuotationStatus;
  subtotal: number;
  total: number;
  pagado: number;
  notas: string | null;
  formaPago?: import('@unithor/shared').QuotationPaymentMethod;
  disponibilidadTrabajo?: string | null;
  validezDias?: number;
  descuentoTipo?: import('@unithor/shared').DiscountType | null;
  descuentoValor?: number;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  client?: QuotationClient | null;
  vehicle?: QuotationVehicle | null;
  asesor?: QuotationAdvisor | null;
  workOrder?: QuotationWorkOrder | null;
  items?: QuotationItem[];
}

export interface Warehouse {
  id: number;
  codigo: string;
  nombre: string;
  direccion: string | null;
  activo: boolean;
  totalItems: number;
  totalUnidades: number;
}

export interface StockBalance {
  warehouseId: number;
  catalogItemId: number;
  cantidad: number;
  codigo: string | null;
  nombre: string;
  precio: number;
  stockMinimo: number;
  bajoMinimo: boolean;
}

export interface StockMovement {
  id: number;
  catalogItemId: number;
  warehouseId: number;
  tipo: import('@unithor/shared').StockMovementType;
  cantidad: number;
  saldoResultante: number;
  motivo: string;
  referencia: string | null;
  createdBy: number | null;
  fecha: string;
  codigo: string | null;
  nombre: string;
  warehouseCodigo: string;
  warehouseNombre: string;
}

export interface WarehouseWorkOrderRequest {
  id: number;
  workOrderId: number;
  workOrderItemId: number | null;
  catalogItemId: number;
  estado: import('@unithor/shared').WorkOrderRequestStatus;
  motivo: string;
  cantidad: number;
  precioAprobado: number | null;
  createdAt: string;
  reviewedAt: string | null;
  deliveredAt: string | null;
  deliveryNote: string | null;
  workOrder: {
    id: number;
    codigo: string;
    estado: string;
    client: { id: number; nombre: string } | null;
    vehicle: {
      id: number;
      patente: string;
      marca: string | null;
      modelo: string | null;
    } | null;
    mechanic: { id: number; nombre: string } | null;
  };
  catalogItem: { id: number; codigo: string | null; nombre: string; stock: number };
  requester: { id: number; nombre: string } | null;
  reviewer: { id: number; nombre: string } | null;
  deliveredWarehouse: { id: number; codigo: string; nombre: string } | null;
  deliverer: { id: number; nombre: string } | null;
}

export interface PaymentCreator {
  id: number;
  nombre: string;
}

export interface PaymentQuotation {
  id: number;
  codigo: string;
  total: number;
  client?: { id: number; nombre: string } | null;
}

export interface Payment {
  id: number;
  quotationId: number;
  monto: number;
  metodo: string | null;
  estado?: import('@unithor/shared').PaymentStatus;
  referencia?: string | null;
  bancoOrigen?: string | null;
  numeroTransaccion?: string | null;
  comprobantePago?: string | null;
  fecha: string;
  createdBy: number | null;
  reviewedBy?: number | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  updatedAt: string;
  creator?: PaymentCreator | null;
  reviewer?: PaymentCreator | null;
  quotation?: PaymentQuotation;
}

export interface QuotationPaymentSummary {
  quotationId: number;
  total: number;
  pagado: number;
  saldoPendiente: number;
  estadoPago: import('@unithor/shared').QuotationStatus;
  payments: Payment[];
}

export interface PaymentQuotationSummary {
  id: number;
  codigo: string;
  total: number;
  pagado: number;
  saldoPendiente: number;
  estadoPago: import('@unithor/shared').QuotationStatus;
}

export interface Supplier {
  id: number;
  nombre: string;
  rut: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  contactoNombre: string | null;
  notas: string | null;
  datosCompletos: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseSummary {
  count: number;
  neto: number;
  iva: number;
  total: number;
  pendiente: number;
}

export interface PurchaseCatalogItemSummary {
  id: number;
  codigo: string | null;
  nombre: string;
}

export interface PurchaseWarehouseSummary {
  id: number;
  codigo: string;
  nombre: string;
}

export interface PurchaseItem {
  id: number;
  catalogItemId: number | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  afectaStock: boolean;
  warehouseId: number | null;
  catalogItem: PurchaseCatalogItemSummary | null;
  warehouse: PurchaseWarehouseSummary | null;
}

export interface PurchaseSupplier {
  id: number;
  nombre: string;
  rut: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  contactoNombre: string | null;
  datosCompletos: boolean;
}

export interface PurchaseVehicleSummary {
  id: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
}

export interface PurchaseWorkOrderSummary {
  id: number;
  codigo: string;
  estado: string;
}

export interface PurchaseCashMovementSummary {
  id: number;
  monto: number;
  metodo: import('@unithor/shared').PaymentMethod;
  fecha: string;
  voidedAt: string | null;
}

export interface PurchaseCreator {
  id: number;
  nombre: string;
}

export interface Purchase {
  id: number;
  codigo: string;
  supplierId: number;
  vehicleId: number | null;
  fleetVehicleId: number | null;
  workOrderId: number | null;
  origenVehiculo: import('@unithor/shared').PurchaseVehicleOrigin | null;
  conIva: boolean;
  neto: number;
  iva: number;
  total: number;
  formaPago: import('@unithor/shared').PurchasePaymentType;
  metodoPago: import('@unithor/shared').PaymentMethod;
  estado: import('@unithor/shared').PurchaseStatus;
  tipoDocumento: import('@unithor/shared').PurchaseDocumentType;
  folio: string;
  fechaEmision: string;
  montoComprobante: number;
  numeroOperacion: string;
  banco: string;
  comprobanteNombre: string;
  comprobanteMimeType: string;
  comprobanteSizeBytes: number;
  observaciones: string | null;
  cashMovementId: number | null;
  pagadoAt: string | null;
  createdBy: number | null;
  voidedAt: string | null;
  voidedBy: number | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: PurchaseSupplier;
  vehicle: PurchaseVehicleSummary | null;
  fleetVehicle: PurchaseVehicleSummary | null;
  workOrder: PurchaseWorkOrderSummary | null;
  creator: PurchaseCreator | null;
  voider: PurchaseCreator | null;
  cashMovement: PurchaseCashMovementSummary | null;
  items: PurchaseItem[];
}

export interface PurchaseListResponse extends PaginatedResponse<Purchase> {
  summary: PurchaseSummary;
}

export interface WorkOrderWorksheetItem {
  id: number;
  descripcion: string;
  tipoLinea: import('@unithor/shared').CatalogType;
  unidadMedida: import('@unithor/shared').UnitMeasure;
  cantidad: number;
  estadoOperativo: import('@unithor/shared').ItemOperationalStatus;
  notasOperativas: string | null;
  horasHombreEstimadas: number | null;
  horasEstimadasTotales: number | null;
  horasHombreReales: number | null;
  excedeEstimado: boolean;
  assignedUser: { id: number; nombre: string } | null;
  laborValidatedAt: string | null;
  laborValidationNote: string | null;
  activeSession: {
    id: number;
    userId: number | null;
    userName: string | null;
    startedAt: string;
    elapsedMinutes: number;
    mine: boolean;
  } | null;
  totalMinutes: number;
  observationsCount: number;
}

export interface WorkOrderWorksheetObservationFile {
  id: number;
  nombreOriginal: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export interface WorkOrderWorksheetObservation {
  id: number;
  texto: string | null;
  createdAt: string;
  authorName: string | null;
  itemId: number | null;
  itemDescripcion: string | null;
  progressReportId: number | null;
  files: WorkOrderWorksheetObservationFile[];
}

export interface WorkOrderWorksheet {
  workOrder: {
    id: number;
    codigo: string;
    estado: import('@unithor/shared').WorkOrderStatus;
    fechaIngreso: string | null;
    descripcion: string | null;
    vehiculo: {
      id: number | null;
      patente: string | null;
      marca: string | null;
      modelo: string | null;
    };
  };
  items: WorkOrderWorksheetItem[];
  servicios: WorkOrderWorksheetItem[];
  repuestos: WorkOrderWorksheetItem[];
  observations: WorkOrderWorksheetObservation[];
  progressReports: Array<{
    id: number;
    porcentaje: number;
    comentario: string;
    bloqueos: string | null;
    horasCerradas: number | null;
    createdAt: string;
    mechanic: { id: number; nombre: string } | null;
  }>;
  activeItemId: number | null;
  totals: {
    items: number;
    completados: number;
    enProceso: number;
    pendientes: number;
    horasEstimadas: number;
    horasReales: number;
    minutosReales: number;
  };
  pausedOtherItems: number;
}

export interface MyLaborOrder {
  id: number;
  codigo: string;
  estado: import('@unithor/shared').WorkOrderStatus;
  fechaIngreso: string | null;
  patente: string | null;
  marca: string | null;
  modelo: string | null;
  items: number;
  completados: number;
  enProceso: number;
  horasEstimadas: number;
  horasReales: number;
  activeItemId: number | null;
  activeItemDescripcion: string | null;
  activeSince: string | null;
}

export interface WorkOrderPriceSuggestion {
  id: number;
  workOrderId: number;
  workOrderItemId: number | null;
  itemDescripcion: string | null;
  horasEstimadas: number | null;
  horasReales: number | null;
  precioActualOt: number | null;
  precioActualCatalogo: number | null;
  precioSugerido: number;
  alcance: import('@unithor/shared').WorkOrderPriceSuggestionScope;
  motivo: string;
  estado: import('@unithor/shared').WorkOrderPriceSuggestionStatus;
  createdByName: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface WorkshopDailyReport {
  fecha: string;
  generadoEn: string;
  totalHoras: number;
  totalItemsCompletados: number;
  totalSesiones: number;
  usuarios: Array<{
    id: number;
    nombre: string;
    rol: string;
    minutos: number;
    horas: number;
    sesiones: number;
    itemsCompletados: number;
    eventos: number;
    enCurso: boolean;
    detalle: Array<{
      workOrderId: number;
      workOrderCodigo: string;
      itemDescripcion: string;
      minutos: number;
      estado: string;
    }>;
  }>;
  ordenes: Array<{
    id: number;
    codigo: string;
    patente: string | null;
    estado: string;
    horas: number;
    completados: number;
    enProceso: number;
    mecanicos: string[];
  }>;
}
