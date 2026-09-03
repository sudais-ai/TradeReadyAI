import * as React from "react";
import { cn } from "@/lib/utils";

type StatusPillStatus = "success" | "warning" | "error" | "info" | "neutral";

interface StatusPillProps {
  status: StatusPillStatus;
  label: string;
  pulse?: boolean;
  className?: string;
}

const statusStyles: Record<StatusPillStatus, string> = {
  success: "bg-mint/10 text-mint ring-mint/20",
  warning: "bg-amber/10 text-amber ring-amber/20",
  error: "bg-error-50 text-error-500 ring-error-200",
  info: "bg-blue-soft text-blue ring-blue/20",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
};

const dotStyles: Record<StatusPillStatus, string> = {
  success: "bg-mint",
  warning: "bg-amber",
  error: "bg-error-500",
  info: "bg-blue",
  neutral: "bg-slate-400",
};

export function StatusPill({ status, label, pulse, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
        statusStyles[status],
        className
      )}
    >
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", dotStyles[status])} />
        )}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", dotStyles[status])} />
      </span>
      {label}
    </span>
  );
}
