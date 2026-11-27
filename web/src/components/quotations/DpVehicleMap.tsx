import { Check, ChevronDown, Search } from 'lucide-react';
import { useState } from 'react';

import type { DpConfiguration } from '@unithor/shared';

export interface PieceVisualStatus {
  hasRepair: boolean;
  hasPaint: boolean;
  hasReplacement: boolean;
  damageLabel?: string | null;
}

interface DpVehicleMapProps {
  bodyTypeId: string;
  rates: DpConfiguration['rates'];
  pieces: Map<string, string>;
  selectedPieceKey: string | null;
  configuredPieces: Map<string, PieceVisualStatus>;
  onSelectPiece: (pieceId: string, positionId: string) => void;
}

interface SvgPartProps {
  pieceId: string;
  positionId: string;
  label: string;
  selectedPieceKey: string | null;
  configuredPieces: Map<string, PieceVisualStatus>;
  onSelect: (pieceId: string, positionId: string) => void;
  shape: 'rect' | 'path';
  d?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rx?: number;
  shortCode: string;
  textX: number;
  textY: number;
}

const QUICK_PIECE_LIMIT = 8;

const normalizePieceSearch = (text: string) => text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

function getPartPalette(selected: boolean, status?: PieceVisualStatus) {
  if (selected) {
    return {
      fill: '#ede9fe',
      stroke: '#6d28d9',
      strokeWidth: 2.5,
      textColor: '#4c1d95',
    };
  }
  if (status?.hasReplacement) {
    return {
      fill: '#f3e8ff',
      stroke: '#9333ea',
      strokeWidth: 2,
      textColor: '#581c87',
    };
  }
  if (status?.hasRepair) {
    return {
      fill: '#fef3c7',
      stroke: '#d97706',
      strokeWidth: 2,
      textColor: '#92400e',
    };
  }
  if (status?.hasPaint) {
    return {
      fill: '#dbeafe',
      stroke: '#2563eb',
      strokeWidth: 2,
      textColor: '#1e40af',
    };
  }
  return {
    fill: '#f8fafc',
    stroke: '#cbd5e1',
    strokeWidth: 1.5,
    textColor: '#475569',
  };
}

function SvgCarPart({
  pieceId,
  positionId,
  label,
  selectedPieceKey,
  configuredPieces,
  onSelect,
  shape,
  d,
  x,
  y,
  width,
  height,
  rx = 8,
  shortCode,
  textX,
  textY,
}: SvgPartProps) {
  const key = `${pieceId}:${positionId}`;
  const selected = selectedPieceKey === key;
  const status = configuredPieces.get(key);
  const palette = getPartPalette(selected, status);
  const displayLabel = status?.damageLabel ? status.damageLabel : shortCode;

  const handleKeyDown = (event: React.KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(pieceId, positionId);
    }
  };

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      onClick={() => onSelect(pieceId, positionId)}
      onKeyDown={handleKeyDown}
      className="cursor-pointer outline-none [&>path]:transition-colors [&>rect]:transition-colors hover:[&>path]:stroke-purple-600 hover:[&>rect]:stroke-purple-600 focus-visible:[&>path]:stroke-purple-700 focus-visible:[&>path]:stroke-[3px] focus-visible:[&>rect]:stroke-purple-700 focus-visible:[&>rect]:stroke-[3px]"
    >
      <title>{label}</title>
      {shape === 'path' ? (
        <path
          d={d}
          fill={palette.fill}
          stroke={palette.stroke}
          strokeWidth={palette.strokeWidth}
          strokeLinejoin="round"
        />
      ) : (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={rx}
          fill={palette.fill}
          stroke={palette.stroke}
          strokeWidth={palette.strokeWidth}
        />
      )}
      <text
        x={textX}
        y={textY}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="9.5"
        fontWeight="700"
        fill={palette.textColor}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {displayLabel}
      </text>
    </g>
  );
}

const SVG_MAPPED_PIECES = new Set([
  'parachoque',
  'capo',
  'guardafango',
  'retrovisor',
  'puerta',
  'techo',
  'panel_lateral',
  'lateral_pickup',
  'porton',
  'maletero',
  'portalon',
]);

export default function DpVehicleMap({
  bodyTypeId,
  rates,
  pieces,
  selectedPieceKey,
  configuredPieces,
  onSelectPiece,
}: DpVehicleMapProps) {
  const [search, setSearch] = useState('');
  const [onlyConfigured, setOnlyConfigured] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const rateMap = new Map(rates.map((r) => [`${r.pieceId}:${r.positionId}`, r]));
  const hasRate = (pieceId: string, positionId: string) =>
    rateMap.has(`${pieceId}:${positionId}`);
  const labelFor = (pieceId: string, positionId: string) => {
    const rate = rateMap.get(`${pieceId}:${positionId}`);
    const pieceLabel = pieces.get(pieceId) ?? pieceId;
    return rate ? `${pieceLabel} · ${rate.positionLabel}` : pieceLabel;
  };

  const rearPieceId = hasRate('portalon', 'UNICA')
    ? 'portalon'
    : hasRate('maletero', 'UNICA')
      ? 'maletero'
      : 'porton';
  const sideRearPieceId = hasRate('lateral_pickup', 'L') ? 'lateral_pickup' : 'panel_lateral';
  const isPickup = bodyTypeId === 'pickup';

  // Lead with pieces the diagram does not offer, and include all positions in search.
  const orderedRates = [...rates].sort((a, b) => Number(SVG_MAPPED_PIECES.has(a.pieceId)) - Number(SVG_MAPPED_PIECES.has(b.pieceId)));
  const searchWords = normalizePieceSearch(search).trim().split(/\s+/).filter(Boolean);
  const matchingRates = orderedRates.filter((rate) => {
    if (onlyConfigured && !configuredPieces.has(`${rate.pieceId}:${rate.positionId}`)) return false;
    const label = normalizePieceSearch(`${labelFor(rate.pieceId, rate.positionId)} ${rate.positionId}`);
    return searchWords.every((word) => label.includes(word));
  });
  const filtering = searchWords.length > 0 || onlyConfigured;
  const visibleRates = expanded || filtering ? matchingRates : matchingRates.slice(0, QUICK_PIECE_LIMIT);

  return (
    <div className="rounded-2xl border border-brand-line bg-white p-4 shadow-2xs">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-brand-line/70 pb-2.5">
        <h2 className="dp-quote-section-title text-brand-primaryInk">Mapa de piezas</h2>
        <div className="dp-quote-secondary flex flex-wrap items-center gap-3 text-brand-muted">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" aria-hidden="true" />
            Pintura
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />
            Reparación
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-600" aria-hidden="true" />
            Reemplazo
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] sm:items-start">
        {/* Diagrama cenital interactivo */}
        <div className="mx-auto w-full max-w-[260px] rounded-xl border border-slate-100 bg-[#fafcff] p-2">
          <svg
            viewBox="0 0 340 370"
            className="h-auto w-full"
            role="group"
            aria-label="Diagrama interactivo del vehículo"
          >
            {/* Etiquetas de orientación */}
            <text x="170" y="13" textAnchor="middle" fontSize="9" fontWeight="700" fill="#94a3b8">
              FRENTE
            </text>
            <text x="170" y="365" textAnchor="middle" fontSize="9" fontWeight="700" fill="#94a3b8">
              TRASERA
            </text>
            <text x="18" y="185" textAnchor="middle" fontSize="9" fontWeight="700" fill="#94a3b8" transform="rotate(-90 18 185)">
              IZQ
            </text>
            <text x="322" y="185" textAnchor="middle" fontSize="9" fontWeight="700" fill="#94a3b8" transform="rotate(90 322 185)">
              DER
            </text>

            {/* Ruedas (decorativas) */}
            <rect x="56" y="72" width="12" height="36" rx="4" fill="#334155" />
            <rect x="272" y="72" width="12" height="36" rx="4" fill="#334155" />
            <rect x="56" y="258" width="12" height="36" rx="4" fill="#334155" />
            <rect x="272" y="258" width="12" height="36" rx="4" fill="#334155" />

            {/* Parachoque Delantero */}
            {hasRate('parachoque', 'F') && (
              <SvgCarPart
                pieceId="parachoque"
                positionId="F"
                label={labelFor('parachoque', 'F')}
                selectedPieceKey={selectedPieceKey}
                configuredPieces={configuredPieces}
                onSelect={onSelectPiece}
                shape="path"
                d="M 88 32 Q 170 14 252 32 L 246 53 Q 170 40 94 53 Z"
                shortCode="PARACHOQUE DEL."
                textX={170}
                textY={35}
              />
            )}

            {/* Capó */}
            {hasRate('capo', 'UNICA') && (
              <SvgCarPart
                pieceId="capo"
                positionId="UNICA"
                label={labelFor('capo', 'UNICA')}
                selectedPieceKey={selectedPieceKey}
                configuredPieces={configuredPieces}
                onSelect={onSelectPiece}
                shape="path"
                d="M 96 57 Q 170 46 244 57 L 236 116 Q 170 109 104 116 Z"
                shortCode="CAPÓ"
                textX={170}
                textY={84}
              />
            )}

            {/* Guardafangos L / R */}
            {hasRate('guardafango', 'L') && (
              <SvgCarPart
                pieceId="guardafango"
                positionId="L"
                label={labelFor('guardafango', 'L')}
                selectedPieceKey={selectedPieceKey}
                configuredPieces={configuredPieces}
                onSelect={onSelectPiece}
                shape="rect"
                x={72}
                y={58}
                width={21}
                height={62}
                rx={6}
                shortCode="GF.L"
                textX={82.5}
                textY={89}
              />
            )}
            {hasRate('guardafango', 'R') && (
              <SvgCarPart
                pieceId="guardafango"
                positionId="R"
                label={labelFor('guardafango', 'R')}
                selectedPieceKey={selectedPieceKey}
                configuredPieces={configuredPieces}
                onSelect={onSelectPiece}
                shape="rect"
                x={247}
                y={58}
                width={21}
                height={62}
                rx={6}
                shortCode="GF.R"
                textX={257.5}
                textY={89}
              />
            )}

            {/* Retrovisores L / R */}
            {hasRate('retrovisor', 'L') && (
              <SvgCarPart
                pieceId="retrovisor"
                positionId="L"
                label={labelFor('retrovisor', 'L')}
                selectedPieceKey={selectedPieceKey}
                configuredPieces={configuredPieces}
                onSelect={onSelectPiece}
                shape="rect"
                x={46}
                y={128}
                width={22}
                height={15}
                rx={5}
                shortCode="ESP"
                textX={57}
                textY={135.5}
              />
            )}
            {hasRate('retrovisor', 'R') && (
              <SvgCarPart
                pieceId="retrovisor"
                positionId="R"
                label={labelFor('retrovisor', 'R')}
                selectedPieceKey={selectedPieceKey}
                configuredPieces={configuredPieces}
                onSelect={onSelectPiece}
                shape="rect"
                x={272}
                y={128}
                width={22}
                height={15}
                rx={5}
                shortCode="ESP"
                textX={283}
                textY={135.5}
              />
            )}

            {/* Parabrisas decorativo */}
            <path
              d="M 105 121 Q 170 115 235 121 L 226 150 Q 170 146 114 150 Z"
              fill="#e2e8f0"
              stroke="#94a3b8"
              strokeWidth="1"
            />

            {/* Puertas FL, FR, RL, RR */}
            {hasRate('puerta', 'FL') && (
              <SvgCarPart
                pieceId="puerta"
                positionId="FL"
                label={labelFor('puerta', 'FL')}
                selectedPieceKey={selectedPieceKey}
                configuredPieces={configuredPieces}
                onSelect={onSelectPiece}
                shape="rect"
                x={72}
                y={126}
                width={24}
                height={62}
                rx={5}
                shortCode="P.FL"
                textX={84}
                textY={157}
              />
            )}
            {hasRate('puerta', 'FR') && (
              <SvgCarPart
                pieceId="puerta"
                positionId="FR"
                label={labelFor('puerta', 'FR')}
                selectedPieceKey={selectedPieceKey}
                configuredPieces={configuredPieces}
                onSelect={onSelectPiece}
                shape="rect"
                x={244}
                y={126}
                width={24}
                height={62}
                rx={5}
                shortCode="P.FR"
                textX={256}
                textY={157}
              />
            )}
            {hasRate('puerta', 'RL') && (
              <SvgCarPart
                pieceId="puerta"
                positionId="RL"
                label={labelFor('puerta', 'RL')}
                selectedPieceKey={selectedPieceKey}
                configuredPieces={configuredPieces}
                onSelect={onSelectPiece}
                shape="rect"
                x={72}
                y={192}
                width={24}
                height={60}
                rx={5}
                shortCode="P.RL"
                textX={84}
                textY={222}
              />
            )}
            {hasRate('puerta', 'RR') && (
              <SvgCarPart
                pieceId="puerta"
                positionId="RR"
                label={labelFor('puerta', 'RR')}
                selectedPieceKey={selectedPieceKey}
                configuredPieces={configuredPieces}
                onSelect={onSelectPiece}
                shape="rect"
                x={244}
                y={192}
                width={24}
                height={60}
                rx={5}
                shortCode="P.RR"
                textX={256}
                textY={222}
              />
            )}

            {/* Techo */}
            {hasRate('techo', 'UNICA') && (
              <SvgCarPart
                pieceId="techo"
                positionId="UNICA"
                label={labelFor('techo', 'UNICA')}
                selectedPieceKey={selectedPieceKey}
                configuredPieces={configuredPieces}
                onSelect={onSelectPiece}
                shape="rect"
                x={112}
                y={155}
                width={116}
                height={isPickup ? 68 : 92}
                rx={12}
                shortCode="TECHO"
                textX={170}
                textY={isPickup ? 189 : 201}
              />
            )}

            {/* Panel lateral / Lateral pickup */}
            {hasRate(sideRearPieceId, 'L') && (
              <SvgCarPart
                pieceId={sideRearPieceId}
                positionId="L"
                label={labelFor(sideRearPieceId, 'L')}
                selectedPieceKey={selectedPieceKey}
                configuredPieces={configuredPieces}
                onSelect={onSelectPiece}
                shape="rect"
                x={72}
                y={256}
                width={23}
                height={64}
                rx={6}
                shortCode={isPickup ? 'LAT.L' : 'COS.L'}
                textX={83.5}
                textY={288}
              />
            )}
            {hasRate(sideRearPieceId, 'R') && (
              <SvgCarPart
                pieceId={sideRearPieceId}
                positionId="R"
                label={labelFor(sideRearPieceId, 'R')}
                selectedPieceKey={selectedPieceKey}
                configuredPieces={configuredPieces}
                onSelect={onSelectPiece}
                shape="rect"
                x={245}
                y={256}
                width={23}
                height={64}
                rx={6}
                shortCode={isPickup ? 'LAT.R' : 'COS.R'}
                textX={256.5}
                textY={288}
              />
            )}

            {/* Portón / Maletero / Portalón */}
            {hasRate(rearPieceId, 'UNICA') && (
              <SvgCarPart
                pieceId={rearPieceId}
                positionId="UNICA"
                label={labelFor(rearPieceId, 'UNICA')}
                selectedPieceKey={selectedPieceKey}
                configuredPieces={configuredPieces}
                onSelect={onSelectPiece}
                shape="rect"
                x={108}
                y={isPickup ? 236 : 254}
                width={124}
                height={isPickup ? 84 : 66}
                rx={10}
                shortCode={rearPieceId.toUpperCase()}
                textX={170}
                textY={isPickup ? 278 : 287}
              />
            )}

            {/* Parachoque Trasero */}
            {hasRate('parachoque', 'R') && (
              <SvgCarPart
                pieceId="parachoque"
                positionId="R"
                label={labelFor('parachoque', 'R')}
                selectedPieceKey={selectedPieceKey}
                configuredPieces={configuredPieces}
                onSelect={onSelectPiece}
                shape="path"
                d="M 94 324 Q 170 336 246 324 L 252 344 Q 170 360 88 344 Z"
                shortCode="PARACHOQUE TRAS."
                textX={170}
                textY={340}
              />
            )}
          </svg>
        </div>

        <div className="min-w-0 space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" aria-hidden="true" />
            <input type="search" aria-label="Buscar pieza o ubicación" placeholder="Buscar pieza o ubicación…"
              value={search} onChange={(event) => setSearch(event.target.value)}
              className="dp-quote-field h-10 w-full min-w-0 rounded-lg border border-brand-line bg-[#f8fafc] pl-9 pr-2 text-brand-ink outline-none focus:border-purple-600 focus:bg-white" />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="dp-quote-secondary text-brand-muted" aria-live="polite">{matchingRates.length} {matchingRates.length === 1 ? 'pieza' : 'piezas'}</span>
            <button type="button" aria-pressed={onlyConfigured} onClick={() => setOnlyConfigured((current) => !current)}
              className={`dp-quote-control inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 py-1 focus-visible:outline focus-visible:outline-purple-700 ${
                onlyConfigured ? 'bg-purple-50 text-purple-800' : 'text-brand-muted hover:bg-brand-pale'
              }`}>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Cotizadas ({configuredPieces.size})
            </button>
          </div>

          {visibleRates.length > 0 ? (
            <div aria-label="Piezas disponibles" role="group" className="flex flex-wrap gap-1.5">
              {visibleRates.map((rate) => {
                const key = `${rate.pieceId}:${rate.positionId}`;
                const selected = selectedPieceKey === key;
                const status = configuredPieces.get(key);
                return (
                  <button key={key} type="button" aria-pressed={selected} onClick={() => onSelectPiece(rate.pieceId, rate.positionId)}
                    className={`dp-quote-control inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 py-1 text-left transition focus-visible:outline focus-visible:outline-purple-700 ${
                      selected ? 'bg-purple-700 text-white' : status ? 'bg-purple-50 text-purple-800' : 'bg-[#f6f8fb] text-brand-ink hover:bg-brand-pale'
                    }`}>
                    {status && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                    {labelFor(rate.pieceId, rate.positionId)}
                    {status?.damageLabel && <span className="dp-quote-secondary">{status.damageLabel}</span>}
                  </button>
                );
              })}
            </div>
          ) : <p className="rounded-lg bg-brand-pale px-3 py-2 text-xs text-brand-muted">{searchWords.length ? 'No se encontraron piezas.' : onlyConfigured ? 'Todavía no hay piezas cotizadas.' : 'Sin piezas disponibles.'}</p>}

          {!filtering && matchingRates.length > QUICK_PIECE_LIMIT && (
            <button type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}
              className="inline-flex min-h-8 items-center gap-1.5 rounded px-1 text-xs font-semibold text-purple-800 hover:underline focus-visible:outline focus-visible:outline-purple-700">
              {expanded ? 'Ver menos' : 'Ver todas las piezas'}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
