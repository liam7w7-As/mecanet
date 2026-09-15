interface ModulePageProps {
  title: string;
  description: string;
}

export const ModulePage = ({ title, description }: ModulePageProps) => (
  <div className="space-y-6">
    <section>
      <p className="mb-1 text-sm font-medium text-slate-500">Módulo</p>
      <h1 className="text-2xl font-bold text-brand-blue sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">{description}</p>
    </section>

    <section className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="font-medium text-brand-blue">Vista preparada para la siguiente fase</p>
      <p className="mt-1 text-sm text-slate-500">La ruta y el acceso protegido ya están activos.</p>
    </section>
  </div>
);

export default ModulePage;
