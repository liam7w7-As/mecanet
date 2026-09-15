import { BookOpen, Car, ClipboardList, ReceiptText } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '../stores/auth.store';

const quickLinks = [
  {
    title: 'Órdenes de trabajo',
    description: 'Revisa y gestiona el flujo operativo del taller.',
    path: '/work-orders',
    icon: ClipboardList,
    accent: 'bg-blue-50 text-blue-700',
  },
  {
    title: 'Cotizaciones',
    description: 'Consulta presupuestos, pagos y saldos comerciales.',
    path: '/quotations',
    icon: ReceiptText,
    accent: 'bg-amber-50 text-amber-700',
  },
  {
    title: 'Vehículos',
    description: 'Busca vehículos y revisa su cliente asociado.',
    path: '/vehicles',
    icon: Car,
    accent: 'bg-emerald-50 text-emerald-700',
  },
  {
    title: 'Catálogo',
    description: 'Consulta servicios, repuestos y existencias.',
    path: '/catalog',
    icon: BookOpen,
    accent: 'bg-violet-50 text-violet-700',
  },
] as const;

export const DashboardPage = () => {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="space-y-7">
      <section>
        <p className="mb-1 text-sm font-medium text-slate-500">Dashboard</p>
        <h1 className="text-2xl font-bold text-brand-blue sm:text-3xl">
          Hola, {user?.nombre ?? 'usuario'}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
          Accede a las áreas principales de operación y gestión comercial.
        </p>
      </section>

      <section aria-labelledby="quick-access-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="quick-access-title" className="text-lg font-semibold text-slate-900">
            Accesos rápidos
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className="group rounded-lg border border-slate-200 bg-white p-5 transition hover:border-brand-blue/25 hover:shadow-md hover:shadow-brand-blue/5"
              >
                <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg ${item.accent}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="font-semibold text-brand-blue group-hover:text-blue-800">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-500">{item.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="border-l-4 border-brand-yellow bg-white px-5 py-4">
        <p className="text-sm font-semibold text-brand-blue">Sesión activa</p>
        <p className="mt-1 text-sm text-slate-600">
          Conectado como {user?.email} con rol {user?.role}.
        </p>
      </section>
    </div>
  );
};

export default DashboardPage;
