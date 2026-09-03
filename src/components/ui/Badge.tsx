import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "warning" | "error" | "outline";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "border-transparent bg-slate-100 text-slate-900",
    success: "border-transparent bg-success-100 text-success-700",
    warning: "border-transparent bg-warning-100 text-warning-700",
    error: "border-transparent bg-error-100 text-error-700",
    outline: "text-slate-900 border-border",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
