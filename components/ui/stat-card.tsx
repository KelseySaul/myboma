import * as React from 'react';
import { Card, CardContent } from './card';
import { cn } from '@/lib/utils';

export interface StatCardProps extends React.ComponentProps<typeof Card> {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  description?: string;
  trend?: {
    value: number;
    label: string;
  };
}

export function StatCard({
  title,
  value,
  icon,
  description,
  trend,
  className,
  ...props
}: StatCardProps) {
  return (
    <Card className={cn('p-4 sm:p-6', className)} {...props}>
      <div className="flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {icon && <div className="text-muted-foreground opacity-50">{icon}</div>}
      </div>
      <CardContent className="p-0">
        <div className="text-2xl font-bold">{value}</div>
        {(description || trend) && (
          <p className="text-xs text-muted-foreground mt-1">
            {trend && (
              <span
                className={cn(
                  'mr-1 font-medium',
                  trend.value > 0
                    ? 'text-success'
                    : trend.value < 0
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                )}
              >
                {trend.value > 0 ? '+' : ''}
                {trend.value}%
              </span>
            )}
            {trend?.label || description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
