export const WORK_ORDER_STATUS = [
    'en_progreso',
    'esperando_repuesto',
    'finalizada',
    'entregada',
    'cancelada',
];
export const WORK_ORDER_STATUS_LABELS = {
    en_progreso: 'Iniciada',
    esperando_repuesto: 'Esperando repuesto',
    finalizada: 'Finalizada',
    entregada: 'Entregada',
    cancelada: 'Cancelada',
};
export const getWorkOrderStatusLabel = (status) => WORK_ORDER_STATUS_LABELS[status];
