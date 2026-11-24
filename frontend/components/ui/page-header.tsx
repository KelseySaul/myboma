import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  badge?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  badge,
  description,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 pb-6 md:flex-row md:items-end md:justify-between border-b border-slate-200/80 dark:border-slate-800 mb-6',
        className
      )}
      {...props}
    >
      <div className="space-y-1">
        {eyebrow && (
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {eyebrow}
          </div>
        )}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h1>
          {badge && <div>{badge}</div>}
        </div>
        {description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl font-normal leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>
      )}
    </div>
  );
}
