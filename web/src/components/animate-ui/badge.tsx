import { motion } from 'motion/react';
import React from 'react';

import type { ReactNode } from 'react';

export type BadgeVariant =
  | 'blue'
  | 'yellow'
  | 'emerald'
  | 'red'
  | 'amber'
  | 'purple'
  | 'slate';

export interface AnimatedBadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  pulse?: boolean;
  className?: string;
  icon?: ReactNode;
}

const colorMap: Record<BadgeVariant, { bg: string; text: string; dot: string; ping: string }> = {
  blue: {
    bg: 'bg-brand-pale border-brand-line',
    text: 'text-brand-primaryInk',
    dot: 'bg-brand-primaryInk',
    ping: 'bg-brand-primaryInk/40',
  },
  yellow: {
    bg: 'bg-yellow-50 border-yellow-200',
    text: 'text-yellow-800',
    dot: 'bg-yellow-500',
    ping: 'bg-yellow-400/50',
  },
  emerald: {
    bg: 'bg-brand-mintPale border-brand-line',
    text: 'text-brand-mintInk',
    dot: 'bg-brand-mint',
    ping: 'bg-emerald-400/50',
  },
  red: {
    bg: 'bg-brand-coralPale border-brand-coral/30',
    text: 'text-brand-coralInk',
    dot: 'bg-brand-coral',
    ping: 'bg-red-400/50',
  },
  amber: {
    bg: 'bg-brand-goldPale border-brand-line',
    text: 'text-brand-goldInk',
    dot: 'bg-brand-gold',
    ping: 'bg-amber-400/50',
  },
  purple: {
    bg: 'bg-purple-50 border-purple-200',
    text: 'text-purple-800',
    dot: 'bg-purple-500',
    ping: 'bg-purple-400/50',
  },
  slate: {
    bg: 'bg-brand-pale border-brand-line',
    text: 'text-brand-ink',
    dot: 'bg-slate-400',
    ping: 'bg-brand-line/50',
  },
};

/**
 * AnimatedBadge (estilo Animate UI):
 * Píldora de estado con punto indicador animado (ping/pulse) para estados vivos.
 */
export const AnimatedBadge = ({
  children,
  variant = 'slate',
  pulse = false,
  className = '',
  icon,
}: AnimatedBadgeProps) => {
  const colors = colorMap[variant] ?? colorMap.slate;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold ${colors.bg} ${colors.text} ${className}`}
    >
      {pulse && (
        <span className="relative flex h-2 w-2 items-center justify-center">
          <motion.span
            className={`absolute inline-flex h-full w-full rounded-full ${colors.ping}`}
            animate={{ scale: [1, 2, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
          />
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${colors.dot}`} />
        </span>
      )}
      {icon}
      <span>{children}</span>
    </span>
  );
};

export default AnimatedBadge;
