import { AlertCircle, CheckCircle2, Clock3, PackageSearch, Wrench } from 'lucide-react';

import { useMyLaborWorkOrders } from '../../hooks/useWorkOrderLabor';
import DashboardKpi from '../dashboard/DashboardKpi';

export default function MechanicOverview() {
  const query = useMyLaborWorkOrders();
  const orders = query.data ?? [];
  const running = orders.filter((order) => order.activeItemId !== null);
  const cards = [
    { title: 'OTs asignadas', value: orders.length, detail: 'Responsable general o por servicio', icon: Wrench, testId: 'my-order-count' },
    { title: 'Tu cronómetro', value: running.length, detail: running[0]?.activeItemDescripcion ?? 'Sin cronómetro en curso', icon: Clock3, testId: 'my-running-count' },
    { title: 'Esperando repuestos', value: orders.filter((order) => order.estado === 'esperando_repuesto').length, detail: 'Órdenes detenidas por piezas', icon: PackageSearch, testId: 'my-waiting-count' },
    { title: 'Finalizadas', value: orders.filter((order) => order.estado === 'finalizada').length, detail: 'Trabajos listos para entregar', icon: CheckCircle2, testId: 'my-ready-count' },
  ];
  return <section className="workshop-overview" aria-label="Resumen de mis trabajos">
    {query.isError ? <div className="workshop-overview-error" role="alert"><AlertCircle aria-hidden="true" /><span>No se pudo cargar tu resumen de trabajo.</span><button type="button" onClick={() => void query.refetch()}>Reintentar</button></div> :
      <div className="dashboard-metrics" aria-busy={query.isPending}>{cards.map((card) => <div key={card.testId} className={`dashboard-kpi${query.isPending ? ' animate-pulse' : ''}`}><DashboardKpi {...card} value={query.isPending ? '—' : String(card.value)} /></div>)}</div>}
  </section>;
}
