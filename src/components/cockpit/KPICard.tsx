"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KPICardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    label: string;
  };
  className?: string;
};

export function KPICard({ title, value, subtitle, trend, className }: KPICardProps) {
  const isPositive = trend && trend.value >= 0;

  return (
    <Card className={cn("border-slate-200 shadow-sm dark:border-slate-800", className)}>
      <CardContent className="flex h-full flex-col justify-between p-5">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
        
        <div className="mt-2 flex items-baseline gap-3">
          <p className="text-3xl font-bold tracking-tighter text-slate-900 dark:text-slate-50">{value}</p>
          
          {trend && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                isPositive
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400"
              )}
            >
              {isPositive ? "+" : ""}
              {trend.value}%
            </span>
          )}
        </div>

        {(subtitle || trend?.label) && (
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {trend?.label || subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
