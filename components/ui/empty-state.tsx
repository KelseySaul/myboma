import * as React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { Button } from './button';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
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
        'flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center animate-in fade-in-50',
        className
      )}
      {...props}
    >
      {icon && (
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 mb-4 text-muted-foreground">
          {icon}
        </div>
      )}
      <h3 className="mt-4 text-lg font-medium">{title}</h3>
      <p className="mb-4 mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
        {description}
      </p>
      {action && (
        <Button onClick={action.onClick} variant="default" size="sm">
          {action.label}
        </Button>
      )}
    </div>
  );
}
