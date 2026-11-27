import {
  calculateDpWorkQuote,
  calculateQuotationPricing,
  createQuotationSchema,
  dpQuoteInputSchema,
  getQuotationGrossTotal,
  type DiscountType,
  type DpConfiguration,
  type DpQuoteInput,
  type DpWorkQuote,
} from '@unithor/shared';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Car,
  Check,
  CheckCircle2,
  Globe,
  LoaderCircle,
  Package,
  Pencil,
  Plus,
  ReceiptText,
  Save,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import ClientFormModal from '../../components/clients/ClientFormModal';
import FormRecoveryBanner from '../../components/common/FormRecoveryBanner';
import QuickVehicleSearch from '../../components/common/QuickVehicleSearch';
import SavingOverlay from '../../components/common/SavingOverlay';
import DpVehicleMap, { type PieceVisualStatus } from '../../components/quotations/DpVehicleMap';
import QuotationCommercialFields, { createCommercialDraft } from '../../components/quotations/QuotationCommercialFields';
import QuotationDiscountSummary from '../../components/quotations/QuotationDiscountSummary';
import VehicleDpDetailsModal from '../../components/vehicles/VehicleDpDetailsModal';
import { useCatalogItems } from '../../hooks/useCatalog';
import { useDpConfiguration, useDpQuotePreview } from '../../hooks/useDpConfiguration';
import { useFormRecovery } from '../../hooks/useFormRecovery';
import { useCreateQuotationMutation } from '../../hooks/useQuotations';
import { getApiErrorMessage } from '../../lib/api-error';
import { previewDpQuotationPricing, reclassifyDpQuotation } from '../../lib/dp-quotation-pricing';
import { dpQuotationRecoverySchema } from '../../lib/dp-quotation-recovery';
import { getFieldErrors } from '../../lib/form-errors';
import { formatClp } from '../../lib/formatters';
import { useAuthStore } from '../../stores/auth.store';
import { notifySuccess } from '../../stores/toast.store';

import type { DpQuotationLine as DraftLine, DpQuotationRecovery } from '../../lib/dp-quotation-recovery';
import type { CatalogItem, QuickSearchClient, QuickSearchVehicle } from '../../types/entities';

import '../../styles/quotation-dp.css';

type WorkspaceMode = 'piece' | 'global' | 'acc';

const factorLabel = (v: number) =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 }).format(v);

function showSection(section: HTMLElement | null) {
  if (!section) return;
  section.focus({ preventScroll: true });
  section.scrollIntoView?.({
    block: 'start',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  });
}

const QuotationDpCreateForm = ({ userId }: { userId: number | undefined }) => {
  const navigate = useNavigate();
  const dpQuery = useDpConfiguration('catalog', true);
  const dpPreview = useDpQuotePreview();
  const createMutation = useCreateQuotationMutation();
  const submissionInFlight = useRef(false);
  const requestPending = useRef(false);
  const mounted = useRef(true);
  const previewInFlight = useRef(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const budgetHeadingRef = useRef<HTMLHeadingElement>(null);
  const [sectionToShow, setSectionToShow] = useState<'editor' | 'map' | null>(null);
  const [lastSavedPiece, setLastSavedPiece] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    if (!sectionToShow) return;
    showSection(sectionToShow === 'editor' ? editorRef.current : mapRef.current);
    setSectionToShow(null);
  }, [sectionToShow]);

  useEffect(() => {
    mounted.current = true;
    const warn = (event: BeforeUnloadEvent) => {
      if (requestPending.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => { mounted.current = false; window.removeEventListener('beforeunload', warn); };
  }, []);

  const config = dpQuery.data?.configuration;
  const revision = dpQuery.data?.revision ?? 1;

  // Cliente & Vehículo (con patente o sin patente)
  const [client, setClient] = useState<Pick<QuickSearchClient, 'id' | 'nombre' | 'rut'> | null>(null);
  const [showClientModal, setShowClientModal] = useState(false);

  const [vehicleMode, setVehicleMode] = useState<'no_plate' | 'registered'>('no_plate');
  const [selectedVehicle, setSelectedVehicle] = useState<QuickSearchVehicle | null>(null);
  const [candidateVehicleId, setCandidateVehicleId] = useState<number | null>(null);
  const [vehicleSearchOpen, setVehicleSearchOpen] = useState(false);

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
  const [classificationError, setClassificationError] = useState('');
  const [createdQuotationId, setCreatedQuotationId] = useState<number | null>(null);
  const budgetTotal = useMemo(() => {
    const { pricing } = previewDpQuotationPricing(items, commercial);
    return pricing ? formatClp(getQuotationGrossTotal(pricing.total)) : '—';
  }, [items, commercial]);

  // Derivar carrocería y tamaño activos
  const bodies = useMemo(() => config?.bodyTypes.filter((b) => b.active) ?? [], [config]);
  const activeBody = useMemo(
    () => bodyTypeId ? bodies.find((b) => b.id === bodyTypeId) : bodies[0],
    [bodies, bodyTypeId],
  );
  const sizes = useMemo(() => activeBody?.sizes.filter((s) => s.active) ?? [], [activeBody]);
  const activeSize = useMemo(
    () => sizeId ? sizes.find((s) => s.id === sizeId) : sizes[0],
    [sizes, sizeId],
  );

  const draftValue = useMemo<DpQuotationRecovery>(() => ({
    client, vehicleMode, selectedVehicle, bodyTypeId, sizeId, vehicleRef, items, commercial, notas,
    workspaceMode, selectedPieceKey, editingLineKey, opIds, damageLevelId, pieceDiscountType,
    pieceDiscountValue, accSearch, accSubtype, createdQuotationId,
  }), [client, vehicleMode, selectedVehicle, bodyTypeId, sizeId, vehicleRef, items, commercial, notas,
    workspaceMode, selectedPieceKey, editingLineKey, opIds, damageLevelId, pieceDiscountType,
    pieceDiscountValue, accSearch, accSubtype, createdQuotationId]);
  const recovery = useFormRecovery<DpQuotationRecovery>({
    userId, form: 'quotation:dp:new', schema: dpQuotationRecoverySchema, value: draftValue,
    paused: submissionInFlight.current,
    hasContent: Boolean(client || selectedVehicle || vehicleMode !== 'no_plate' || vehicleRef || items.length || notas
      || workspaceMode !== 'piece' || selectedPieceKey || opIds.length || pieceDiscountType || pieceDiscountValue
      || accSearch || accSubtype !== 'all' || createdQuotationId
      || (bodyTypeId && bodyTypeId !== bodies[0]?.id) || (sizeId && sizeId !== sizes[0]?.id)
      || JSON.stringify(commercial) !== JSON.stringify(createCommercialDraft())),
    onRestore: (draft) => {
      if (draft.createdQuotationId) {
        submissionInFlight.current = true;
        setCreatedQuotationId(draft.createdQuotationId);
        void recovery.clear().then(() => { if (mounted.current) navigate(`/quotations/${draft.createdQuotationId}`); });
        return;
      }
      setClient(draft.client); setVehicleMode(draft.vehicleMode); setSelectedVehicle(draft.selectedVehicle);
      setBodyTypeId(draft.bodyTypeId); setSizeId(draft.sizeId); setVehicleRef(draft.vehicleRef);
      setItems(draft.items); setCommercial(draft.commercial); setNotas(draft.notas);
      setWorkspaceMode(draft.workspaceMode); setSelectedPieceKey(draft.selectedPieceKey);
      setEditingLineKey(draft.editingLineKey); setOpIds(draft.opIds); setDamageLevelId(draft.damageLevelId);
      setPieceDiscountType(draft.pieceDiscountType); setPieceDiscountValue(draft.pieceDiscountValue);
      setAccSearch(draft.accSearch); setAccSubtype(draft.accSubtype);
    },
  });

  useEffect(() => {
    if (!recovery.ready) return;
    if (!bodyTypeId && activeBody) setBodyTypeId(activeBody.id);
    if (!sizeId && activeSize) setSizeId(activeSize.id);
  }, [recovery.ready, bodyTypeId, sizeId, activeBody, activeSize]);

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
  const applyDpClassification = (nextBodyId: string, nextSizeId: string) => {
    if (!config || !recovery.ready || submissionInFlight.current) return false;
    const result = reclassifyDpQuotation({
      configuration: config, revision, items, bodyTypeId: nextBodyId, sizeId: nextSizeId, discount: commercial,
      editor: { pieceKey: selectedPieceKey, selection: currentSelectionInput, discount: { descuentoTipo: pieceDiscountType, descuentoValor: pieceDiscountValue || '0' } },
    });
    if (!result.ok) { setClassificationError(result.error); return false; }
    setItems(result.items);
    setBodyTypeId(nextBodyId);
    setSizeId(nextSizeId);
    setClassificationError('');
    return true;
  };

  const handleChangeBody = (nextBodyId: string) => {
    const nextBody = bodies.find((b) => b.id === nextBodyId);
    const nextSizes = nextBody?.sizes.filter((s) => s.active) ?? [];
    const nextSizeId = nextSizes.some((s) => s.id === sizeId) ? sizeId : (nextSizes[0]?.id ?? '');
    applyDpClassification(nextBodyId, nextSizeId);
  };

  const handleChangeSize = (nextSizeId: string) => {
    if (activeBody && nextSizeId) {
      applyDpClassification(activeBody.id, nextSizeId);
    }
  };

  const selectRegisteredVehicle = (vehicle: QuickSearchVehicle) => {
    if (vehicle.dpBodyTypeId && vehicle.dpSizeId && applyDpClassification(vehicle.dpBodyTypeId, vehicle.dpSizeId)) {
      setSelectedVehicle(dpQuotationRecoverySchema.shape.selectedVehicle.parse(vehicle));
    }
    setVehicleSearchOpen(false);
    setCandidateVehicleId(null);
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
    if (!recovery.ready || submissionInFlight.current || createdQuotationId !== null) return;
    const key = `${pieceId}:${positionId}`;
    setSectionToShow('editor');
    if (workspaceMode === 'piece' && selectedPieceKey === key) return;
    setWorkspaceMode('piece');
    setLastSavedPiece(null);
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

  const liveDpPreview = useMemo((): { quote: DpWorkQuote | null; error: string } => {
    if (!config || !currentSelectionInput) return { quote: null, error: '' };
    try {
      return { quote: calculateDpWorkQuote(config, currentSelectionInput, revision), error: '' };
    } catch (error) {
      return { quote: null, error: error instanceof Error ? error.message : 'Revisa la tarifa D&P.' };
    }
  }, [config, currentSelectionInput, revision]);
  const liveDpQuote = liveDpPreview.quote;

  const liveLinePreview = useMemo(() => {
    if (!liveDpQuote) return { pricing: null, error: '' };
    return previewDpQuotationPricing([{
      cantidad: 1, precioUnitario: liveDpQuote.precioUnitario,
      descuentoTipo: pieceDiscountType, descuentoValor: pieceDiscountValue || 0,
    }]);
  }, [liveDpQuote, pieceDiscountType, pieceDiscountValue]);
  const liveLineNet = liveLinePreview.pricing?.total ?? null;

  const previewContext = useMemo(() => ({}), [config, revision, vehicleMode, selectedVehicle, bodyTypeId, sizeId,
    workspaceMode, selectedPieceKey, editingLineKey, opIds, damageLevelId, pieceDiscountType, pieceDiscountValue, items]);
  const latestPreviewContext = useRef(previewContext);
  latestPreviewContext.current = previewContext;

  const commitDpSelection = async () => {
    if (!recovery.ready || submissionInFlight.current || previewInFlight.current) return;
    if (!currentSelectionInput || !liveDpQuote || liveLineNet === null || dpPreview.isPending) {
      setPieceError('Selecciona las operaciones y nivel de daño requerido.');
      return;
    }
    previewInFlight.current = true;
    const context = previewContext;
    setPieceError('');
    try {
      const quote = await dpPreview.mutateAsync(currentSelectionInput);
      if (!mounted.current || latestPreviewContext.current !== context || submissionInFlight.current) return;
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
      // The server tariff may differ from the live preview; validate discounts again.
      calculateQuotationPricing([nextLine]);
      setItems((current) =>
        editingLineKey
          ? current.map((l) => (l.key === editingLineKey ? nextLine : l))
          : [...current, nextLine],
      );
      setLastSavedPiece({ key: nextLine.key, message: `${targetLabel}: ${editingLineKey ? 'actualizado' : 'agregado'} al presupuesto.` });
      if (workspaceMode === 'piece') setSectionToShow('map');
      setEditingLineKey(null);
      setSelectedPieceKey(null);
      setOpIds([]);
      setDamageLevelId('');
      setPieceDiscountType(null);
      setPieceDiscountValue('');
    } catch (err) {
      if (mounted.current && latestPreviewContext.current === context) {
        setPieceError(getApiErrorMessage(err, 'No se pudo validar la tarifa o el descuento D&P.'));
      }
    } finally {
      previewInFlight.current = false;
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
    if (!recovery.ready || createdQuotationId || createMutation.isPending || submissionInFlight.current || previewInFlight.current) return;
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
    requestPending.current = true;
    try {
      await recovery.persist(draftValue);
      const created = await createMutation.mutateAsync(parsed.data);
      if (mounted.current) setCreatedQuotationId(created.id);
      await recovery.persist({ ...draftValue, createdQuotationId: created.id });
      await recovery.clear();
      if (mounted.current) {
        notifySuccess(`Cotización D&P ${created.codigo} creada.`);
        navigate(`/quotations/${created.id}`);
      }
    } catch (error) {
      submissionInFlight.current = false;
      if (mounted.current) setErrors({ _form: getApiErrorMessage(error, 'No se pudo emitir la cotización. La captura se conserva para reintentar.') });
    } finally {
      requestPending.current = false;
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
    <div className="dp-quotation min-w-0 space-y-4 pb-8" data-testid="quotation-dp-page">
      {createMutation.isPending && <SavingOverlay message="Emitiendo cotización D&P…" />}

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-700 text-white shadow-xs">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="dp-quote-page-title text-brand-primaryInk">Cotización D&amp;P</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => showSection(budgetHeadingRef.current)}
            disabled={!recovery.ready}
            className="dp-quote-control inline-flex min-h-10 items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-1.5 text-purple-950 transition hover:bg-purple-100 focus-visible:outline focus-visible:outline-purple-700 disabled:opacity-50">
            <ArrowDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Ver presupuesto</span>
            <span className="border-l border-purple-200 pl-2 text-right tabular-nums">
              <strong className="block">{budgetTotal}</strong>
              <span className="dp-quote-secondary block text-purple-800">con IVA</span>
            </span>
          </button>
          <Link
            to="/quotations"
            className="dp-quote-control inline-flex h-10 items-center gap-1.5 rounded-xl border border-brand-line bg-white px-3.5 text-brand-ink transition hover:bg-brand-pale"
          >
            <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
            Ver cotizaciones
          </Link>
        </div>
      </header>

      <FormRecoveryBanner candidateAt={recovery.candidate?.updatedAt ?? null} ready={recovery.ready}
        saving={recovery.saving} savedAt={recovery.savedAt} error={recovery.error}
        onRecover={recovery.recover} onDiscard={() => void recovery.discard()} onRetry={() => void recovery.retry()} />

      <fieldset disabled={!recovery.ready || submissionInFlight.current || createMutation.isPending || createdQuotationId !== null} className="min-w-0 space-y-4">
      {/* Cabecera Cliente + Vehículo */}
      <div className="dp-quote-identity grid gap-3 lg:grid-cols-2">
        {/* Cliente */}
        <section className="rounded-2xl border border-brand-line bg-white p-4 shadow-2xs" aria-label="Cliente">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="dp-quote-section-title text-brand-primaryInk">Cliente</h2>
            <button
              type="button"
              onClick={() => setShowClientModal(true)}
              className="dp-quote-control inline-flex min-h-8 items-center gap-1 rounded-lg bg-[#eef3fa] px-2.5 py-1 text-[#1d396a] hover:bg-[#dfe9f7]"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Nuevo
            </button>
          </div>

          {client ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5">
              <div className="min-w-0">
                <strong className="dp-quote-subtitle block truncate text-brand-ink">{client.nombre}</strong>
                {client.rut && <span className="dp-quote-secondary text-brand-muted">{client.rut}</span>}
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
                setClient({ id: c.id, nombre: c.nombre, rut: c.rut });
                setErrors({});
              }}
            />
          )}
        </section>

        {/* Vehículo (Sin patente o Registrado) */}
        <section className="rounded-2xl border border-brand-line bg-white p-4 shadow-2xs" aria-label="Vehículo">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="dp-quote-section-title text-brand-primaryInk">Vehículo</h2>
            <div className="dp-quote-control flex gap-1 rounded-lg bg-[#f3f6fa] p-0.5">
              <button
                type="button"
                aria-pressed={vehicleMode === 'no_plate'}
                onClick={() => {
                  setVehicleMode('no_plate');
                  setSelectedVehicle(null);
                  setVehicleSearchOpen(false);
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
            selectedVehicle && !vehicleSearchOpen ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5">
                <div className="min-w-0">
                  <strong className="dp-quote-subtitle block font-mono text-brand-primaryInk">
                    {selectedVehicle.patente}
                  </strong>
                  <span className="dp-quote-secondary block truncate text-brand-muted">
                    {[selectedVehicle.marca, selectedVehicle.modelo, activeBody?.label, activeSize?.label]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setVehicleSearchOpen(true)}
                  className="shrink-0 rounded-lg border border-brand-line bg-white px-2.5 py-1 text-xs font-semibold text-brand-muted hover:text-brand-ink"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div>
              <QuickVehicleSearch
                mode="vehicles"
                placeholder="Buscar patente…"
                onSelectVehicle={(v) => {
                  if (v.dpBodyTypeId && v.dpSizeId) {
                    selectRegisteredVehicle(v);
                  } else {
                    setCandidateVehicleId(v.id);
                  }
                }}
              />
              {selectedVehicle && <button type="button" className="mt-2 text-xs font-semibold text-brand-muted" onClick={() => setVehicleSearchOpen(false)}>Cancelar cambio de vehículo</button>}
              </div>
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
                      className={`dp-quote-control rounded-lg px-2.5 py-1 transition ${
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
                      className={`dp-quote-control rounded-lg px-2 py-1 transition ${
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
                  className="dp-quote-field h-10 min-w-0 flex-[1_1_200px] rounded-lg border border-brand-line bg-[#f8fafc] px-3 text-brand-ink outline-none focus:border-brand-primary focus:bg-white"
                />
                <span className="dp-quote-secondary text-brand-muted">
                  Patente obligatoria en OT
                </span>
              </div>
            </div>
          )}
          {classificationError && <div role="alert" className="mt-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-3 py-2 text-xs text-brand-coralInk">
            <p>{classificationError}</p>
            <button type="button" onClick={() => setClassificationError('')} className="mt-1 font-semibold underline">Cancelar cambio</button>
          </div>}
        </section>
      </div>

      {/* Workspace principal de 2 columnas */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.9fr)] xl:items-start">
        {/* Columna Izquierda: Selector Visual e Interactivo */}
        <div className="space-y-4">
          {/* Tabs de alcance */}
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-brand-line bg-white p-1.5 shadow-2xs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={workspaceMode === 'piece'}
              onClick={() => {
                if (workspaceMode === 'piece') return;
                setWorkspaceMode('piece');
                setLastSavedPiece(null);
                setSelectedPieceKey(null);
                setEditingLineKey(null);
                setOpIds([]);
                setDamageLevelId('');
                setPieceDiscountType(null);
                setPieceDiscountValue('');
                setPieceError('');
              }}
              className={`dp-quote-control flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 transition ${
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
                if (workspaceMode === 'global') return;
                setWorkspaceMode('global');
                setLastSavedPiece(null);
                setSelectedPieceKey(null);
                setEditingLineKey(null);
                setOpIds([]);
                setDamageLevelId('');
                setPieceDiscountType(null);
                setPieceDiscountValue('');
                setPieceError('');
              }}
              className={`dp-quote-control flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 transition ${
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
              onClick={() => { setWorkspaceMode('acc'); setLastSavedPiece(null); }}
              className={`dp-quote-control flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 transition ${
                workspaceMode === 'acc'
                  ? 'bg-[#1d396a] text-white'
                  : 'text-brand-muted hover:bg-amber-50 hover:text-amber-900'
              }`}
            >
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              Repuestos ACC
            </button>
          </div>

          {workspaceMode === 'piece' && activeBody && (
            <>
              <div ref={mapRef} tabIndex={-1} aria-label="Mapa de piezas" className="scroll-mt-24 rounded-2xl focus-visible:outline focus-visible:outline-purple-700">
                <div role="status" className={lastSavedPiece ? 'mb-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900' : 'sr-only'}>
                  {lastSavedPiece && <><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />{lastSavedPiece.message}</>}
                </div>
                <DpVehicleMap
                  bodyTypeId={activeBody.id}
                  rates={activeRates}
                  pieces={pieceMap}
                  selectedPieceKey={selectedPieceKey}
                  configuredPieces={configuredPieces}
                  onSelectPiece={selectPieceOnMap}
                />
              </div>

              {/* Configurador de pieza seleccionada */}
              {activeRate ? (
                <section
                  ref={editorRef}
                  tabIndex={-1}
                  className="scroll-mt-24 space-y-4 rounded-2xl border border-brand-line bg-white p-4 shadow-2xs focus-visible:outline focus-visible:outline-purple-700"
                  aria-label={`Configurar ${activePieceLabel}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-line pb-2.5">
                    <div>
                      <h2 className="dp-quote-section-title text-brand-primaryInk">{activePieceLabel}</h2>
                      {editingLineKey && <p className="dp-quote-secondary text-brand-muted">Editando pieza</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => showSection(mapRef.current)}
                        className="dp-quote-control inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-brand-line bg-white px-2.5 text-brand-primaryInk hover:bg-brand-pale">
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> Volver al mapa
                      </button>
                      <button type="button" onClick={() => {
                        setSelectedPieceKey(null);
                        setEditingLineKey(null);
                        setOpIds([]);
                        setDamageLevelId('');
                        setPieceDiscountType(null);
                        setPieceDiscountValue('');
                        setPieceError('');
                        setSectionToShow('map');
                      }} className="dp-quote-control min-h-9 rounded-lg px-2.5 text-brand-muted hover:bg-brand-pale hover:text-brand-ink">
                        Cerrar editor
                      </button>
                    </div>
                  </div>

                  {(pieceError || liveDpPreview.error || liveLinePreview.error) && <p className="rounded-lg bg-brand-coralPale px-3 py-2 text-xs font-semibold text-brand-coralInk" role="alert">
                    {pieceError || liveDpPreview.error || liveLinePreview.error}
                  </p>}

                  {/* Reparación */}
                  <div className="space-y-1.5">
                    <h3 className="dp-quote-subtitle text-brand-ink">Reparación</h3>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        aria-pressed={!opIds.some((id) => repairOps.some((op) => op.id === id))}
                        onClick={() => setExclusiveGroupOp(repairOps, null)}
                        className="dp-quote-control rounded-lg border border-brand-line px-3 py-1.5 text-brand-muted transition hover:bg-brand-pale aria-pressed:bg-brand-pale aria-pressed:text-brand-ink"
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
                            className={`dp-quote-control rounded-lg border px-3 py-1.5 transition disabled:opacity-50 ${
                              selected
                                ? 'border-amber-400 bg-amber-50 text-amber-900'
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
                        <span className="dp-quote-control text-brand-ink">Nivel de daño</span>
                        {config.damageLevels.filter((d) => d.active).map((lvl) => (
                          <button
                            key={lvl.id}
                            type="button"
                            aria-pressed={damageLevelId === lvl.id}
                            onClick={() => {
                              setDamageLevelId(lvl.id);
                              setPieceError('');
                            }}
                            className={`dp-quote-control rounded-lg border px-3 py-1 transition ${
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
                    <h3 className="dp-quote-subtitle text-brand-ink">Pintura</h3>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        aria-pressed={!opIds.some((id) => paintingOps.some((op) => op.id === id))}
                        onClick={() => setExclusiveGroupOp(paintingOps, null)}
                        className="dp-quote-control rounded-lg border border-brand-line px-3 py-1.5 text-brand-muted transition hover:bg-brand-pale aria-pressed:bg-brand-pale aria-pressed:text-brand-ink"
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
                            className={`dp-quote-control rounded-lg border px-3 py-1.5 transition disabled:opacity-50 ${
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
                        className="dp-quote-field h-9 rounded-lg border border-brand-line bg-white px-2 text-brand-ink"
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
                          className="dp-quote-field h-9 w-24 rounded-lg border border-brand-line bg-white px-2 text-brand-ink"
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="dp-quote-secondary block text-brand-muted">Neto pieza</span>
                        <strong className="dp-quote-section-title text-brand-primaryInk tabular-nums">
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
                </section>
              ) : (
                <div className="rounded-xl border border-dashed border-brand-line bg-white py-5 text-center text-xs font-semibold text-brand-muted">
                  Selecciona una pieza en el mapa o en el buscador
                </div>
              )}
            </>
          )}

          {workspaceMode === 'global' && (
            <section className="rounded-2xl border border-brand-line bg-white p-4 shadow-2xs space-y-4">
              <h2 className="dp-quote-section-title text-brand-primaryInk">Servicios globales</h2>
              <div role="status" className={lastSavedPiece ? 'flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900' : 'sr-only'}>
                {lastSavedPiece && <><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />{lastSavedPiece.message}</>}
              </div>
              {(pieceError || liveDpPreview.error || liveLinePreview.error) && <p className="rounded-lg bg-brand-coralPale px-3 py-2 text-xs font-semibold text-brand-coralInk" role="alert">
                {pieceError || liveDpPreview.error || liveLinePreview.error}
              </p>}
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
                      className={`dp-quote-control flex items-center justify-between gap-2 rounded-xl border p-3 text-left transition disabled:opacity-50 ${
                        selected
                          ? 'border-purple-600 bg-purple-50 text-purple-950'
                          : 'border-brand-line bg-white text-brand-ink hover:bg-brand-pale'
                      }`}
                    >
                      <span>{op.label}</span>
                      {disabled ? (
                        <span className="dp-quote-secondary text-brand-muted">
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
                  disabled={!liveDpQuote || liveLineNet === null || dpPreview.isPending}
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
            <section className="space-y-3 rounded-2xl border border-brand-line bg-white p-4 shadow-2xs">
              <h2 className="dp-quote-section-title text-brand-primaryInk">Repuestos ACC</h2>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1">
                  {(['all', 'en_stock', 'a_pedido'] as const).map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      aria-pressed={accSubtype === sub}
                      onClick={() => setAccSubtype(sub)}
                      className={`dp-quote-control rounded-full px-3 py-1 ${
                        accSubtype === sub
                          ? 'bg-brand-pale text-brand-primaryInk'
                          : 'text-brand-muted hover:bg-brand-pale'
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
                    className="dp-quote-field h-9 w-full min-w-0 rounded-lg border border-brand-line bg-[#f8fafc] pl-8 pr-2.5 outline-none focus:border-brand-primary focus:bg-white"
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
                        <strong className="dp-quote-subtitle block break-words text-brand-ink">
                          {part.nombre}
                        </strong>
                        <div className="dp-quote-secondary mt-0.5 flex flex-wrap items-center gap-2 text-brand-muted">
                          <span>{part.codigo ?? 'S/C'}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 ${
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
                        <strong className="dp-quote-control text-brand-primaryInk tabular-nums">
                          {formatClp(part.precio)}
                        </strong>
                        <button
                          type="button"
                          onClick={() => addAccPart(part)}
                          className="dp-quote-control inline-flex h-8 items-center gap-1 rounded-lg bg-brand-pale px-2.5 text-brand-primaryInk hover:bg-[#dfe9f7]"
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
          className="dp-quote-budget space-y-4 rounded-2xl border border-brand-line bg-white p-4 shadow-xs"
          aria-label="Presupuesto D&P"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-line pb-2.5">
            <h2 ref={budgetHeadingRef} tabIndex={-1} className="dp-quote-section-title scroll-mt-24 rounded text-brand-primaryInk focus-visible:outline focus-visible:outline-purple-700">
              Presupuesto ({items.length})
            </h2>
            <span className="dp-quote-secondary text-brand-muted">
              {activeBody?.label} · {activeSize?.label}
            </span>
          </div>

          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-brand-line py-8 text-center text-xs text-brand-muted">
              Sin piezas ni repuestos agregados
            </p>
          ) : (
            <div className="space-y-2.5">
              {items.map((item) => {
                const isDP = item.division === 'DP';
                const linePreview = previewDpQuotationPricing([item]);
                return (
                  <article
                    key={item.key}
                    className={`rounded-xl border p-3 text-xs transition-colors motion-reduce:transition-none ${
                      editingLineKey === item.key ? 'border-purple-300 bg-purple-50' : lastSavedPiece?.key === item.key ? 'border-emerald-200 bg-emerald-50/50' : 'border-brand-line bg-[#fbfcfe]'
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <h3 className="dp-quote-subtitle min-w-0 break-words text-brand-ink">
                        {isDP && item.dpPricingSnapshot
                          ? [item.dpPricingSnapshot.pieceLabel, item.dpPricingSnapshot.positionLabel].filter(Boolean).join(' · ') || 'Vehículo completo'
                          : item.descripcion}
                      </h3>
                      <strong className="dp-quote-subtitle whitespace-nowrap text-brand-primaryInk tabular-nums">
                        {linePreview.pricing ? formatClp(linePreview.pricing.total) : '—'}
                      </strong>
                    </div>

                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="dp-quote-secondary min-w-0 break-words text-brand-muted">
                        <span className="text-brand-primaryInk">{isDP ? 'D&P' : item.division}</span>
                        {item.esAPedido && ' · A pedido'}
                        {!isDP && ` · ${item.cantidad} × ${formatClp(Number(item.precioUnitario))}`}
                        {isDP && item.dpPricingSnapshot?.lines.map((line) => (
                          <span key={line.operationId}>
                            {' · '}{line.label}
                            {line.formula === 'repair' && item.dpPricingSnapshot?.damageLabel && ` (${item.dpPricingSnapshot.damageLabel})`}
                          </span>
                        ))}
                        {Number(item.descuentoValor) > 0 && ` · Dto. ${item.descuentoTipo === 'porcentaje' ? `${item.descuentoValor}%` : formatClp(Number(item.descuentoValor))}`}
                      </p>

                      <div className="flex shrink-0 items-center gap-0.5">
                        {isDP && item.dpPricing?.scope === 'piece' && item.dpPricing.pieceId && item.dpPricing.positionId && (
                          <button
                            type="button"
                            title="Editar pieza"
                            aria-label={`Editar ${item.descripcion}`}
                            onClick={() => {
                              const { pieceId, positionId } = item.dpPricing ?? {};
                              if (pieceId && positionId) selectPieceOnMap(pieceId, positionId);
                            }}
                            className="grid h-9 w-9 place-items-center rounded-lg text-brand-muted hover:bg-purple-100 hover:text-purple-700 focus-visible:outline focus-visible:outline-purple-700"
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
                            if (lastSavedPiece?.key === item.key) setLastSavedPiece(null);
                          }}
                          className="grid h-9 w-9 place-items-center rounded-lg text-brand-muted hover:bg-rose-100 hover:text-rose-700 focus-visible:outline focus-visible:outline-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {linePreview.error && <p role="alert" className="mt-1 text-brand-coralInk">Revisa «{item.descripcion}»: {linePreview.error}</p>}
                  </article>
                );
              })}
            </div>
          )}

          <QuotationCommercialFields value={commercial} onChange={setCommercial} errors={errors} />

          <label className="dp-quote-control block text-brand-ink">
            Notas (opcional)
            <textarea
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones de color, entrega o seguro…"
              className="dp-quote-field mt-1 w-full resize-y rounded-lg border border-brand-line px-3 py-2 outline-none focus:border-brand-primary"
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
            disabled={!recovery.ready || createMutation.isPending || dpPreview.isPending || createdQuotationId !== null}
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
      </fieldset>

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
            selectRegisteredVehicle({
              id: saved.id,
              patente: saved.patente,
              marca: saved.marca,
              modelo: saved.modelo,
              ano: saved.ano,
              dpBodyTypeId: saved.dpBodyTypeId,
              dpSizeId: saved.dpSizeId,
              client: saved.client ?? null,
            });
          }}
        />
      )}
    </div>
  );
};

export const QuotationDpCreatePage = () => {
  const userId = useAuthStore((state) => state.user?.id);
  return <QuotationDpCreateForm key={userId ?? 'anonymous'} userId={userId} />;
};

export default QuotationDpCreatePage;
