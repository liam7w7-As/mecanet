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
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderClient {
  id: number;
  rut: string | null;
  nombre: string;
  telefono: string | null;
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

export interface WorkOrderItem {
  id: number;
  catalogItemId: number | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface WorkOrder {
  id: number;
  codigo: string;
  clientId: number | null;
  vehicleId: number | null;
  estado: import('@unithor/shared').WorkOrderStatus;
  descripcion: string | null;
  kilometrajeIngreso: number | null;
  fechaIngreso: string | null;
  fechaEntrega: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  client?: WorkOrderClient | null;
  vehicle?: WorkOrderVehicle | null;
  creator?: WorkOrderCreator | null;
  items?: WorkOrderItem[];
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

export interface QuotationItem {
  id: number;
  catalogItemId: number | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
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

export interface PaymentCreator {
  id: number;
  nombre: string;
}

export interface Payment {
  id: number;
  quotationId: number;
  monto: number;
  metodo: string | null;
  fecha: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  creator?: PaymentCreator | null;
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
