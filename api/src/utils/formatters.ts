const clpFormatter = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

/** Monto CLP sin decimales, tal como se muestra en toda la aplicación. */
export const formatClpAmount = (value: number): string => clpFormatter.format(value);
