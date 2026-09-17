import { motion } from 'motion/react';
import React, { forwardRef } from 'react';

import type { ButtonHTMLAttributes } from 'react';

export interface AnimatedButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  scaleOnHover?: number;
  scaleOnTap?: number;
  liftOnHover?: number;
}

/**
 * AnimatedButton (estilo Animate UI):
 * Botón con micro-interacciones spring suaves al pasar el ratón y al pulsar.
 * Se desactiva automáticamente si `disabled` es true.
 */
export const AnimatedButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  (
    {
      children,
      className,
      disabled,
      scaleOnHover = 1.02,
      scaleOnTap = 0.97,
      liftOnHover = -1,
      ...props
    },
    ref,
  ) => {
    return (
      <motion.button
        ref={ref}
        disabled={disabled}
        className={className}
        whileHover={
          disabled
            ? undefined
            : {
                scale: scaleOnHover,
                y: liftOnHover,
                transition: { type: 'spring', stiffness: 450, damping: 25 },
              }
        }
        whileTap={
          disabled
            ? undefined
            : {
                scale: scaleOnTap,
                transition: { type: 'spring', stiffness: 500, damping: 20 },
              }
        }
        {...(props as any)}
      >
        {children}
      </motion.button>
    );
  },
);

AnimatedButton.displayName = 'AnimatedButton';

export default AnimatedButton;
