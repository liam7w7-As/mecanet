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
