import { motion } from 'motion/react';

import type { ReactNode } from 'react';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}

/** Entrada elegante: fade + leve desplazamiento vertical. */
export const FadeIn = ({ children, delay = 0, y = 12, className }: FadeInProps) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35, delay, ease: EASE_OUT }}
  >
    {children}
  </motion.div>
);

interface StaggerProps {
  children: ReactNode;
  className?: string;
  delayChildren?: number;
  stagger?: number;
}

/** Contenedor que escalona la entrada de sus StaggerItem hijos. */
export const Stagger = ({ children, className, delayChildren = 0.05, stagger = 0.06 }: StaggerProps) => (
  <motion.div
    className={className}
    initial="hidden"
    animate="show"
    variants={{
      hidden: {},
      show: { transition: { staggerChildren: stagger, delayChildren } },
    }}
  >
    {children}
  </motion.div>
);

export const StaggerItem = ({ children, className }: { children: ReactNode; className?: string }) => (
  <motion.div
    className={className}
    variants={{
      hidden: { opacity: 0, y: 14 },
      show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT } },
    }}
  >
    {children}
  </motion.div>
);
