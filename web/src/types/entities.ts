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
  precio: number;
  stock: number;
  stockMinimo: number;
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
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  estadoOperativo: import('@unithor/shared').ItemOperationalStatus;
  notasOperativas: string | null;
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
  createdAt: string;
  catalogItem?: { id: number; codigo: string | null; nombre: string; precio: number } | null;
  workOrderItem?: { id: number; descripcion: string; precioUnitario: number } | null;
  requester?: { id: number; nombre: string } | null;
  reviewer?: { id: number; nombre: string } | null;
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
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
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
