interface ModulePageProps {
  title: string;
  description: string;
}

export const ModulePage = ({ title, description }: ModulePageProps) => (
  <div className="space-y-6">
    <section>
      <p className="mb-1 text-sm font-medium text-brand-muted">Módulo</p>
      <h1 className="text-2xl font-bold text-brand-primaryInk sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-brand-muted sm:text-base">{description}</p>
    </section>

    <section className="rounded-lg border border-dashed border-brand-line bg-white px-6 py-12 text-center">
      <p className="font-medium text-brand-primaryInk">Vista preparada para la siguiente fase</p>
      <p className="mt-1 text-sm text-brand-muted">La ruta y el acceso protegido ya están activos.</p>
    </section>
  </div>
);

export default ModulePage;
