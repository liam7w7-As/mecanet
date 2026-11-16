import { useState } from 'react';

import WorkshopTimePanel from './WorkshopTimePanel';

export default function WorkOrderTimeDetails({ workOrderId, onState }: { workOrderId: number; onState: (dirty: boolean, pending: boolean) => void }) {
  const [opened, setOpened] = useState(false);
  return <details className="workshop-progress-form mt-4" onToggle={(event) => { if (event.currentTarget.open) setOpened(true); }}>
    <summary>Horas manuales y correcciones de esta OT</summary>
    {opened && <WorkshopTimePanel workOrderId={workOrderId} onState={onState} />}
  </details>;
}
