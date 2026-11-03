import { Building2, Camera, Car, Check, ListChecks, UserRound } from 'lucide-react';

export type ReceptionStep = 0 | 1 | 2 | 3 | 4;

export const WORK_ORDER_RECEPTION_STEPS = [
  { id: 0, title: 'Responsable', description: 'Quién entrega y asume la OT', icon: UserRound },
  { id: 1, title: 'Facturación', description: 'Contacto y factura', icon: Building2 },
  { id: 2, title: 'Vehículo', description: 'Auto que ingresa', icon: Car },
  { id: 3, title: 'Inspección', description: 'Estado de recepción', icon: Camera },
  { id: 4, title: 'Servicios', description: 'Trabajos y repuestos', icon: ListChecks },
] as const;

export default function WorkOrderReceptionNavigation({ activeStep, onStep }: {
  activeStep: ReceptionStep;
  onStep: (step: ReceptionStep) => void;
}) {
  return <nav className="reception-navigation" aria-label="Línea de tiempo de orden de trabajo">
    <div className="reception-navigation-caption">
      <span>Recepción de vehículo</span><span>Paso {activeStep + 1} de 5</span>
    </div>
    <ol>
      {WORK_ORDER_RECEPTION_STEPS.map((step) => {
        const Icon = step.id < activeStep ? Check : step.icon;
        return <li key={step.id}>
          <button type="button" aria-current={step.id === activeStep ? 'step' : undefined}
            data-complete={step.id < activeStep} onClick={() => onStep(step.id)}
            title={`${step.title}: ${step.description}`} aria-label={`${step.id + 1}. ${step.title}`}>
            <span className="reception-step-icon"><Icon aria-hidden="true" /></span>
            <span className="reception-step-label"><strong>{step.title}</strong><small>{step.description}</small></span>
            <span className="reception-step-number" aria-hidden="true">{step.id + 1}</span>
          </button>
        </li>;
      })}
    </ol>
  </nav>;
}
