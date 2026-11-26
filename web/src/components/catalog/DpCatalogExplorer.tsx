import { calculateDpWorkQuote } from '@unithor/shared';
import {
  AlertCircle,
  Calculator,
  Car,
  Layers,
  LoaderCircle,
  Paintbrush,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { useDpConfiguration } from '../../hooks/useDpConfiguration';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp } from '../../lib/formatters';
import { useAuthStore } from '../../stores/auth.store';
import { canReadDpCatalog, canReadDpSettings } from '../settings/dp-configuration-ui';

import type { DpConfiguration } from '@unithor/shared';

type ZoneKey = 'frontal' | 'lateral' | 'superior' | 'trasera' | 'otras';

const ZONE_META: Record<ZoneKey, { label: string }> = {
  frontal: { label: 'Zona Frontal' },
  lateral: { label: 'Laterales y Puertas' },
  superior: { label: 'Techo y Superior' },
  trasera: { label: 'Zona Trasera' },
  otras: { label: 'Otras Piezas' },
};

const ZONE_ORDER: ZoneKey[] = ['frontal', 'lateral', 'superior', 'trasera', 'otras'];

function getPieceZone(pieceId: string, positionId: string): ZoneKey {
  if (pieceId === 'parachoque') {
    return positionId === 'R' ? 'trasera' : 'frontal';
  }
  if (pieceId === 'capo' || pieceId === 'guardafango') return 'frontal';
  if (
    pieceId === 'puerta' ||
    pieceId === 'pilar' ||
    pieceId === 'retrovisor' ||
    pieceId === 'moldura_guardafango' ||
    pieceId === 'panel_lateral' ||
    pieceId === 'lateral_pickup'
  ) {
    return 'lateral';
  }
  if (pieceId === 'techo' || pieceId === 'marco_superior') return 'superior';
  if (pieceId === 'porton' || pieceId === 'maletero' || pieceId === 'portalon') return 'trasera';
  return 'otras';
}

const factorLabel = (value: number) =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 }).format(value);

function previewPieceOpPrice(
  config: DpConfiguration,
  revision: number,
  bodyTypeId: string,
  sizeId: string,
  pieceId: string,
  positionId: string,
  operationId: string | undefined,
  damageLevelId?: string,
): number | null {
  if (!operationId) return null;
  try {
    const quote = calculateDpWorkQuote(
      config,
      {
        configurationRevision: revision,
        bodyTypeId,
        sizeId,
        scope: 'piece',
        pieceId,
        positionId,
        ...(damageLevelId ? { damageLevelId } : {}),
        operations: [{ operationId }],
      },
      revision,
    );
    return quote.precioUnitario;
  } catch {
    return null;
  }
}

interface DpCatalogExplorerProps {
  onOpenCalculator: (initial?: {
    bodyId?: string;
    sizeId?: string;
    pieceId?: string;
    positionId?: string;
    damageId?: string;
  }) => void;
  onOpenSettings: () => void;
}

export default function DpCatalogExplorer({
  onOpenCalculator,
  onOpenSettings,
}: DpCatalogExplorerProps) {
  const user = useAuthStore((state) => state.user);
  const allowed = canReadDpCatalog(user);
  const canEditSettings = canReadDpSettings(user);
  const query = useDpConfiguration('catalog', allowed);

  const [selectedBodyId, setSelectedBodyId] = useState('');
  const [selectedSizeId, setSelectedSizeId] = useState('');
  const [selectedDamageId, setSelectedDamageId] = useState('');
  const [selectedZone, setSelectedZone] = useState<'all' | ZoneKey>('all');
  const [search, setSearch] = useState('');

  const config = query.data?.configuration;
  const revision = query.data?.revision ?? 1;

  const bodies = useMemo(() => config?.bodyTypes.filter((b) => b.active) ?? [], [config]);
  const activeBody = useMemo(
    () => bodies.find((b) => b.id === selectedBodyId) ?? bodies[0],
    [bodies, selectedBodyId],
  );
  const sizes = useMemo(() => activeBody?.sizes.filter((s) => s.active) ?? [], [activeBody]);
  const activeSize = useMemo(
    () => sizes.find((s) => s.id === selectedSizeId) ?? sizes[0],
    [sizes, selectedSizeId],
  );
  const damageLevels = useMemo(() => config?.damageLevels.filter((d) => d.active) ?? [], [config]);
  const activeDamage = useMemo(
    () => damageLevels.find((d) => d.id === selectedDamageId) ?? damageLevels[0],
    [damageLevels, selectedDamageId],
  );

  // Operación representativa configurada para cada fórmula (pintura, reparación, desmontaje)
  const sampleOps = useMemo(() => {
    if (!config) return { painting: undefined, repair: undefined, dismantling: undefined };
    const findConfigured = (formula: 'painting' | 'repair' | 'dismantling') =>
      config.operations.find((op) => {
        if (!op.active || (op.scope !== 'piece' && op.scope !== 'additional')) return false;
        const table = config.tables.find((t) => t.id === op.tableId);
        return (
          table?.active &&
          table.formula === formula &&
          table.basePrice !== null &&
          op.multiplier !== null
        );
      })?.id;
    return {
      painting: findConfigured('painting'),
      repair: findConfigured('repair'),
      dismantling: findConfigured('dismantling'),
    };
  }, [config]);

  const groupedZones = useMemo(() => {
    if (!config || !activeBody || !activeSize) return [];
    const pieceMap = new Map(
      config.pieces.filter((p) => p.active).map((p) => [p.id, p.label]),
    );
    const term = search.trim().toLocaleLowerCase('es');

    const matchingRates = config.rates
      .filter(
        (rate) =>
          rate.active &&
          rate.bodyTypeId === activeBody.id &&
          pieceMap.has(rate.pieceId),
      )
      .map((rate) => {
        const pieceLabel = pieceMap.get(rate.pieceId) ?? rate.pieceId;
        const zone = getPieceZone(rate.pieceId, rate.positionId);
        return {
          ...rate,
          pieceLabel,
          zone,
          paintPrice: previewPieceOpPrice(
            config,
            revision,
            activeBody.id,
            activeSize.id,
            rate.pieceId,
            rate.positionId,
            sampleOps.painting,
          ),
          repairPrice: previewPieceOpPrice(
            config,
            revision,
            activeBody.id,
            activeSize.id,
            rate.pieceId,
            rate.positionId,
            sampleOps.repair,
            activeDamage?.id,
          ),
          dismantlePrice: previewPieceOpPrice(
            config,
            revision,
            activeBody.id,
            activeSize.id,
            rate.pieceId,
            rate.positionId,
            sampleOps.dismantling,
          ),
        };
      })
      .filter((entry) => {
        if (selectedZone !== 'all' && entry.zone !== selectedZone) return false;
        if (!term) return true;
        return `${entry.pieceLabel} ${entry.positionLabel}`
          .toLocaleLowerCase('es')
          .includes(term);
      });

    return ZONE_ORDER.map((zoneKey) => ({
      zone: zoneKey,
      label: ZONE_META[zoneKey].label,
      items: matchingRates.filter((entry) => entry.zone === zoneKey),
    })).filter((group) => group.items.length > 0);
  }, [config, activeBody, activeSize, activeDamage, revision, sampleOps, search, selectedZone]);

  const specialOperations = useMemo(() => {
    if (!config) return [];
    const term = search.trim().toLocaleLowerCase('es');
    return config.operations
      .filter(
        (op) =>
          op.active &&
          (op.scope === 'global' || op.scope === 'additional') &&
          (!term || op.label.toLocaleLowerCase('es').includes(term)),
      )
      .map((op) => {
        const table = config.tables.find((t) => t.id === op.tableId);
        const configured = Boolean(table?.active && table.basePrice !== null && op.multiplier !== null);
        const netPrice = configured ? table!.basePrice! * op.multiplier! : null;
        return {
          id: op.id,
          label: op.label,
          scope: op.scope === 'global' ? 'Global' : 'Adicional',
          netPrice,
          configured,
        };
      });
  }, [config, search]);

  const stats = useMemo(() => {
    const allOps = config?.operations.filter((o) => o.active) ?? [];
    const configuredOps = allOps.filter((op) => {
      const table = config?.tables.find((t) => t.id === op.tableId);
      return Boolean(table?.active && table.basePrice !== null && op.multiplier !== null);
    }).length;
    const totalPieces = groupedZones.reduce((acc, g) => acc + g.items.length, 0);
    return {
      totalPieces,
      configuredOps,
      pendingOps: allOps.length - configuredOps,
    };
  }, [config, groupedZones]);

  if (!allowed) {
    return (
      <div className="rounded-2xl border border-brand-line bg-white p-6 text-sm text-brand-coralInk" role="alert">
        Sin permiso para consultar tarifas D&amp;P.
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-brand-line bg-white py-14 text-sm text-brand-muted" role="status">
        <LoaderCircle className="h-5 w-5 animate-spin text-brand-primaryInk" aria-hidden="true" />
        Cargando tarifas D&amp;P…
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-brand-coral/30 bg-brand-coralPale p-4 text-sm text-brand-coralInk" role="alert">
        <span className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {getApiErrorMessage(query.error, 'Error al cargar tarifas D&P.')}
        </span>
        <button
          type="button"
          className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink shadow-2xs"
          onClick={() => void query.refetch()}
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="dp-catalog-explorer">
      {/* KPIs puntuales */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl border border-brand-line bg-white px-3.5 py-2.5">
          <span className="block text-[11px] font-medium text-brand-muted">Carrocería / Tamaño</span>
          <strong className="mt-0.5 block text-sm font-bold text-brand-primaryInk">
            {activeBody?.label ?? '—'} · {activeSize?.label ?? '—'}{' '}
            {activeSize ? `(×${factorLabel(activeSize.factor)})` : ''}
          </strong>
        </div>
        <div className="rounded-xl border border-brand-line bg-white px-3.5 py-2.5">
          <span className="block text-[11px] font-medium text-brand-muted">Piezas mostradas</span>
          <strong className="mt-0.5 block text-sm font-bold text-brand-ink">{stats.totalPieces}</strong>
        </div>
        <div className="rounded-xl border border-brand-line bg-white px-3.5 py-2.5">
          <span className="block text-[11px] font-medium text-brand-muted">Operaciones activas</span>
          <strong className="mt-0.5 flex items-center gap-2 text-sm font-bold text-brand-ink">
            <span>{stats.configuredOps} listas</span>
            {stats.pendingOps > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                {stats.pendingOps} pend.
              </span>
            )}
          </strong>
        </div>
        <div className="rounded-xl border border-brand-line bg-white px-3.5 py-2.5">
          <span className="block text-[11px] font-medium text-brand-muted">Tarifario vigente</span>
          <strong className="mt-0.5 block text-sm font-bold text-purple-700">Versión {revision}</strong>
        </div>
      </div>

      {/* Barra de controles interactivos */}
      <div className="rounded-2xl border border-brand-line bg-white p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Carrocerías */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Carrocería D&P">
            <span className="mr-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-muted">
              <Car className="h-3.5 w-3.5" aria-hidden="true" />
              Carrocería:
            </span>
            {bodies.map((body) => {
              const selected = activeBody?.id === body.id;
              return (
                <button
                  key={body.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setSelectedBodyId(body.id);
                    setSelectedSizeId('');
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    selected
                      ? 'bg-[#1d396a] text-white shadow-2xs'
                      : 'bg-[#f3f6fa] text-brand-ink hover:bg-[#e8eff8]'
                  }`}
                >
                  {body.label}
                </button>
              );
            })}
          </div>

          {/* Tamaños + Nivel de Daño */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1" role="group" aria-label="Tamaño D&P">
              <span className="mr-1 text-xs font-semibold text-brand-muted">Tamaño:</span>
              {sizes.map((size) => {
                const selected = activeSize?.id === size.id;
                return (
                  <button
                    key={size.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedSizeId(size.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      selected
                        ? 'bg-purple-700 text-white'
                        : 'bg-[#f3f6fa] text-brand-ink hover:bg-purple-50'
                    }`}
                  >
                    {size.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1" role="group" aria-label="Daño referencia D&P">
              <span className="mr-1 text-xs font-semibold text-brand-muted">Daño:</span>
              {damageLevels.map((lvl) => {
                const selected = activeDamage?.id === lvl.id;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedDamageId(lvl.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      selected
                        ? 'bg-amber-600 text-white'
                        : 'bg-[#f3f6fa] text-brand-ink hover:bg-amber-50'
                    }`}
                  >
                    {lvl.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Zonas + Buscador + Acciones */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-line/70 pt-3">
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Zonas del vehículo">
            <button
              type="button"
              onClick={() => setSelectedZone('all')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                selectedZone === 'all'
                  ? 'bg-brand-primaryInk text-white'
                  : 'bg-[#f3f6fa] text-brand-muted hover:text-brand-ink'
              }`}
            >
              Todas las zonas
            </button>
            {ZONE_ORDER.filter((z) => z !== 'otras' || groupedZones.some((g) => g.zone === 'otras')).map(
              (zoneKey) => (
                <button
                  key={zoneKey}
                  type="button"
                  onClick={() => setSelectedZone(zoneKey)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    selectedZone === zoneKey
                      ? 'bg-brand-primaryInk text-white'
                      : 'bg-[#f3f6fa] text-brand-muted hover:text-brand-ink'
                  }`}
                >
                  {ZONE_META[zoneKey].label}
                </button>
              ),
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-brand-muted" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar pieza o servicio…"
                aria-label="Filtrar piezas D&P"
                className="h-9 w-48 rounded-lg border border-brand-line bg-[#f6f8fb] pl-8 pr-2.5 text-xs text-brand-ink outline-none focus:border-brand-primary focus:bg-white"
              />
            </label>
            <button
              type="button"
              onClick={() =>
                onOpenCalculator({
                  bodyId: activeBody?.id,
                  sizeId: activeSize?.id,
                  damageId: activeDamage?.id,
                })
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 text-xs font-semibold text-purple-800 transition hover:bg-purple-100"
            >
              <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
              Calculadora
            </button>
            {canEditSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1d396a] px-3 text-xs font-semibold text-white transition hover:bg-[#003570]"
              >
                <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                Editar tarifas
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Zonas y Tarjetas con Precios Netos CLP */}
      {groupedZones.length === 0 ? (
        <div className="rounded-2xl border border-brand-line bg-white py-10 text-center text-sm text-brand-muted">
          Sin piezas para los filtros seleccionados.
        </div>
      ) : (
        <div className="space-y-4">
          {groupedZones.map((group) => (
            <section key={group.zone} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Layers className="h-4 w-4 text-purple-700" aria-hidden="true" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#1d396a]">
                  {group.label}
                </h2>
                <span className="rounded-full bg-[#e7edf5] px-2 py-0.5 text-[10px] font-bold text-[#294d7b]">
                  {group.items.length}
                </span>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.items.map((item) => (
                  <article
                    key={`${item.pieceId}:${item.positionId}`}
                    className="group flex flex-col justify-between rounded-xl border border-brand-line bg-white p-3.5 transition hover:border-purple-300 hover:shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-[#1d396a] leading-tight">
                          {item.pieceLabel}
                        </h3>
                        <span className="text-[11px] font-medium text-brand-muted">
                          {item.positionLabel}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenCalculator({
                            bodyId: activeBody?.id,
                            sizeId: activeSize?.id,
                            pieceId: item.pieceId,
                            positionId: item.positionId,
                            damageId: activeDamage?.id,
                          })
                        }
                        title="Simular combinación en calculadora"
                        className="rounded-lg bg-[#f3f6fa] px-2 py-1 text-[11px] font-semibold text-[#1d396a] transition group-hover:bg-purple-700 group-hover:text-white"
                      >
                        Simular
                      </button>
                    </div>

                    <dl className="mt-3 grid grid-cols-3 gap-1.5 border-t border-brand-line/70 pt-2.5 text-[11px]">
                      <div className="rounded-lg bg-[#f8fbff] px-2 py-1.5">
                        <dt className="flex items-center gap-1 text-[10px] text-brand-muted">
                          <Paintbrush className="h-2.5 w-2.5 text-purple-600" aria-hidden="true" />
                          Pintura
                        </dt>
                        <dd className="mt-0.5 font-bold text-[#1d396a] tabular-nums">
                          {item.paintPrice !== null ? formatClp(item.paintPrice) : 'Pend.'}
                        </dd>
                      </div>
                      <div className="rounded-lg bg-[#fffbf4] px-2 py-1.5">
                        <dt className="flex items-center gap-1 text-[10px] text-brand-muted">
                          <ShieldAlert className="h-2.5 w-2.5 text-amber-600" aria-hidden="true" />
                          Rep. {activeDamage?.label ?? 'D1'}
                        </dt>
                        <dd className="mt-0.5 font-bold text-amber-900 tabular-nums">
                          {item.repairPrice !== null ? formatClp(item.repairPrice) : 'Pend.'}
                        </dd>
                      </div>
                      <div className="rounded-lg bg-[#f6f8fb] px-2 py-1.5">
                        <dt className="flex items-center gap-1 text-[10px] text-brand-muted">
                          <Wrench className="h-2.5 w-2.5 text-slate-500" aria-hidden="true" />
                          Desm.
                        </dt>
                        <dd className="mt-0.5 font-bold text-slate-700 tabular-nums">
                          {item.dismantlePrice !== null ? formatClp(item.dismantlePrice) : 'Pend.'}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Servicios Globales y Adicionales */}
      {specialOperations.length > 0 && (
        <section className="rounded-2xl border border-brand-line bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-700" aria-hidden="true" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#1d396a]">
              Servicios Globales y Adicionales
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {specialOperations.map((op) => (
              <div
                key={op.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-brand-line/80 bg-[#fbfcfe] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <strong className="block truncate text-xs font-semibold text-brand-ink">
                    {op.label}
                  </strong>
                  <span className="text-[10px] font-medium text-brand-muted">{op.scope}</span>
                </div>
                {op.configured ? (
                  <span className="shrink-0 text-xs font-bold text-[#1d396a] tabular-nums">
                    {formatClp(op.netPrice!)}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    Tarifa pendiente
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
