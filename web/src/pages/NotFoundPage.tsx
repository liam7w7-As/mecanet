import { SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';

export const NotFoundPage = () => (
  <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-brand-blue">
      <SearchX className="h-7 w-7" aria-hidden="true" />
    </div>
    <p className="text-sm font-semibold text-slate-500">Error 404</p>
    <h1 className="mt-2 text-2xl font-bold text-brand-blue">Página no encontrada</h1>
    <p className="mt-2 text-sm text-slate-600">La dirección solicitada no existe en UNITHOR.</p>
    <Link
      to="/dashboard"
      className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-dark"
    >
      Ir al dashboard
    </Link>
  </div>
);

export default NotFoundPage;
