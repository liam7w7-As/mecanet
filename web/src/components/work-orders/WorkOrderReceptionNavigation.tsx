import { Camera, Car, ListChecks, UserRound } from 'lucide-react';

import type { CSSProperties } from 'react';

export type ReceptionStep = 0 | 1 | 2 | 3;

export const WORK_ORDER_RECEPTION_STEPS = [
  {
    id: 0,
    title: 'Cliente y facturación',
    heading: '¿Quién entrega y a quién facturamos?',
    description:
      'Selecciona al responsable del ingreso. La facturación usa sus datos salvo que indiques otros.',
    short: 'Cliente',
    icon: UserRound,
  },
  {
    id: 1,
    title: 'Vehículo',
    heading: '¿Qué vehículo ingresa?',
    description: 'Selecciona el vehículo que ingresa al taller.',
    short: 'Vehículo',
    icon: Car,
  },
  {
    id: 2,
    title: 'Inspección',
    heading: '¿Cómo ingresa el vehículo?',
    description: 'Registra los datos de recepción. Los detalles adicionales son opcionales.',
    short: 'Revisión',
    icon: Camera,
  },
  {
    id: 3,
    title: 'Servicios',
    heading: '¿Qué trabajos vamos a realizar?',
    description:
      'Agrega servicios o repuestos. Puedes continuar sin ítems si el diagnóstico está pendiente.',
    short: 'Servicios',
    icon: ListChecks,
  },
] as const;

export default function WorkOrderReceptionNavigation({
  activeStep,
  onStep,
}: {
  activeStep: ReceptionStep;
  onStep: (step: ReceptionStep) => void;
}) {
  const lastStep = WORK_ORDER_RECEPTION_STEPS.length - 1;
  return (
    <nav className="reception-navigation" aria-label="Línea de tiempo de orden de trabajo">
      <ol style={{ '--reception-progress': activeStep / lastStep } as CSSProperties}>
        {WORK_ORDER_RECEPTION_STEPS.map((step) => {
          return (
            <li key={step.id}>
              <button
                type="button"
                aria-current={step.id === activeStep ? 'step' : undefined}
                data-complete={step.id < activeStep}
                onClick={() => onStep(step.id)}
                title={`${step.title}: ${step.description}`}
                aria-label={`${step.id + 1}. ${step.title}`}
              >
                <span className="reception-step-icon" aria-hidden="true">
                  {step.id + 1}
                </span>
                <span className="reception-step-label">
                  <strong data-short-label={step.short}>{step.title}</strong>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
