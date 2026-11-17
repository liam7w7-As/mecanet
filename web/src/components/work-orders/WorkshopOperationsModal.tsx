import { Clock3 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

import WorkshopAlertsPanel from './WorkshopAlertsPanel';
import WorkshopTimePanel from './WorkshopTimePanel';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { useAuthStore } from '../../stores/auth.store';
import ModalHeader from '../common/ModalHeader';
import WorkshopPersonnelPanel from '../settings/WorkshopPersonnelPanel';

export default function WorkshopOperationsModal({ onClose, initialDate, initialOvertime }: {
  onClose: () => void;
  initialDate?: string;
  initialOvertime?: boolean;
}) {
  const role = useAuthStore((state) => state.user?.role);
  type Tab = 'time' | 'schedule' | 'alerts';
  const [tab, setTab] = useState<Tab>('time');
  const [states, setStates] = useState<Record<string, { dirty: boolean; pending: boolean }>>({});
  const [hasOpenedAlerts, setHasOpenedAlerts] = useState(false);
  const [alertsVersion, setAlertsVersion] = useState(0);
  const [confirm, setConfirm] = useState<null | 'close' | Tab>(null);
  const onState = useCallback((key: Tab, dirty: boolean, pending: boolean) => setStates((current) => current[key]?.dirty === dirty && current[key]?.pending === pending ? current : { ...current, [key]: { dirty, pending } }), []);
  const onTimeState = useCallback((dirty: boolean, pending: boolean) => onState('time', dirty, pending), [onState]);
  const onScheduleState = useCallback((dirty: boolean, pending: boolean) => onState('schedule', dirty, pending), [onState]);
  const onAlertsState = useCallback((dirty: boolean, pending: boolean) => onState('alerts', dirty, pending), [onState]);
  const dirty = Object.values(states).some((state) => state.dirty);
  const pending = Object.values(states).some((state) => state.pending);
  const select = (next: Tab): void => { if (next === 'alerts') setHasOpenedAlerts(true); setTab(next); };
  const request = (action: 'close' | Tab) => {
    if (pending) return;
    if (action === tab) return;
    if (dirty) { setConfirm(action); return; }
    if (action === 'close') onClose(); else select(action);
  };
  const panel = useModalOverlay({ isOpen: true, onClose: () => request('close'), isPending: pending });
  return createPortal(<div className="reference-modal-overlay fixed inset-0 z-[60] flex items-center justify-center bg-[#18273c55] p-3 backdrop-blur-sm">
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="workshop-operations-title" tabIndex={-1} className="reference-dialog workshop-operations-dialog flex max-h-[92dvh] w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <ModalHeader id="workshop-operations-title" title="Jornada y alertas del taller" description="Registros por trabajador, validaciones y seguimiento operativo" badge={<Clock3 />} onClose={() => request('close')} closeDisabled={pending} variant="plain" />
      <div className="flex flex-wrap gap-2 border-b border-brand-line px-5 py-3" role="tablist" aria-label="Control de jornada">
        <button type="button" role="tab" aria-selected={tab === 'time'} className={tab === 'time' ? 'primary-button' : 'secondary-button'} onClick={() => request('time')} disabled={pending}>Horas y solicitudes</button>
        {role !== 'mecanico' && <button type="button" role="tab" aria-selected={tab === 'schedule'} className={tab === 'schedule' ? 'primary-button' : 'secondary-button'} onClick={() => request('schedule')} disabled={pending}>Jornada y excepciones</button>}
        <button type="button" role="tab" aria-selected={tab === 'alerts'} className={tab === 'alerts' ? 'primary-button' : 'secondary-button'} onClick={() => request('alerts')} disabled={pending}>Alertas</button>
      </div>
      <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
        {tab === 'time' && <WorkshopTimePanel initialDate={initialDate} initialOvertime={initialOvertime} onState={onTimeState} />}
        {tab === 'schedule' && <WorkshopPersonnelPanel mode="chief" onState={onScheduleState} />}
        {hasOpenedAlerts && <div hidden={tab !== 'alerts'}><WorkshopAlertsPanel key={alertsVersion} active={tab === 'alerts'} onState={onAlertsState} /></div>}
      </div>
      {confirm && <div role="alertdialog" aria-label="Cambios sin guardar" className="border-t border-brand-line bg-brand-pale p-4"><p>Hay datos sin guardar. ¿Quieres descartarlos?</p><div className="mt-3 flex gap-3"><button className="secondary-button" type="button" disabled={pending} onClick={() => setConfirm(null)}>Seguir editando</button><button className="primary-button" type="button" disabled={pending} onClick={() => { if (confirm === 'close') onClose(); else { if (tab === 'alerts') setAlertsVersion((version) => version + 1); onState(tab, false, false); select(confirm); } setConfirm(null); }}>Descartar cambios</button></div></div>}
    </section>
  </div>, document.body);
}
