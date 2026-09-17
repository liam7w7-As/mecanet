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
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-brand-blue',
    dot: 'bg-brand-blue',
    ping: 'bg-brand-blue/40',
  },
  yellow: {
    bg: 'bg-yellow-50 border-yellow-200',
    text: 'text-yellow-800',
    dot: 'bg-yellow-500',
    ping: 'bg-yellow-400/50',
  },
  emerald: {
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-800',
    dot: 'bg-emerald-500',
    ping: 'bg-emerald-400/50',
  },
  red: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-800',
    dot: 'bg-red-500',
    ping: 'bg-red-400/50',
  },
  amber: {
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    dot: 'bg-amber-500',
    ping: 'bg-amber-400/50',
  },
  purple: {
    bg: 'bg-purple-50 border-purple-200',
    text: 'text-purple-800',
    dot: 'bg-purple-500',
    ping: 'bg-purple-400/50',
  },
  slate: {
    bg: 'bg-slate-100 border-slate-200',
    text: 'text-slate-700',
    dot: 'bg-slate-400',
    ping: 'bg-slate-300/50',
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
