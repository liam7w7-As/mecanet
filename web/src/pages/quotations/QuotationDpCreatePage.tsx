import {
  calculateDpWorkQuote,
  calculateQuotationPricing,
  createQuotationSchema,
  dpQuoteInputSchema,
  type CatalogDivision,
  type CatalogSubtype,
  type CatalogType,
  type DiscountType,
  type DpConfiguration,
  type DpQuoteInput,
  type DpWorkQuote,
} from '@unithor/shared';
import {
  AlertCircle,
  Car,
  Check,
  CheckCircle2,
  Globe,
  LoaderCircle,
  Package,
  Paintbrush,
  Pencil,
  Plus,
  ReceiptText,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserRound,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import ClientFormModal from '../../components/clients/ClientFormModal';
import QuickVehicleSearch from '../../components/common/QuickVehicleSearch';
import SavingOverlay from '../../components/common/SavingOverlay';
import DpVehicleMap, { type PieceVisualStatus } from '../../components/quotations/DpVehicleMap';
import QuotationCommercialFields, { createCommercialDraft } from '../../components/quotations/QuotationCommercialFields';
import QuotationDiscountSummary from '../../components/quotations/QuotationDiscountSummary';
import VehicleDpDetailsModal from '../../components/vehicles/VehicleDpDetailsModal';
import { useCatalogItems } from '../../hooks/useCatalog';
import { useDpConfiguration, useDpQuotePreview } from '../../hooks/useDpConfiguration';
import { useCreateQuotationMutation } from '../../hooks/useQuotations';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { formatClp } from '../../lib/formatters';
import { notifySuccess } from '../../stores/toast.store';

import type { CatalogItem, QuickSearchClient, QuickSearchVehicle } from '../../types/entities';

type WorkspaceMode = 'piece' | 'global' | 'acc';

interface DraftLine {
  key: string;
  division: CatalogDivision;
  subtipo: CatalogSubtype;
  tipoLinea: CatalogType;
  catalogItemId: number | null;
  descripcion: string;
  unidadMedida: CatalogItem['unidadMedida'];
  cantidad: string;
  precioUnitario: string;
  descuentoTipo: DiscountType | null;
  descuentoValor: string;
  esAPedido?: boolean;
  dpPricing?: DpQuoteInput;
  dpPricingSnapshot?: DpWorkQuote | null;
}

const factorLabel = (v: number) =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 }).format(v);

export const QuotationDpCreatePage = () => {
  const navigate = useNavigate();
  const dpQuery = useDpConfiguration('catalog', true);
  const dpPreview = useDpQuotePreview();
  const createMutation = useCreateQuotationMutation();
  const submissionInFlight = useRef(false);

  const config = dpQuery.data?.configuration;
  const revision = dpQuery.data?.revision ?? 1;

  // Cliente & Vehículo (con patente o sin patente)
  const [client, setClient] = useState<Pick<QuickSearchClient, 'id' | 'nombre' | 'rut'> | null>(null);
  const [showClientModal, setShowClientModal] = useState(false);

  const [vehicleMode, setVehicleMode] = useState<'no_plate' | 'registered'>('no_plate');
  const [selectedVehicle, setSelectedVehicle] = useState<QuickSearchVehicle | null>(null);
  const [candidateVehicleId, setCandidateVehicleId] = useState<number | null>(null);

  const [bodyTypeId, setBodyTypeId] = useState('');
  const [sizeId, setSizeId] = useState('');
  const [vehicleRef, setVehicleRef] = useState('');

  // Workspace activo: pieza / global / ACC
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('piece');

  // Estado de edición de pieza D&P
  const [selectedPieceKey, setSelectedPieceKey] = useState<string | null>(null);
  const [editingLineKey, setEditingLineKey] = useState<string | null>(null);
  const [opIds, setOpIds] = useState<string[]>([]);
  const [damageLevelId, setDamageLevelId] = useState('');
  const [pieceDiscountType, setPieceDiscountType] = useState<DiscountType | null>(null);
  const [pieceDiscountValue, setPieceDiscountValue] = useState('');
  const [pieceError, setPieceError] = useState('');

  // Estado de repuestos ACC
  const [accSearch, setAccSearch] = useState('');
  const [accSubtype, setAccSubtype] = useState<'all' | 'en_stock' | 'a_pedido'>('all');
  const accCatalogQuery = useCatalogItems(
    {
      search: accSearch || undefined,
      division: 'ACC',
      subtipo: accSubtype === 'all' ? undefined : accSubtype,
      pageSize: 8,
    },
    workspaceMode === 'acc',
  );

  // Líneas del presupuesto + condiciones comerciales
  const [items, setItems] = useState<DraftLine[]>([]);
  const [commercial, setCommercial] = useState(() => createCommercialDraft());
  const [notas, setNotas] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Derivar carrocería y tamaño activos
  const bodies = useMemo(() => config?.bodyTypes.filter((b) => b.active) ?? [], [config]);
  const activeBody = useMemo(
    () => bodies.find((b) => b.id === bodyTypeId) ?? bodies[0],
    [bodies, bodyTypeId],
  );
  const sizes = useMemo(() => activeBody?.sizes.filter((s) => s.active) ?? [], [activeBody]);
  const activeSize = useMemo(
    () => sizes.find((s) => s.id === sizeId) ?? sizes[0],
    [sizes, sizeId],
  );

  useEffect(() => {
    if (!bodyTypeId && activeBody) setBodyTypeId(activeBody.id);
    if (!sizeId && activeSize) setSizeId(activeSize.id);
  }, [bodyTypeId, sizeId, activeBody, activeSize]);

  const pieceMap = useMemo(
    () => new Map(config?.pieces.filter((p) => p.active).map((p) => [p.id, p.label]) ?? []),
    [config],
  );
  const activeRates = useMemo(
    () =>
      config?.rates.filter(
        (r) => r.active && r.bodyTypeId === activeBody?.id && pieceMap.has(r.pieceId),
      ) ?? [],
    [config, activeBody?.id, pieceMap],
  );

  // Operaciones agrupadas para el editor de pieza o global
  const allOps = useMemo(() => config?.operations.filter((o) => o.active) ?? [], [config]);
  const formulaFor = (tableId: string) =>
    config?.tables.find((t) => t.id === tableId)?.formula;
  const isOpPending = (op: DpConfiguration['operations'][number]) => {
    const table = config?.tables.find((t) => t.id === op.tableId);
    return !table?.active || table.basePrice === null || op.multiplier === null;
  };

  const pieceOps = useMemo(
    () => allOps.filter((o) => o.scope === 'piece' || o.scope === 'additional'),
    [allOps],
  );
  const repairOps = useMemo(
    () => pieceOps.filter((o) => formulaFor(o.tableId) === 'repair'),
    [pieceOps, config],
  );
  const paintingOps = useMemo(
    () => pieceOps.filter((o) => formulaFor(o.tableId) === 'painting'),
    [pieceOps, config],
  );
  const dismantlingOp = useMemo(
    () => pieceOps.find((o) => o.id === 'dismantling' || formulaFor(o.tableId) === 'dismantling'),
    [pieceOps, config],
  );
  const polishingOp = useMemo(
    () => pieceOps.find((o) => o.id === 'polishing_piece' || o.tableId === 'polishing'),
    [pieceOps],
  );
  const replacementOp = useMemo(
    () => pieceOps.find((o) => o.id === 'replacement_piece' || o.tableId === 'replacement'),
    [pieceOps],
  );
  const coreIds = useMemo(
    () =>
      new Set([
        ...repairOps.map((o) => o.id),
        ...paintingOps.map((o) => o.id),
        ...(dismantlingOp ? [dismantlingOp.id] : []),
        ...(polishingOp ? [polishingOp.id] : []),
        ...(replacementOp ? [replacementOp.id] : []),
      ]),
    [repairOps, paintingOps, dismantlingOp, polishingOp, replacementOp],
  );
  const additionalOps = useMemo(
    () => allOps.filter((o) => o.scope === 'additional' || (o.scope === 'piece' && !coreIds.has(o.id))),
    [allOps, coreIds],
  );
  const globalOps = useMemo(
    () => allOps.filter((o) => o.scope === 'global'),
    [allOps],
  );

  // Recalcular ítems D&P existentes si cambia la carrocería o el tamaño del vehículo
  const syncExistingDpClassification = (nextBodyId: string, nextSizeId: string) => {
    if (!config) return;
    setItems((current) =>
      current.flatMap((line) => {
        if (line.division !== 'DP' || !line.dpPricing) return [line];
        const nextSelection: DpQuoteInput = {
          ...line.dpPricing,
          configurationRevision: revision,
          bodyTypeId: nextBodyId,
          sizeId: nextSizeId,
        };
        try {
          const quote = calculateDpWorkQuote(config, dpQuoteInputSchema.parse(nextSelection), revision);
          return [{
            ...line,
            precioUnitario: String(quote.precioUnitario),
            dpPricing: quote.selection,
            dpPricingSnapshot: quote,
          }];
        } catch {
          // Si esa pieza específica no existe en la nueva carrocería (ej. lateral_pickup vs sedan), se omite
          return [];
        }
      }),
    );
  };

  const handleChangeBody = (nextBodyId: string) => {
    const nextBody = bodies.find((b) => b.id === nextBodyId);
    const nextSizes = nextBody?.sizes.filter((s) => s.active) ?? [];
    const nextSizeId = nextSizes.some((s) => s.id === sizeId) ? sizeId : (nextSizes[0]?.id ?? '');
    setBodyTypeId(nextBodyId);
    setSizeId(nextSizeId);
    setSelectedPieceKey(null);
    setEditingLineKey(null);
    setOpIds([]);
    setDamageLevelId('');
    if (nextBodyId && nextSizeId) {
      syncExistingDpClassification(nextBodyId, nextSizeId);
    }
  };

  const handleChangeSize = (nextSizeId: string) => {
    setSizeId(nextSizeId);
    if (activeBody && nextSizeId) {
      syncExistingDpClassification(activeBody.id, nextSizeId);
    }
  };

  // Mapa visual de piezas ya configuradas en el presupuesto
  const configuredPieces = useMemo(() => {
    const map = new Map<string, PieceVisualStatus>();
    for (const item of items) {
      const sel = item.dpPricing;
      if (item.division !== 'DP' || !sel || sel.scope !== 'piece' || !sel.pieceId || !sel.positionId) continue;
      const key = `${sel.pieceId}:${sel.positionId}`;
      const hasRepair = sel.operations.some((op) => repairOps.some((r) => r.id === op.operationId));
      const hasPaint = sel.operations.some((op) => paintingOps.some((p) => p.id === op.operationId));
      const hasReplacement = sel.operations.some((op) => op.operationId === replacementOp?.id);
      map.set(key, {
        hasRepair,
        hasPaint,
        hasReplacement,
        damageLabel: item.dpPricingSnapshot?.damageLabel ?? null,
      });
    }
    return map;
  }, [items, repairOps, paintingOps, replacementOp]);

  // Al seleccionar una pieza en el mapa
  const selectPieceOnMap = (pieceId: string, positionId: string) => {
    const key = `${pieceId}:${positionId}`;
    setSelectedPieceKey(key);
    setPieceError('');
    const existing = items.find(
      (l) => l.division === 'DP' && l.dpPricing?.scope === 'piece' && l.dpPricing.pieceId === pieceId && l.dpPricing.positionId === positionId,
    );
    if (existing?.dpPricing) {
      setEditingLineKey(existing.key);
      setOpIds(existing.dpPricing.operations.map((o) => o.operationId));
      setDamageLevelId(existing.dpPricing.damageLevelId ?? '');
      setPieceDiscountType(existing.descuentoTipo);
      setPieceDiscountValue(existing.descuentoValor && existing.descuentoValor !== '0' ? existing.descuentoValor : '');
    } else {
      setEditingLineKey(null);
      setOpIds([]);
      setDamageLevelId('');
      setPieceDiscountType(null);
      setPieceDiscountValue('');
    }
  };

  // Selección exclusiva en grupos (Reparación o Pintura)
  const setExclusiveGroupOp = (group: DpConfiguration['operations'], opId: string | null) => {
    setPieceError('');
    setOpIds((current) => {
      const filtered = current.filter((id) => !group.some((g) => g.id === id));
      return opId ? [...filtered, opId] : filtered;
    });
    if (group === repairOps && !opId) {
      setDamageLevelId('');
    }
  };

  const toggleSingleOp = (opId: string) => {
    setPieceError('');
    setOpIds((current) =>
      current.includes(opId) ? current.filter((id) => id !== opId) : [...current, opId],
    );
  };

  const needsDamage = opIds.some((id) => repairOps.some((r) => r.id === id && r.requiresDamage));

  // Cálculo en vivo para la pieza o global actual
  const activePieceParts = selectedPieceKey ? selectedPieceKey.split(':') : null;
  const activeRate = activePieceParts
    ? activeRates.find((r) => r.pieceId === activePieceParts[0] && r.positionId === activePieceParts[1])
    : null;

  const currentSelectionInput = useMemo((): DpQuoteInput | null => {
    if (!config || !activeBody || !activeSize || opIds.length === 0) return null;
    if (workspaceMode === 'piece' && !activeRate) return null;
    if (workspaceMode === 'acc') return null;

    const candidate = {
      configurationRevision: revision,
      bodyTypeId: activeBody.id,
      sizeId: activeSize.id,
      scope: workspaceMode,
      ...(workspaceMode === 'piece' && activeRate
        ? { pieceId: activeRate.pieceId, positionId: activeRate.positionId }
        : {}),
      ...(needsDamage && damageLevelId ? { damageLevelId } : {}),
      operations: opIds.map((operationId) => ({ operationId })),
    };
    const parsed = dpQuoteInputSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  }, [config, activeBody, activeSize, revision, workspaceMode, activeRate, opIds, needsDamage, damageLevelId]);

  const liveDpQuote = useMemo((): DpWorkQuote | null => {
    if (!config || !currentSelectionInput) return null;
    try {
      return calculateDpWorkQuote(config, currentSelectionInput, revision);
    } catch {
      return null;
    }
  }, [config, currentSelectionInput, revision]);

  const liveLineNet = useMemo(() => {
    if (!liveDpQuote) return null;
    try {
      return calculateQuotationPricing([
        {
          cantidad: 1,
          precioUnitario: liveDpQuote.precioUnitario,
          descuentoTipo: pieceDiscountType,
          descuentoValor: pieceDiscountValue || 0,
        },
      ]).total;
    } catch {
      return null;
    }
  }, [liveDpQuote, pieceDiscountType, pieceDiscountValue]);

  const commitDpSelection = async () => {
    if (!currentSelectionInput || !liveDpQuote || dpPreview.isPending) {
      setPieceError('Selecciona las operaciones y nivel de daño requerido.');
      return;
    }
    setPieceError('');
    try {
      const quote = await dpPreview.mutateAsync(currentSelectionInput);
      const targetLabel = quote.pieceLabel
        ? `${quote.pieceLabel}${quote.positionLabel ? ` · ${quote.positionLabel}` : ''}`
        : 'Vehículo completo';
      const opsLabel = quote.lines.map((l) => l.label).join(', ');
      const nextLine: DraftLine = {
        key: editingLineKey ?? `dp-${crypto.randomUUID()}`,
        division: 'DP',
        subtipo: 'servicio_dp',
        tipoLinea: 'estandar',
        catalogItemId: null,
        descripcion: `${targetLabel} — ${opsLabel}`.slice(0, 255),
        unidadMedida: 'unidad',
        cantidad: '1',
        precioUnitario: String(quote.precioUnitario),
        descuentoTipo: pieceDiscountType,
        descuentoValor: pieceDiscountType ? pieceDiscountValue || '0' : '0',
        dpPricing: quote.selection,
        dpPricingSnapshot: quote,
      };
      setItems((current) =>
        editingLineKey
          ? current.map((l) => (l.key === editingLineKey ? nextLine : l))
          : [...current, nextLine],
      );
      setEditingLineKey(null);
      setSelectedPieceKey(null);
      setOpIds([]);
      setDamageLevelId('');
      setPieceDiscountType(null);
      setPieceDiscountValue('');
    } catch (err) {
      setPieceError(getApiErrorMessage(err, 'No se pudo validar la tarifa D&P.'));
    }
  };

  const addAccPart = (catalogItem: CatalogItem) => {
    setItems((current) => {
      const existing = current.find((l) => l.catalogItemId === catalogItem.id);
      if (existing) {
        return current.map((l) =>
          l.key === existing.key ? { ...l, cantidad: String(Number(l.cantidad) + 1) } : l,
        );
      }
      return [
        ...current,
        {
          key: `acc-${catalogItem.id}-${crypto.randomUUID()}`,
          division: 'ACC',
          subtipo: catalogItem.subtipo === 'a_pedido' ? 'a_pedido' : 'en_stock',
          tipoLinea: 'parte',
          catalogItemId: catalogItem.id,
          descripcion: catalogItem.nombre,
          unidadMedida: catalogItem.unidadMedida,
          cantidad: '1',
          precioUnitario: String(catalogItem.precio),
          descuentoTipo: null,
          descuentoValor: '0',
          esAPedido: catalogItem.subtipo === 'a_pedido',
        },
      ];
    });
  };

  const handleCreateQuotation = async () => {
    if (createMutation.isPending || submissionInFlight.current) return;
    if (!client) {
      setErrors({ _form: 'Selecciona un cliente.' });
      return;
    }
    if (vehicleMode === 'registered' && !selectedVehicle) {
      setErrors({ _form: 'Selecciona un vehículo registrado o cambia a Sin patente.' });
      return;
    }
    if (items.length === 0) {
      setErrors({ _form: 'Agrega al menos una pieza o servicio al presupuesto.' });
      return;
    }

    const parsed = createQuotationSchema.safeParse({
      ...commercial,
      clientId: client.id,
      vehicleId: vehicleMode === 'registered' ? selectedVehicle?.id ?? null : null,
      dpBodyTypeId: activeBody?.id ?? null,
      dpSizeId: activeSize?.id ?? null,
      dpVehicleRef:
        vehicleMode === 'registered' && selectedVehicle
          ? `${selectedVehicle.patente} ${selectedVehicle.marca ?? ''} ${selectedVehicle.modelo ?? ''}`.trim()
          : vehicleRef.trim() || null,
      notas,
      items: items.map((item) => ({
        catalogItemId: item.catalogItemId,
        division: item.division,
        subtipo: item.subtipo,
        tipoLinea: item.tipoLinea,
        descripcion: item.descripcion,
        unidadMedida: item.unidadMedida,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        descuentoTipo: item.descuentoTipo,
        descuentoValor: item.descuentoValor,
        estadoOperativo: 'pendiente',
        notasOperativas: null,
        ...(item.dpPricing ? { dpPricing: item.dpPricing } : {}),
      })),
    });

    if (!parsed.success) {
      const nextErrors = getFieldErrors(parsed.error.issues);
      if (!nextErrors._form) {
        nextErrors._form = parsed.error.issues[0]?.message ?? 'Revisa los datos del presupuesto.';
      }
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    submissionInFlight.current = true;
    try {
      const created = await createMutation.mutateAsync(parsed.data);
      notifySuccess(`Cotización D&P ${created.codigo} creada.`);
      navigate(`/quotations/${created.id}`);
    } catch {
      submissionInFlight.current = false;
    }
  };

  if (dpQuery.isPending) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-brand-muted" role="status">
        <LoaderCircle className="h-5 w-5 animate-spin text-[#1d396a]" aria-hidden="true" />
        Cargando configurador D&amp;P…
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-2xl border border-brand-coral/30 bg-brand-coralPale p-6 text-sm text-brand-coralInk" role="alert">
        {getApiErrorMessage(dpQuery.error, 'No se pudo cargar la configuración D&P.')}
      </div>
    );
  }

  const activePieceLabel = activeRate
    ? `${pieceMap.get(activeRate.pieceId) ?? activeRate.pieceId} · ${activeRate.positionLabel}`
    : null;

  return (
    <div className="min-w-0 space-y-4 pb-8" data-testid="quotation-dp-page">
      {createMutation.isPending && <SavingOverlay message="Emitiendo cotización D&P…" />}

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-700 text-white shadow-xs">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-[#1d396a] sm:text-2xl">Cotización D&amp;P</h1>
          </div>
        </div>
        <Link
          to="/quotations"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-line bg-white px-3.5 text-xs font-semibold text-brand-ink transition hover:bg-brand-pale"
        >
          <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
          Ver cotizaciones
        </Link>
      </header>

      {/* Cabecera Cliente + Vehículo */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Cliente */}
        <section className="rounded-2xl border border-brand-line bg-white p-4 shadow-2xs" aria-label="Cliente">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#1d396a]">
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
              Cliente
            </h2>
            <button
              type="button"
              onClick={() => setShowClientModal(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-[#eef3fa] px-2.5 py-1 text-xs font-semibold text-[#1d396a] hover:bg-[#dfe9f7]"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Nuevo
            </button>
          </div>

          {client ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5">
              <div className="min-w-0">
                <strong className="block truncate text-sm font-bold text-brand-ink">{client.nombre}</strong>
                {client.rut && <span className="text-xs text-brand-muted">{client.rut}</span>}
              </div>
              <button
                type="button"
                onClick={() => setClient(null)}
                className="shrink-0 rounded-lg border border-brand-line bg-white px-2.5 py-1 text-xs font-semibold text-brand-muted hover:text-brand-ink"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <QuickVehicleSearch
              mode="clients"
              allowCreateClient
              placeholder="Buscar cliente por nombre o RUT…"
              onSelectClient={(c) => {
                setClient(c);
                setErrors({});
              }}
            />
          )}
        </section>

        {/* Vehículo (Sin patente o Registrado) */}
        <section className="rounded-2xl border border-brand-line bg-white p-4 shadow-2xs" aria-label="Vehículo">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#1d396a]">
              <Car className="h-3.5 w-3.5" aria-hidden="true" />
              Vehículo
            </h2>
            <div className="flex gap-1 rounded-lg bg-[#f3f6fa] p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                aria-pressed={vehicleMode === 'no_plate'}
                onClick={() => {
                  setVehicleMode('no_plate');
                  setSelectedVehicle(null);
                }}
                className={`rounded-md px-2.5 py-1 transition ${
                  vehicleMode === 'no_plate'
                    ? 'bg-[#1d396a] text-white'
                    : 'text-brand-muted hover:text-brand-ink'
                }`}
              >
                Sin patente
              </button>
              <button
                type="button"
                aria-pressed={vehicleMode === 'registered'}
                onClick={() => setVehicleMode('registered')}
                className={`rounded-md px-2.5 py-1 transition ${
                  vehicleMode === 'registered'
                    ? 'bg-[#1d396a] text-white'
                    : 'text-brand-muted hover:text-brand-ink'
                }`}
              >
                Con patente
              </button>
            </div>
          </div>

          {vehicleMode === 'registered' ? (
            selectedVehicle ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5">
                <div className="min-w-0">
                  <strong className="block font-mono text-sm font-bold text-[#1d396a]">
                    {selectedVehicle.patente}
                  </strong>
                  <span className="block truncate text-xs text-brand-muted">
                    {[selectedVehicle.marca, selectedVehicle.modelo, activeBody?.label, activeSize?.label]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedVehicle(null)}
                  className="shrink-0 rounded-lg border border-brand-line bg-white px-2.5 py-1 text-xs font-semibold text-brand-muted hover:text-brand-ink"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <QuickVehicleSearch
                mode="vehicles"
                placeholder="Buscar patente…"
                onSelectVehicle={(v) => {
                  if (v.dpBodyTypeId && v.dpSizeId) {
                    setSelectedVehicle(v);
                    setBodyTypeId(v.dpBodyTypeId);
                    setSizeId(v.dpSizeId);
                    syncExistingDpClassification(v.dpBodyTypeId, v.dpSizeId);
                  } else {
                    setCandidateVehicleId(v.id);
                  }
                }}
              />
            )
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1" role="group" aria-label="Carrocería">
                  {bodies.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      aria-pressed={activeBody?.id === b.id}
                      onClick={() => handleChangeBody(b.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        activeBody?.id === b.id
                          ? 'bg-[#1d396a] text-white'
                          : 'bg-[#f3f6fa] text-brand-ink hover:bg-[#e7edf5]'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 border-l border-brand-line pl-2" role="group" aria-label="Tamaño">
                  {sizes.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={activeSize?.id === s.id}
                      onClick={() => handleChangeSize(s.id)}
                      className={`rounded-lg px-2 py-1 text-xs font-bold transition ${
                        activeSize?.id === s.id
                          ? 'bg-purple-700 text-white'
                          : 'bg-[#f3f6fa] text-brand-ink hover:bg-purple-50'
                      }`}
                    >
                      {s.label} ({factorLabel(s.factor)})
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={vehicleRef}
                  maxLength={140}
                  onChange={(e) => setVehicleRef(e.target.value)}
                  placeholder="Marca / Modelo (opcional, ej: Toyota RAV4)"
                  aria-label="Referencia del vehículo"
                  className="h-9 min-w-[200px] flex-1 rounded-lg border border-brand-line bg-[#f8fafc] px-3 text-xs text-brand-ink outline-none focus:border-brand-primary focus:bg-white"
                />
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-800">
                  Patente obligatoria en OT
                </span>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Workspace principal de 2 columnas */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.9fr)] lg:items-start">
        {/* Columna Izquierda: Selector Visual e Interactivo */}
        <div className="space-y-4">
          {/* Tabs de alcance */}
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-brand-line bg-white p-1.5 shadow-2xs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={workspaceMode === 'piece'}
              onClick={() => {
                setWorkspaceMode('piece');
                setEditingLineKey(null);
                setOpIds([]);
                setDamageLevelId('');
                setPieceDiscountType(null);
                setPieceDiscountValue('');
                setPieceError('');
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                workspaceMode === 'piece'
                  ? 'bg-[#1d396a] text-white'
                  : 'text-brand-muted hover:bg-brand-pale hover:text-brand-ink'
              }`}
            >
              <Car className="h-3.5 w-3.5" aria-hidden="true" />
              Por pieza
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceMode === 'global'}
              onClick={() => {
                setWorkspaceMode('global');
                setSelectedPieceKey(null);
                setEditingLineKey(null);
                setOpIds([]);
                setDamageLevelId('');
                setPieceDiscountType(null);
                setPieceDiscountValue('');
                setPieceError('');
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                workspaceMode === 'global'
                  ? 'bg-[#1d396a] text-white'
                  : 'text-brand-muted hover:bg-brand-pale hover:text-brand-ink'
              }`}
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              Global / Completo
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceMode === 'acc'}
              onClick={() => setWorkspaceMode('acc')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                workspaceMode === 'acc'
                  ? 'bg-amber-600 text-white'
                  : 'text-brand-muted hover:bg-amber-50 hover:text-amber-900'
              }`}
            >
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              Repuestos ACC
            </button>
          </div>

          {workspaceMode === 'piece' && activeBody && (
            <>
              <DpVehicleMap
                bodyTypeId={activeBody.id}
                rates={activeRates}
                pieces={pieceMap}
                selectedPieceKey={selectedPieceKey}
                configuredPieces={configuredPieces}
                onSelectPiece={selectPieceOnMap}
              />

              {/* Configurador de pieza seleccionada */}
              {activeRate ? (
                <section
                  className="rounded-2xl border border-purple-200 bg-[#f8fbff] p-4 shadow-2xs space-y-4"
                  aria-label={`Configurar ${activePieceLabel}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-200/70 pb-2.5">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                        {editingLineKey ? 'Editando pieza' : 'Configurar pieza'}
                      </span>
                      <h3 className="text-base font-bold text-[#1d396a]">{activePieceLabel}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPieceKey(null);
                        setEditingLineKey(null);
                        setOpIds([]);
                        setDamageLevelId('');
                      }}
                      className="rounded-lg border border-brand-line bg-white px-2.5 py-1 text-xs font-semibold text-brand-muted hover:text-brand-ink"
                    >
                      Limpiar
                    </button>
                  </div>

                  {/* Reparación */}
                  <div className="space-y-1.5">
                    <span className="flex items-center gap-1 text-xs font-bold text-brand-ink">
                      <ShieldAlert className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                      Reparación
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setExclusiveGroupOp(repairOps, null)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          !opIds.some((id) => repairOps.some((r) => r.id === id))
                            ? 'border-[#1d396a] bg-[#1d396a] text-white'
                            : 'border-brand-line bg-white text-brand-muted hover:text-brand-ink'
                        }`}
                      >
                        Sin reparación
                      </button>
                      {repairOps.map((op) => {
                        const selected = opIds.includes(op.id);
                        const disabled = isOpPending(op);
                        return (
                          <button
                            key={op.id}
                            type="button"
                            disabled={disabled}
                            aria-pressed={selected}
                            onClick={() => setExclusiveGroupOp(repairOps, selected ? null : op.id)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                              selected
                                ? 'border-amber-600 bg-amber-600 text-white'
                                : 'border-brand-line bg-white text-brand-ink hover:border-amber-300'
                            }`}
                          >
                            {op.label}
                            {disabled && ' (Pend.)'}
                          </button>
                        );
                      })}
                    </div>

                    {/* Daño D1 / D2 / D3 */}
                    {needsDamage && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 pt-1" role="group" aria-label="Nivel de daño">
                        <span className="text-xs font-bold text-amber-900">Nivel de daño:</span>
                        {config.damageLevels.filter((d) => d.active).map((lvl) => (
                          <button
                            key={lvl.id}
                            type="button"
                            aria-pressed={damageLevelId === lvl.id}
                            onClick={() => {
                              setDamageLevelId(lvl.id);
                              setPieceError('');
                            }}
                            className={`rounded-lg border px-3 py-1 text-xs font-bold transition ${
                              damageLevelId === lvl.id
                                ? 'border-amber-700 bg-amber-700 text-white'
                                : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-50'
                            }`}
                          >
                            {lvl.label} (+{factorLabel(lvl.increment)})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pintura */}
                  <div className="space-y-1.5">
                    <span className="flex items-center gap-1 text-xs font-bold text-brand-ink">
                      <Paintbrush className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                      Pintura
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setExclusiveGroupOp(paintingOps, null)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          !opIds.some((id) => paintingOps.some((p) => p.id === id))
                            ? 'border-[#1d396a] bg-[#1d396a] text-white'
                            : 'border-brand-line bg-white text-brand-muted hover:text-brand-ink'
                        }`}
                      >
                        Sin pintura
                      </button>
                      {paintingOps.map((op) => {
                        const selected = opIds.includes(op.id);
                        const disabled = isOpPending(op);
                        return (
                          <button
                            key={op.id}
                            type="button"
                            disabled={disabled}
                            aria-pressed={selected}
                            onClick={() => setExclusiveGroupOp(paintingOps, selected ? null : op.id)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                              selected
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-brand-line bg-white text-brand-ink hover:border-blue-300'
                            }`}
                          >
                            {op.label}
                            {disabled && ' (Pend.)'}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Complementos de pieza */}
                  <div className="flex flex-wrap gap-2">
                    {[dismantlingOp, polishingOp, replacementOp]
                      .filter((op): op is DpConfiguration['operations'][number] => Boolean(op))
                      .map((op) => {
                        const selected = opIds.includes(op.id);
                        const disabled = isOpPending(op);
                        return (
                          <button
                            key={op.id}
                            type="button"
                            disabled={disabled}
                            aria-pressed={selected}
                            onClick={() => toggleSingleOp(op.id)}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                              selected
                                ? 'border-purple-700 bg-purple-700 text-white'
                                : 'border-brand-line bg-white text-brand-ink hover:bg-brand-pale'
                            }`}
                          >
                            {selected && <Check className="h-3 w-3" aria-hidden="true" />}
                            {op.label}
                            {disabled && ' (Pend.)'}
                          </button>
                        );
                      })}
                  </div>

                  {/* Adicionales + Descuento compacto */}
                  {additionalOps.length > 0 && (
                    <details className="rounded-xl border border-brand-line bg-white px-3 py-2 text-xs">
                      <summary className="cursor-pointer font-semibold text-brand-ink">
                        Adicionales ({opIds.filter((id) => additionalOps.some((a) => a.id === id)).length})
                      </summary>
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        {additionalOps.map((op) => {
                          const disabled = isOpPending(op);
                          return (
                            <label key={op.id} className="flex items-center gap-2 text-xs text-brand-ink">
                              <input
                                type="checkbox"
                                disabled={disabled}
                                checked={opIds.includes(op.id)}
                                onChange={() => toggleSingleOp(op.id)}
                                className="h-4 w-4 accent-[#1d396a]"
                              />
                              <span className={disabled ? 'text-brand-muted' : ''}>
                                {op.label}
                                {disabled && ' (Pend.)'}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </details>
                  )}

                  {/* Descuento y confirmación de la pieza */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-purple-200/80 pt-3">
                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Tipo descuento pieza"
                        value={pieceDiscountType ?? ''}
                        onChange={(e) => {
                          setPieceDiscountType((e.target.value as DiscountType) || null);
                          setPieceDiscountValue('');
                        }}
                        className="h-9 rounded-lg border border-brand-line bg-white px-2 text-xs text-brand-ink"
                      >
                        <option value="">Sin dto.</option>
                        <option value="porcentaje">Dto. %</option>
                        <option value="fijo">Dto. $</option>
                      </select>
                      {pieceDiscountType && (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          max={pieceDiscountType === 'porcentaje' ? 100 : undefined}
                          aria-label="Valor descuento pieza"
                          value={pieceDiscountValue}
                          onChange={(e) => setPieceDiscountValue(e.target.value)}
                          placeholder="0"
                          className="h-9 w-24 rounded-lg border border-brand-line bg-white px-2 text-xs text-brand-ink"
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="block text-[10px] text-brand-muted">Neto pieza</span>
                        <strong className="text-base font-extrabold text-[#1d396a] tabular-nums">
                          {liveLineNet !== null ? formatClp(liveLineNet) : '—'}
                        </strong>
                      </div>
                      <button
                        type="button"
                        disabled={!liveDpQuote || liveLineNet === null || dpPreview.isPending}
                        onClick={() => void commitDpSelection()}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-purple-700 px-4 text-xs font-bold text-white shadow-xs transition hover:bg-purple-800 disabled:opacity-45"
                      >
                        {dpPreview.isPending ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : editingLineKey ? (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        )}
                        {editingLineKey ? 'Actualizar pieza' : 'Agregar pieza'}
                      </button>
                    </div>
                  </div>
                  {pieceError && (
                    <p className="text-xs font-semibold text-brand-coralInk" role="alert">
                      {pieceError}
                    </p>
                  )}
                </section>
              ) : (
                <div className="rounded-xl border border-dashed border-brand-line bg-white py-5 text-center text-xs font-semibold text-brand-muted">
                  Toca una pieza del vehículo
                </div>
              )}
            </>
          )}

          {workspaceMode === 'global' && (
            <section className="rounded-2xl border border-brand-line bg-white p-4 shadow-2xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#1d396a]">
                Servicios globales de vehículo completo
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {globalOps.map((op) => {
                  const selected = opIds.includes(op.id);
                  const disabled = isOpPending(op);
                  return (
                    <button
                      key={op.id}
                      type="button"
                      disabled={disabled}
                      aria-pressed={selected}
                      onClick={() => toggleSingleOp(op.id)}
                      className={`flex items-center justify-between rounded-xl border p-3 text-left text-xs font-semibold transition disabled:opacity-50 ${
                        selected
                          ? 'border-purple-600 bg-purple-50 text-purple-950'
                          : 'border-brand-line bg-white text-brand-ink hover:bg-brand-pale'
                      }`}
                    >
                      <span>{op.label}</span>
                      {disabled ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
                          Pendiente
                        </span>
                      ) : selected ? (
                        <CheckCircle2 className="h-4 w-4 text-purple-700" aria-hidden="true" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between border-t border-brand-line pt-3">
                <strong className="text-base font-extrabold text-[#1d396a] tabular-nums">
                  {liveLineNet !== null ? formatClp(liveLineNet) : '—'}
                </strong>
                <button
                  type="button"
                  disabled={!liveDpQuote || dpPreview.isPending}
                  onClick={() => void commitDpSelection()}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-purple-700 px-4 text-xs font-bold text-white disabled:opacity-45"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Agregar global
                </button>
              </div>
            </section>
          )}

          {workspaceMode === 'acc' && (
            <section className="rounded-2xl border border-amber-200 bg-white p-4 shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1">
                  {(['all', 'en_stock', 'a_pedido'] as const).map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setAccSubtype(sub)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        accSubtype === sub
                          ? 'bg-amber-600 text-white'
                          : 'bg-[#f6f8fb] text-brand-ink hover:bg-amber-50'
                      }`}
                    >
                      {sub === 'all' ? 'Todos' : sub === 'en_stock' ? 'En stock' : 'A pedido'}
                    </button>
                  ))}
                </div>
                <label className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-brand-muted" aria-hidden="true" />
                  <input
                    type="search"
                    value={accSearch}
                    onChange={(e) => setAccSearch(e.target.value)}
                    placeholder="Buscar repuesto…"
                    aria-label="Buscar repuesto ACC"
                    className="h-9 rounded-lg border border-brand-line bg-[#f8fafc] pl-8 pr-2.5 text-xs outline-none focus:border-amber-500 focus:bg-white"
                  />
                </label>
              </div>

              <div className="divide-y divide-brand-line rounded-xl border border-brand-line">
                {accCatalogQuery.isPending ? (
                  <p className="p-4 text-xs text-brand-muted">Cargando repuestos…</p>
                ) : (accCatalogQuery.data?.items.length ?? 0) === 0 ? (
                  <p className="p-4 text-xs text-brand-muted">Sin resultados.</p>
                ) : (
                  accCatalogQuery.data?.items.map((part) => (
                    <div key={part.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <strong className="block truncate text-xs font-bold text-brand-ink">
                          {part.nombre}
                        </strong>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-brand-muted">
                          <span>{part.codigo ?? 'S/C'}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              part.subtipo === 'a_pedido'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {part.subtipo === 'a_pedido' ? 'A pedido' : `Stock: ${part.stock}`}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        <strong className="text-xs font-bold text-[#1d396a] tabular-nums">
                          {formatClp(part.precio)}
                        </strong>
                        <button
                          type="button"
                          onClick={() => addAccPart(part)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-amber-600 px-2.5 text-xs font-semibold text-white hover:bg-amber-700"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          Agregar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </div>

        {/* Columna Derecha: Presupuesto D&P en vivo */}
        <aside
          className="space-y-4 rounded-2xl border border-brand-line bg-white p-4 shadow-xs [&_.quotation-section-title]:flex [&_.quotation-section-title]:items-center [&_.quotation-section-title]:gap-2 [&_.quotation-section-title]:text-sm [&_.quotation-section-title_svg]:h-4 [&_.quotation-section-title_svg]:w-4 [&_.quotation-section-title_svg]:shrink-0 [&_.quotation-commercial-grid]:grid-cols-1 [&_.quotation-commercial-grid]:sm:grid-cols-[minmax(0,1fr)_116px] [&_.quotation-commercial-grid]:lg:grid-cols-[minmax(0,1fr)_116px] [&_.quotation-commercial-grid]:gap-3 [&_.quotation-commercial-grid>label:first-child]:sm:col-span-2 [&_.quotation-commercial-grid>label:first-child]:lg:col-span-2 [&_.quotation-pricing-summary]:mt-3 [&_.quotation-pricing-summary]:gap-4 [&_.quotation-pricing-summary]:pt-4 [&_.quotation-pricing-summary]:md:grid-cols-1 [&_.quotation-discount-inputs]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
          aria-label="Presupuesto D&P"
        >
          <div className="flex items-center justify-between border-b border-brand-line pb-2.5">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-[#1d396a]">
              <Wrench className="h-4 w-4 text-purple-700" aria-hidden="true" />
              Presupuesto ({items.length})
            </h2>
            <span className="text-xs font-semibold text-brand-muted">
              {activeBody?.label} · {activeSize?.label}
            </span>
          </div>

          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-brand-line py-8 text-center text-xs text-brand-muted">
              Sin piezas ni repuestos agregados
            </p>
          ) : (
            <div className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
              {items.map((item) => {
                const isDP = item.division === 'DP';
                const lineSubtotal = calculateQuotationPricing([item]).total;
                return (
                  <article
                    key={item.key}
                    className="rounded-xl border border-brand-line bg-[#fbfcfe] p-3 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              isDP
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {item.division}
                          </span>
                          {item.esAPedido && (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                              A pedido
                            </span>
                          )}
                          <strong className="text-brand-ink">
                            {isDP && item.dpPricingSnapshot
                              ? item.dpPricingSnapshot.pieceLabel
                                ? `${item.dpPricingSnapshot.pieceLabel} · ${item.dpPricingSnapshot.positionLabel ?? ''}`
                                : 'Vehículo completo'
                              : item.descripcion}
                          </strong>
                        </div>

                        {isDP && item.dpPricingSnapshot && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.dpPricingSnapshot.lines.map((l) => (
                              <span
                                key={l.operationId}
                                className="rounded bg-white px-1.5 py-0.5 text-[10px] text-brand-muted border border-brand-line/70"
                              >
                                {l.label}
                                {l.formula === 'repair' && item.dpPricingSnapshot?.damageLabel
                                  ? ` (${item.dpPricingSnapshot.damageLabel})`
                                  : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {isDP && item.dpPricing?.scope === 'piece' && item.dpPricing.pieceId && item.dpPricing.positionId && (
                          <button
                            type="button"
                            title="Editar pieza"
                            aria-label={`Editar ${item.descripcion}`}
                            onClick={() => {
                              setWorkspaceMode('piece');
                              selectPieceOnMap(item.dpPricing!.pieceId!, item.dpPricing!.positionId!);
                            }}
                            className="rounded-lg p-1.5 text-brand-muted hover:bg-purple-50 hover:text-purple-700"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                        <button
                          type="button"
                          title="Quitar"
                          aria-label={`Quitar ${item.descripcion}`}
                          onClick={() => {
                            setItems((current) => current.filter((l) => l.key !== item.key));
                            if (editingLineKey === item.key) setEditingLineKey(null);
                          }}
                          className="rounded-lg p-1.5 text-brand-muted hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between border-t border-brand-line/60 pt-1.5">
                      {!isDP ? (
                        <span className="text-[11px] text-brand-muted">
                          {item.cantidad} × {formatClp(Number(item.precioUnitario))}
                        </span>
                      ) : (
                        <span className="text-[10px] text-brand-muted">
                          {Number(item.descuentoValor) > 0
                            ? `Dto. ${item.descuentoTipo === 'porcentaje' ? `${item.descuentoValor}%` : formatClp(Number(item.descuentoValor))}`
                            : '5 etapas taller'}
                        </span>
                      )}
                      <strong className="text-sm font-bold text-[#1d396a] tabular-nums">
                        {formatClp(lineSubtotal)}
                      </strong>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <QuotationCommercialFields value={commercial} onChange={setCommercial} errors={errors} />

          <label className="block text-xs font-semibold text-brand-ink">
            Notas (opcional)
            <textarea
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones de color, entrega o seguro…"
              className="mt-1 w-full resize-y rounded-lg border border-brand-line px-3 py-2 text-xs font-normal outline-none focus:border-brand-primary"
            />
          </label>

          <QuotationDiscountSummary
            items={items}
            value={commercial}
            onChange={setCommercial}
            testId="dp-quotation-total"
          />

          {(errors._form || createMutation.isError) && (
            <div className="flex items-center gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-3 py-2 text-xs text-brand-coralInk" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{errors._form || getApiErrorMessage(createMutation.error)}</span>
            </div>
          )}

          <button
            type="button"
            disabled={createMutation.isPending}
            onClick={() => void handleCreateQuotation()}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1d396a] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#003570] disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            Emitir Cotización D&amp;P
          </button>
        </aside>
      </div>

      {showClientModal && (
        <ClientFormModal
          onClose={() => setShowClientModal(false)}
          onSaved={(saved) => {
            setClient({ id: saved.id, nombre: saved.nombre, rut: saved.rut });
            setErrors({});
            setShowClientModal(false);
          }}
        />
      )}

      {candidateVehicleId !== null && (
        <VehicleDpDetailsModal
          key={candidateVehicleId}
          vehicleId={candidateVehicleId}
          onClose={() => setCandidateVehicleId(null)}
          onReady={(saved) => {
            setSelectedVehicle({
              id: saved.id,
              patente: saved.patente,
              marca: saved.marca,
              modelo: saved.modelo,
              ano: saved.ano,
              dpBodyTypeId: saved.dpBodyTypeId,
              dpSizeId: saved.dpSizeId,
              client: saved.client ?? null,
            });
            if (saved.dpBodyTypeId && saved.dpSizeId) {
              setBodyTypeId(saved.dpBodyTypeId);
              setSizeId(saved.dpSizeId);
              syncExistingDpClassification(saved.dpBodyTypeId, saved.dpSizeId);
            }
            setCandidateVehicleId(null);
          }}
        />
      )}
    </div>
  );
};

export default QuotationDpCreatePage;
