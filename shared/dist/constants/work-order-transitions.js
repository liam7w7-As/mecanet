export const VALID_WORK_ORDER_TRANSITIONS = {
    borrador: ['en_progreso', 'cancelada'],
    en_progreso: ['esperando_repuesto', 'finalizada', 'cancelada'],
    esperando_repuesto: ['en_progreso', 'cancelada'],
    finalizada: ['entregada', 'en_progreso'],
    entregada: [],
    cancelada: [],
};
export const isValidWorkOrderTransition = (from, to) => {
    return VALID_WORK_ORDER_TRANSITIONS[from].includes(to);
};
