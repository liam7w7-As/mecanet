import { motion } from 'motion/react';

import type { HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';

export interface AnimatedTableRowProps
  extends HTMLMotionProps<'tr'> {
  children: ReactNode;
  className?: string;
  delay?: number;
  index?: number;
  enableHover?: boolean;
}

/**
 * AnimatedTableRow (estilo Animate UI):
 * Fila de tabla con animación de entrada y micro-interacción de hover.
 */
export const AnimatedTableRow = ({
  children,
  className = '',
  delay = 0,
  index,
  enableHover = true,
  ...props
}: AnimatedTableRowProps) => {
  const effectiveDelay = index !== undefined ? Math.min(index * 0.03, 0.3) : delay;
  return (
    <motion.tr
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: effectiveDelay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={
        enableHover
          ? {
              backgroundColor: 'rgba(241, 245, 249, 0.75)',
              transition: { duration: 0.15 },
            }
          : undefined
      }
      {...props}
    >
      {children}
    </motion.tr>
  );
};

export default AnimatedTableRow;
