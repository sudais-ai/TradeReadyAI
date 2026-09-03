import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, action, secondaryAction, icon, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "relative flex min-h-[400px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-surface p-12 text-center border border-border shadow-sm",
        className
      )}
      {...props}
    >
      {/* Soft gradient background */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-blue-soft blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-mint/20 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-lg">
        {icon ? (
          <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-border text-blue">
            {icon}
          </div>
        ) : (
          <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-border text-blue">
            <svg
              className="h-10 w-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
          </div>
        )}
        
        <h3 className="font-display text-2xl font-bold text-ink tracking-tight mb-2">{title}</h3>
        
        {description && (
          <p className="mb-8 text-base text-ink-soft leading-relaxed max-w-md">
            {description}
          </p>
        )}
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
          {action && <div className="w-full sm:w-auto">{action}</div>}
          {secondaryAction && <div className="w-full sm:w-auto">{secondaryAction}</div>}
        </div>
      </div>
    </div>
  );
}
