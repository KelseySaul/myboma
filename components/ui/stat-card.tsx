import * as React from 'react';
import { cn } from '@/lib/utils';

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  description?: string;
  trend?: {
    value: number;
    label?: string;
  };
  iconBg?: string;
  accentColor?: 'blue' | 'amber' | 'emerald' | 'rose' | 'purple' | 'indigo';
  accent?: 'blue' | 'amber' | 'emerald' | 'rose' | 'purple' | 'indigo';
}

export function StatCard({
  title,
  value,
  icon,
  description,
  trend,
  iconBg,
  accentColor,
  accent,
  className,
  ...props
}: StatCardProps) {
  const activeAccent = accent || accentColor;
  const accentClasses = {
    blue: 'border-l-4 border-l-blue-500',
    amber: 'border-l-4 border-l-amber-500',
    emerald: 'border-l-4 border-l-emerald-500',
    rose: 'border-l-4 border-l-rose-500',
    purple: 'border-l-4 border-l-purple-500',
    indigo: 'border-l-4 border-l-indigo-500',
  };

  return (
    <div
      className={cn(
        'relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 shadow-xs hover:shadow-md transition-all duration-200 group overflow-hidden',
        activeAccent && accentClasses[activeAccent],
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400">
          {title}
        </span>
        {icon && (
          <div
            className={cn(
              'h-8 w-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 shrink-0 transition-transform group-hover:scale-105',
              iconBg
            )}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
          {value}
        </div>

        {trend && (
          <div
            className={cn(
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums',
              trend.value >= 0
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-700 border border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-300'
            )}
          >
            {trend.value > 0 ? '+' : ''}
            {trend.value}%
          </div>
        )}
      </div>

      {description && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-normal">
          {trend?.label ? `${trend.label} ` : ''}
          {description}
        </p>
      )}
    </div>
  );
}
