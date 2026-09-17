import { MotionConfig } from 'motion/react';

import type { ReactNode } from 'react';

/**
 * Proveedor global de Motion (base de Animate UI).
 * reducedMotion="user" respeta "Reducir movimiento" del SO:
 * mantiene fades de opacidad y quita desplazamientos.
 */
export const MotionProvider = ({ children }: { children: ReactNode }) => (
  <MotionConfig reducedMotion="user">{children}</MotionConfig>
);

export default MotionProvider;
