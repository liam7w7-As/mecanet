import { motion } from 'motion/react';

import type { HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';

export interface AnimatedCardProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  className?: string;
  hoverLift?: number;
  enableHover?: boolean;
}

/**
 * AnimatedCard (estilo Animate UI):
 * Tarjeta interactiva con elevación sutil y física spring al interactuar.
 */
export const AnimatedCard = ({
  children,
  className = '',
  hoverLift = -3,
  enableHover = true,
  ...props
}: AnimatedCardProps) => {
  return (
    <motion.div
      className={className}
      whileHover={
        enableHover
          ? {
              y: hoverLift,
              transition: { type: 'spring', stiffness: 400, damping: 25 },
            }
          : undefined
      }
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default AnimatedCard;
