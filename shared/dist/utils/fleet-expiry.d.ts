export type FleetExpiryState = 'sin_vencimiento' | 'vencido' | 'vence_hoy' | 'critico' | 'advertencia' | 'vigente';
export interface FleetExpiryInfo {
    state: FleetExpiryState;
    /** Días de calendario restantes. Negativo cuando ya venció. */
    daysRemaining: number | null;
}
/**
 * Interpreta una fecha `YYYY-MM-DD` como fecha local, sin hora.
 *
 * No se usa `new Date('YYYY-MM-DD')` porque el estándar la interpreta como UTC
 * y en Chile eso puede mostrar el día anterior.
 */
export declare const parseFleetDateOnly: (value: string) => Date | null;
export declare const toFleetDateOnly: (value: Date) => string;
/**
 * Calcula el estado de un documento a partir de su fecha de vencimiento.
 *
 * El cálculo usa días de calendario locales y `Math.round`, para que los
 * cambios de horario (23 o 25 horas) no desplacen el resultado.
 */
export declare const getFleetExpiryInfo: (fechaVencimiento: string | null | undefined, today?: Date) => FleetExpiryInfo;
export declare const isFleetExpiryAttention: (state: FleetExpiryState) => boolean;
