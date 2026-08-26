import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 p-10 text-center animate-in fade-in duration-300',
        className
      )}
      {...props}
    >
      {icon && (
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-xs mb-4 text-slate-500 dark:text-slate-400">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">{title}</h3>
      <p className="mb-5 mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
        {description}
      </p>
      {action && (
        <Button onClick={action.onClick} variant="default" size="sm" className="gap-2 shadow-xs">
          {action.icon}
          {action.label}
        </Button>
      )}
    </div>
  );
}
