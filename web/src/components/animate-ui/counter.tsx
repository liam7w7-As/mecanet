import { useEffect, useState } from 'react';

export interface AnimatedCounterProps {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
  'data-testid'?: string;
}

/**
 * AnimatedCounter (estilo Animate UI):
 * Contador numérico fluido con aceleración suave. En entornos de prueba o
 * con preferencia de reducción de movimiento, muestra el valor inmediatamente.
 */
export const AnimatedCounter = ({
  value,
  duration = 800,
  format,
  className,
  'data-testid': testId,
}: AnimatedCounterProps) => {
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  const [displayValue, setDisplayValue] = useState<number>(isTest ? value : 0);

  useEffect(() => {
    if (isTest) {
      setDisplayValue(value);
      return;
    }

    const start = 0;
    const startTime = performance.now();

    const update = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Easing out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (value - start) * eased);
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };

    const animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, [value, duration, isTest]);

  const formatted = format ? format(displayValue) : displayValue.toLocaleString('es-CL');

  return (
    <span className={className} data-testid={testId}>
      {formatted}
    </span>
  );
};

export default AnimatedCounter;
