import {
  BookOpen,
  ClipboardList,
  RotateCcw,
  Landmark,
  PackageSearch,
  ReceiptText,
  Users,
  Warehouse,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import {
  AdministrationReportPanel,
  CatalogReportPanel,
  CommercialReportPanel,
  FinanceReportPanel,
  FleetReportPanel,
  InventoryReportPanel,
  WorkshopReportPanel,
} from './ReportPanels';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { canExportReport, canReadReport } from '../../lib/report-access';
import { useAuthStore } from '../../stores/auth.store';

import type { UserPublic } from '../../stores/auth.store';
import type { LucideIcon } from 'lucide-react';

type ReportSection =
  'finance' | 'commercial' | 'workshop' | 'inventory' | 'catalog' | 'fleet' | 'administration';

interface ReportTab {
  id: ReportSection;
  label: string;
  icon: LucideIcon;
  allowed: (user: UserPublic) => boolean;
}

const TABS: ReportTab[] = [
  {
    id: 'finance',
    label: 'Finanzas',
    icon: Landmark,
    allowed: (user) => canReadReport(user, 'finance'),
  },
  {
    id: 'commercial',
    label: 'Comercial',
    icon: ReceiptText,
    allowed: (user) => canReadReport(user, 'commercial'),
  },
  {
    id: 'workshop',
    label: 'Taller',
    icon: ClipboardList,
    allowed: (user) => canReadReport(user, 'workshop'),
  },
  {
    id: 'inventory',
    label: 'Almacenes',
    icon: Warehouse,
    allowed: (user) => canReadReport(user, 'inventory'),
  },
  {
    id: 'catalog',
    label: 'Catálogo',
    icon: PackageSearch,
    allowed: (user) => canReadReport(user, 'catalog'),
  },
  {
    id: 'fleet',
    label: 'Clientes y vehículos',
    icon: BookOpen,
    allowed: (user) => canReadReport(user, 'fleet'),
  },
  {
    id: 'administration',
    label: 'Cuentas',
    icon: Users,
    allowed: (user) => canReadReport(user, 'administration'),
  },
];

const firstDayOfMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
};
const today = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const ReportsPage = () => {
  const user = useAuthStore((state) => state.user);
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const debouncedSearch = useDebouncedValue(search, 350);
  const visibleTabs = user ? TABS.filter((tab) => tab.allowed(user)) : [];
  const selected =
    visibleTabs.find((tab) => tab.id === params.get('section'))?.id ?? visibleTabs[0]?.id;
  const from = params.get('from') ?? firstDayOfMonth();
  const to = params.get('to') ?? today();

  const setFilter = (key: string, value: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };

  const selectSection = (section: ReportSection) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('section', section);
        return next;
      },
      { replace: true },
    );
  };

  if (!user || !selected) return null;

  const filters = {
    from,
    to,
    search: debouncedSearch,
    params,
    setFilter,
    searchValue: search,
    setSearch: (value: string) => setFilter('q', value),
  };

  return (
    <div className="workspace-page workspace-reports insights-page reports-reference-page min-w-0 space-y-5" data-report-area={selected}>
      <header className="insights-page-heading">
        <div>
          <h1>Reportes</h1>
          <p>Informes por área con vista previa y exportación.</p>
        </div>
        <button
          type="button"
          className="insights-secondary"
          onClick={() => setParams(new URLSearchParams({ section: selected }), { replace: true })}
        >
          <RotateCcw aria-hidden="true" />
          Limpiar filtros
        </button>
      </header>
      <nav className="insights-tabs report-area-tabs" aria-label="Áreas de reportes">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={selected === id ? 'page' : undefined}
            onClick={() => selectSection(id)}
            className={`inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors ${selected === id ? 'border-brand-primaryInk text-brand-primaryInk' : 'border-transparent text-brand-muted hover:text-brand-primaryInk'}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      <p className="report-preview-context">
        Los filtros seleccionados se aplican a la vista previa, al PDF y al archivo Excel.
      </p>
      <div className="report-workspace">
        {selected === 'finance' && (
          <FinanceReportPanel
            {...filters}
            canExport={canExportReport(user, 'finance')}
          />
        )}
        {selected === 'commercial' && (
          <CommercialReportPanel
            {...filters}
            canExport={canExportReport(user, 'commercial')}
          />
        )}
        {selected === 'workshop' && (
          <WorkshopReportPanel
            {...filters}
            canExport={canExportReport(user, 'workshop')}
          />
        )}
        {selected === 'inventory' && (
          <InventoryReportPanel
            {...filters}
            canExport={canExportReport(user, 'inventory')}
          />
        )}
        {selected === 'catalog' && (
          <CatalogReportPanel
            {...filters}
            canExport={canExportReport(user, 'catalog')}
          />
        )}
        {selected === 'fleet' && (
          <FleetReportPanel
            {...filters}
            canExport={canExportReport(user, 'fleet')}
          />
        )}
        {selected === 'administration' && (
          <AdministrationReportPanel
            {...filters}
            canExport={canExportReport(user, 'administration')}
          />
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
