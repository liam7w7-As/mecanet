import { motion } from 'motion/react';

import type { ReactNode } from 'react';

/**
 * Piezas de modal estilo Animate UI: backdrop con fade y panel
 * con spring suave (escala + fade + leve subida).
 * Solo animan entrada; incluyen props de salida para cuando el
 * padre las envuelva en AnimatePresence.
 */
export const AnimatedBackdrop = ({ children }: { children: ReactNode }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.2 }}
  >
    {children}
  </motion.div>
);

export const AnimatedPanel = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, scale: 0.96, y: 12 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.97, y: 8 }}
    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
  >
    {children}
  </motion.div>
);
