import { ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';

export const ForbiddenPage = () => (
  <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-brand-coralPale text-brand-coralInk">
      <ShieldX className="h-7 w-7" aria-hidden="true" />
    </div>
    <p className="text-sm font-semibold text-brand-coralInk">Error 403</p>
    <h1 className="mt-2 text-2xl font-bold text-brand-primaryInk">Acceso restringido</h1>
    <p className="mt-2 text-sm text-brand-muted">
      Tu rol no tiene autorización para ingresar a esta sección.
    </p>
    <Link
      to="/dashboard"
      className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand-primaryInk px-4 text-sm font-semibold text-white hover:bg-brand-primaryInkHover"
    >
      Volver al dashboard
    </Link>
  </div>
);

export default ForbiddenPage;
