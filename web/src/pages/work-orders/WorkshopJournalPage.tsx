import BrandLogo from '../../components/common/BrandLogo';
import WorkshopTimePanel from '../../components/work-orders/WorkshopTimePanel';

/** Espacio propio del mecánico para registrar su jornada sin abrir una OT. */
export default function WorkshopJournalPage() {
  return <div className="workspace-page min-w-0 space-y-5">
    <header className="page-banner">
      <div>
        <div className="dashboard-heading">
          <h1>Registrar jornada</h1>
          <BrandLogo className="dashboard-heading-logo" />
        </div>
        <p className="mt-1 text-sm text-brand-muted">Registra tus horas por servicio y solicita correcciones al jefe de taller.</p>
      </div>
    </header>
    <WorkshopTimePanel />
  </div>;
}
