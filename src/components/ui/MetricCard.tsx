import * as React from "react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: string; positive: boolean };
  className?: string;
}

export function MetricCard({ label, value, icon, trend, className }: MetricCardProps) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-sm transition-all hover:shadow-md",
      className
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted uppercase tracking-wider mb-2">{label}</p>
          <p className="font-display text-3xl font-bold text-ink tracking-tight">{value}</p>
          {trend && (
            <div className={cn(
              "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
              trend.positive ? "bg-mint/10 text-mint" : "bg-error-50 text-error-500"
            )}>
              <svg className={cn("h-3 w-3", !trend.positive && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              {trend.value}
            </div>
          )}
        </div>
        {icon && (
          <div className="rounded-xl bg-blue-soft p-3 text-blue">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
