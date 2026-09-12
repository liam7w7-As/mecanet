import { Wrench } from 'lucide-react';
import React from 'react';

export const Home: React.FC = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl border border-slate-200">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-accent shadow-md">
          <Wrench className="h-8 w-8" />
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-primary">Hola UNITHOR</h1>
        <p className="mb-6 text-sm text-slate-600">
          Sistema integral de gestión para taller mecánico, órdenes de trabajo y control comercial.
        </p>
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 font-semibold text-primary shadow transition-all hover:bg-accent-hover active:scale-[0.98]"
        >
          Iniciar Operaciones
        </button>
      </div>
    </div>
  );
};

export default Home;
