import { Search } from 'lucide-react';
import { useState } from 'react';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useExpressOrders } from '../../hooks/usePurchasesExpress';

import type { ExpressOrderOption } from '@unithor/shared';

export default function ExpressOrderPicker({
  onSelect,
  exclude = [],
  label = 'Buscar OT o patente',
  completion = false,
}: {
  onSelect: (order: ExpressOrderOption) => void;
  exclude?: number[];
  label?: string;
  completion?: boolean;
}) {
  const [search, setSearch] = useState('');
  const query = useExpressOrders(useDebouncedValue(search.trim(), 250), true, completion);
  const available = query.data?.filter((order) => !exclude.includes(order.id)) ?? [];
  return (
    <div className="express-order-picker">
      <div className="express-search">
        <Search aria-hidden="true" />
        <input
          type="search"
          aria-label={label}
          placeholder="Buscar OT o patente"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="express-order-results" aria-label="Resultados de órdenes" role="region">
        {query.isPending ? (
          <p role="status">Buscando órdenes…</p>
        ) : query.isError ? (
          <p role="alert">
            No se pudieron cargar las órdenes.{' '}
            <button type="button" onClick={() => void query.refetch()}>
              Reintentar
            </button>
          </p>
        ) : available.length === 0 ? (
          <p>Sin resultados</p>
        ) : (
          available.map((order) => (
            <button
              type="button"
              key={order.id}
              onClick={() => {
                onSelect(order);
                setSearch('');
              }}
            >
              <strong>
                {order.codigo} · {order.patente}
              </strong>
              <span>{order.vehiculo}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
