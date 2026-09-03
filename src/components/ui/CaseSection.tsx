import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { SectionStatus } from "@/lib/mock-data";

interface CaseSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  status: SectionStatus;
  description: string;
  progress?: string;
  actionText: string;
  actionHref: string;
}

function getStatusBadgeVariant(status: SectionStatus) {
  switch (status) {
    case "Complete": return "success";
    case "In Progress": return "warning";
    case "Needs Information": return "error";
    case "Not Started": return "default";
    default: return "default";
  }
}

function getStatusLabel(status: SectionStatus, progress?: string) {
  if (progress && status !== "Complete" && status !== "Not Started") {
    return `${progress} completed`;
  }
  return status;
}

export function CaseSection({
  title,
  status,
  description,
  progress,
  actionText,
  actionHref,
  className,
  ...props
}: CaseSectionProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-border bg-surface hover:shadow-sm transition-shadow",
        className
      )}
      {...props}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1.5 flex-wrap">
          <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
          <Badge variant={getStatusBadgeVariant(status) as "default" | "success" | "warning" | "error" | "outline"}>
            {getStatusLabel(status, progress)}
          </Badge>
        </div>
        <p className="text-sm text-ink-soft">{description}</p>
      </div>
      <Link href={actionHref} className="shrink-0">
        <Button variant="outline" size="sm" className="w-full sm:w-auto bg-white hover:bg-slate-50 font-semibold shadow-sm border-border text-ink">
          {actionText}
        </Button>
      </Link>
    </div>
  );
}
