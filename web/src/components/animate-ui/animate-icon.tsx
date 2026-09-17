import { motion } from 'motion/react';
import React, { useState } from 'react';

import type { ReactNode } from 'react';
import type { TargetAndTransition, Variants } from 'motion/react';

export type AnimateIconVariant =
  | 'wiggle'
  | 'spin'
  | 'spin-reverse'
  | 'bounce'
  | 'pulse'
  | 'slide-right'
  | 'slide-left'
  | 'hover-lift';

export interface AnimateIconProps {
  children?: ReactNode;
  icon?: React.ComponentType<{ className?: string; size?: number | string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  variant?: AnimateIconVariant;
  animation?: AnimateIconVariant;
  size?: number | string;
  animateOnHover?: boolean;
  animateOnTap?: boolean;
  animate?: boolean;
  loop?: boolean;
  className?: string;
}

const variantsMap: Record<AnimateIconVariant, Variants> = {
  wiggle: {
    idle: { rotate: 0, scale: 1 },
    active: {
      rotate: [0, -14, 12, -8, 6, 0],
      transition: { duration: 0.5, ease: 'easeInOut' as const },
    },
  },
  spin: {
    idle: { rotate: 0 },
    active: {
      rotate: 90,
      transition: { type: 'spring' as const, stiffness: 400, damping: 20 },
    },
  },
  'spin-reverse': {
    idle: { rotate: 0 },
    active: {
      rotate: -90,
      transition: { type: 'spring' as const, stiffness: 400, damping: 20 },
    },
  },
  bounce: {
    idle: { y: 0 },
    active: {
      y: [0, -4, 0, -2, 0],
      transition: { duration: 0.45, ease: 'easeOut' as const },
    },
  },
  pulse: {
    idle: { scale: 1 },
    active: {
      scale: [1, 1.2, 0.95, 1.05, 1],
      transition: { duration: 0.4, ease: 'easeInOut' as const },
    },
  },
  'slide-right': {
    idle: { x: 0 },
    active: {
      x: [0, 4, 0],
      transition: { type: 'spring' as const, stiffness: 450, damping: 22 },
    },
  },
  'slide-left': {
    idle: { x: 0 },
    active: {
      x: [0, -4, 0],
      transition: { type: 'spring' as const, stiffness: 450, damping: 22 },
    },
  },
  'hover-lift': {
    idle: { y: 0, scale: 1 },
    active: {
      y: -2,
      scale: 1.08,
      transition: { type: 'spring' as const, stiffness: 400, damping: 22 },
    },
  },
};

const loopVariantsMap: Record<AnimateIconVariant, TargetAndTransition> = {
  wiggle: {
    rotate: [0, -6, 6, -4, 4, 0],
    transition: { repeat: Infinity, duration: 2.2, ease: 'easeInOut' as const },
  },
  spin: {
    rotate: 360,
    transition: { repeat: Infinity, duration: 3, ease: 'linear' as const },
  },
  'spin-reverse': {
    rotate: -360,
    transition: { repeat: Infinity, duration: 3, ease: 'linear' as const },
  },
  bounce: {
    y: [0, -3, 0],
    transition: { repeat: Infinity, duration: 1.5, ease: 'easeInOut' as const },
  },
  pulse: {
    scale: [1, 1.1, 1],
    transition: { repeat: Infinity, duration: 1.8, ease: 'easeInOut' as const },
  },
  'slide-right': {
    x: [0, 3, 0],
    transition: { repeat: Infinity, duration: 1.6, ease: 'easeInOut' as const },
  },
  'slide-left': {
    x: [0, -3, 0],
    transition: { repeat: Infinity, duration: 1.6, ease: 'easeInOut' as const },
  },
  'hover-lift': {
    y: [0, -2, 0],
    transition: { repeat: Infinity, duration: 2, ease: 'easeInOut' as const },
  },
};

/**
 * AnimateIcon (estilo Animate UI):
 * Contenedor para iconos (ej. Lucide) que activa micro-animaciones fluidas con físicas de Motion.
 */
export const AnimateIcon = ({
  children,
  icon: IconComponent,
  variant,
  animation,
  size,
  animateOnHover = true,
  animateOnTap = true,
  animate,
  loop = false,
  className,
}: AnimateIconProps) => {
  const [isHovered, setIsHovered] = useState(false);

  const effectiveVariant = animation ?? variant ?? 'wiggle';
  const selectedVariant = variantsMap[effectiveVariant] ?? variantsMap.wiggle;
  const loopVariant = loopVariantsMap[effectiveVariant] ?? loopVariantsMap.wiggle;

  const shouldAnimate =
    animate !== undefined ? animate : animateOnHover && isHovered;

  const content = IconComponent ? (
    <IconComponent
      size={size ?? 16}
      className={className}
      aria-hidden="true"
    />
  ) : (
    children
  );

  return (
    <motion.span
      className="inline-flex shrink-0 items-center justify-center"
      onMouseEnter={() => animateOnHover && setIsHovered(true)}
      onMouseLeave={() => animateOnHover && setIsHovered(false)}
      initial="idle"
      animate={loop ? loopVariant : shouldAnimate ? 'active' : 'idle'}
      variants={selectedVariant}
      whileTap={
        animateOnTap ? { scale: 0.88, transition: { duration: 0.1 } } : undefined
      }
    >
      {content}
    </motion.span>
  );
};

export default AnimateIcon;
