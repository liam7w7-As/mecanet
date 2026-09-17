import { motion } from 'motion/react';
import React from 'react';

import type { HTMLAttributes, ReactNode } from 'react';

export interface AnimatedCardProps extends HTMLAttributes<HTMLDivElement> {
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
      {...(props as any)}
    >
      {children}
    </motion.div>
  );
};

export default AnimatedCard;
