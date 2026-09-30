import { BookOpen, ClipboardList, FileBarChart2, Landmark, PackageSearch, ReceiptText, Users, Warehouse } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { UserPublic } from '../../stores/auth.store';
import type { LucideIcon } from 'lucide-react';

type ReportSection = 'finance' | 'commercial' | 'workshop' | 'inventory' | 'catalog' | 'fleet' | 'administration';

interface ReportTab {
  id: ReportSection;
  label: string;
  icon: LucideIcon;
  allowed: (user: UserPublic) => boolean;
}

const canRead = (user: UserPublic, module: 'finanzas' | 'comercial' | 'taller' | 'almacen' | 'admin') =>
  hasUserPermission(user, module, 'read');

const TABS: ReportTab[] = [
  { id: 'finance', label: 'Finanzas', icon: Landmark, allowed: (user) => canRead(user, 'finanzas') },
  { id: 'commercial', label: 'Comercial', icon: ReceiptText, allowed: (user) => canRead(user, 'comercial') },
  { id: 'workshop', label: 'Taller', icon: ClipboardList, allowed: (user) => canRead(user, 'taller') },
  { id: 'inventory', label: 'Almacenes', icon: Warehouse, allowed: (user) => canRead(user, 'almacen') },
  { id: 'catalog', label: 'Catálogo', icon: PackageSearch, allowed: (user) => canRead(user, 'almacen') || canRead(user, 'taller') || canRead(user, 'comercial') },
  { id: 'fleet', label: 'Clientes y vehículos', icon: BookOpen, allowed: (user) => user.role !== 'mecanico' && (canRead(user, 'comercial') || canRead(user, 'taller')) },
  { id: 'administration', label: 'Cuentas', icon: Users, allowed: (user) => canRead(user, 'admin') },
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
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebouncedValue(search, 350);
  const visibleTabs = user ? TABS.filter((tab) => tab.allowed(user)) : [];
  const selected = visibleTabs.find((tab) => tab.id === params.get('section'))?.id ?? visibleTabs[0]?.id;
  const from = params.get('from') ?? firstDayOfMonth();
  const to = params.get('to') ?? today();

  useEffect(() => {
    if (debouncedSearch === (params.get('q') ?? '')) return;
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (debouncedSearch) next.set('q', debouncedSearch);
      else next.delete('q');
      return next;
    }, { replace: true });
  }, [debouncedSearch, params, setParams]);

  const setFilter = (key: string, value: string) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  };

  const selectSection = (section: ReportSection) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('section', section);
      return next;
    }, { replace: true });
  };

  if (!user || !selected) return null;

  const filters = {
    from,
    to,
    search: debouncedSearch,
    params,
    setFilter,
    searchValue: search,
    setSearch,
  };

  return (
    <div className="min-w-0 space-y-5">
      <header className="page-banner">
        <div className="min-w-0">
          <p className="text-sm text-brand-muted">Análisis por área</p>
          <h1 className="mt-1 inline-flex items-center gap-3"><FileBarChart2 className="h-7 w-7" aria-hidden="true" />Reportes</h1>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-brand-line pb-1" aria-label="Áreas de reportes">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={selected === id ? 'page' : undefined}
            onClick={() => selectSection(id)}
            className={`inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors ${selected === id ? 'border-brand-primaryInk text-brand-primaryInk' : 'border-transparent text-brand-muted hover:text-brand-primaryInk'}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />{label}
          </button>
        ))}
      </nav>

      {selected === 'finance' && <FinanceReportPanel {...filters} canExport={hasUserPermission(user, 'finanzas', 'export')} />}
      {selected === 'commercial' && <CommercialReportPanel {...filters} canExport={hasUserPermission(user, 'comercial', 'export') || hasUserPermission(user, 'finanzas', 'export')} />}
      {selected === 'workshop' && <WorkshopReportPanel {...filters} canExport={hasUserPermission(user, 'taller', 'export') || hasUserPermission(user, 'finanzas', 'export')} />}
      {selected === 'inventory' && <InventoryReportPanel {...filters} canExport={hasUserPermission(user, 'almacen', 'export') || hasUserPermission(user, 'finanzas', 'export')} />}
      {selected === 'catalog' && <CatalogReportPanel {...filters} canExport={hasUserPermission(user, 'almacen', 'export') || hasUserPermission(user, 'taller', 'export') || hasUserPermission(user, 'comercial', 'export') || hasUserPermission(user, 'finanzas', 'export')} />}
      {selected === 'fleet' && <FleetReportPanel {...filters} canExport={hasUserPermission(user, 'comercial', 'export') || hasUserPermission(user, 'taller', 'export') || hasUserPermission(user, 'finanzas', 'export')} />}
      {selected === 'administration' && <AdministrationReportPanel {...filters} canExport={hasUserPermission(user, 'admin', 'export')} />}
    </div>
  );
};

export default ReportsPage;
