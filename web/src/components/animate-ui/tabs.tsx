import { motion } from 'motion/react';
import React from 'react';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface TabItem<T extends string = string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  count?: number;
  badge?: ReactNode;
}

export interface AnimatedTabsProps<T extends string = string> {
  tabs: Array<TabItem<T>>;
  activeTab: T;
  onChange: (value: T) => void;
  layoutId?: string;
  className?: string;
  ariaLabel?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * AnimatedTabs (estilo Animate UI):
 * Pestañas con píldora activa deslizante con físicas de spring (`layoutId`).
 * Mantiene semántica accesible (role="tablist", role="tab", aria-selected).
 */
export function AnimatedTabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  layoutId = 'animated-active-tab-indicator',
  className = '',
  ariaLabel = 'Pestañas de navegación',
  size = 'md',
}: AnimatedTabsProps<T>) {
  const sizeClasses = {
    sm: 'min-h-8 px-2.5 py-1 text-xs',
    md: 'min-h-9 px-3 py-1.5 text-sm',
    lg: 'min-h-11 px-4 py-2 text-base',
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`relative flex items-center gap-1.5 overflow-x-auto ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.value === activeTab;
        const Icon = tab.icon;

        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.value)}
            className={`relative z-10 inline-flex items-center gap-2 rounded-lg font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${
              sizeClasses[size]
            } ${
              isActive
                ? 'text-brand-blue font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {/* Píldora activa deslizante */}
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 -z-10 rounded-lg bg-white shadow-sm border border-slate-200/80"
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              />
            )}

            {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
            <span>{tab.label}</span>

            {tab.count !== undefined && (
              <span
                className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                  isActive
                    ? 'bg-brand-blue/10 text-brand-blue'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            )}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}

export default AnimatedTabs;
