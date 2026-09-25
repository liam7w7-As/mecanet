import { updateStockSchema } from '@unithor/shared';
import { AlertCircle, ArrowDownToLine, ArrowUpFromLine, LoaderCircle, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

import { AnimateIcon } from '../animate-ui';
import { useAdjustStockMutation } from '../../hooks/useCatalog';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';

import type { CatalogItem } from '../../types/entities';

interface StockAdjustmentModalProps {
  item: Pick<CatalogItem, 'id' | 'codigo' | 'nombre' | 'stock'>;
  onClose: () => void;
}

type MovementType = 'entrada' | 'salida';

export const StockAdjustmentModal = ({ item, onClose }: StockAdjustmentModalProps) => {
  const [movementType, setMovementType] = useState<MovementType>('entrada');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const adjustmentMutation = useAdjustStockMutation();
  const numericQuantity = Number(quantity);
  const delta = movementType === 'entrada' ? numericQuantity : -numericQuantity;
  const nextStock = item.stock + (Number.isFinite(delta) ? delta : 0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !adjustmentMutation.isPending) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [adjustmentMutation.isPending, onClose]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    adjustmentMutation.reset();
    setFieldErrors({});

    if (!Number.isInteger(numericQuantity) || numericQuantity <= 0) {
      setFieldErrors({ cantidad: 'La cantidad debe ser un entero mayor a 0' });
      return;
    }
    if (movementType === 'salida' && numericQuantity > item.stock) {
      setFieldErrors({ cantidad: `El egreso no puede superar el stock disponible (${item.stock})` });
      return;
    }

    const result = updateStockSchema.safeParse({
      delta,
      motivo: reason.trim() || undefined,
    });
    if (!result.success) {
      setFieldErrors(getFieldErrors(result.error.issues));
      return;
    }

    adjustmentMutation.mutate(
      { id: item.id, data: result.data },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button type="button" className="absolute inset-0 bg-slate-950/55" aria-label="Cerrar ajuste de stock" onClick={onClose} />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative w-full max-w-lg rounded-lg bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-adjustment-title"
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Movimiento de inventario</p>
            <h2 id="stock-adjustment-title" className="mt-1 text-lg font-semibold text-brand-blue">Ajustar stock</h2>
            <p className="mt-1 text-sm text-slate-600">{item.codigo ?? 'Sin código'} · {item.nombre}</p>
          </div>
          <button type="button" className="group flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Cerrar" title="Cerrar">
            <AnimateIcon icon={X} animation="spin" size={16} />
          </button>
        </header>

        <form className="space-y-5 p-5 sm:p-6" noValidate onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className={`group flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-all ${
                movementType === 'entrada'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => { setMovementType('entrada'); setFieldErrors({}); }}
              aria-pressed={movementType === 'entrada'}
            >
              <AnimateIcon icon={ArrowDownToLine} animation="bounce" size={16} /> Entrada / Ingreso
            </button>
            <button
              type="button"
              className={`group flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-all ${
                movementType === 'salida'
                  ? 'border-red-500 bg-red-50 text-red-700 shadow-sm'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => { setMovementType('salida'); setFieldErrors({}); }}
              aria-pressed={movementType === 'salida'}
            >
              <AnimateIcon icon={ArrowUpFromLine} animation="bounce" size={16} /> Salida / Egreso
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
            <div><p className="text-xs font-semibold uppercase text-slate-500">Stock actual</p><p className="mt-1 text-2xl font-bold text-brand-blue" data-testid="current-stock">{item.stock}</p></div>
            <div className="border-l border-slate-200"><p className="text-xs font-semibold uppercase text-slate-500">Nuevo stock</p><p className={`mt-1 text-2xl font-bold ${nextStock < 0 ? 'text-red-600' : 'text-brand-blue'}`} data-testid="next-stock">{nextStock}</p></div>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            Cantidad
            <input className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15 aria-[invalid=true]:border-red-500" type="number" min="1" step="1" value={quantity} onChange={(event) => { setQuantity(event.target.value); setFieldErrors({}); }} aria-invalid={Boolean(fieldErrors.cantidad)} />
            {fieldErrors.cantidad && <span className="mt-1 block text-xs text-red-600" role="alert">{fieldErrors.cantidad}</span>}
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Motivo del movimiento (opcional)
            <input className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Recepción proveedor, merma o ajuste físico" />
          </label>

          {adjustmentMutation.error && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(adjustmentMutation.error)}</div>}

          <footer className="flex justify-end gap-2 border-t border-slate-100 pt-5">
            <button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onClose} disabled={adjustmentMutation.isPending}>Cancelar</button>
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-5 text-sm font-semibold text-white transition-all hover:bg-brand-dark active:scale-95 disabled:opacity-60" disabled={adjustmentMutation.isPending}>
              {adjustmentMutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {adjustmentMutation.isPending ? 'Registrando...' : 'Registrar movimiento'}
            </button>
          </footer>
        </form>
      </motion.section>
    </div>
  );
};

export default StockAdjustmentModal;
