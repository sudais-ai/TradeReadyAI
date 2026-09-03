import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
}

export function PageHeader({ title, description, actions, badge, className, ...props }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-10", className)} {...props}>
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">{title}</h1>
          {badge}
        </div>
        {description && <p className="text-ink-soft mt-1.5 text-sm sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </div>
  );
}
