import * as React from "react";
import Link from "next/link";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface CaseCardProps {
  id: string;
  productName: string;
  origin: string;
  destination: string;
  status: "Draft" | "In Progress" | "Needs Information" | "Ready for Review" | "Reviewed";
  lastUpdated?: string;
  actionText?: string;
  actionHref?: string;
}

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case "Draft": return "default";
    case "In Progress": return "warning";
    case "Needs Information": return "error";
    case "Ready for Review": return "outline";
    case "Reviewed": return "success";
    default: return "default";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "Needs Information": return "Information needed";
    default: return status;
  }
}

export function CaseCard({
  id,
  productName,
  origin,
  destination,
  status,
  lastUpdated,
  actionText,
  actionHref,
}: CaseCardProps) {
  return (
    <Card data-case-id={id} className="flex flex-col h-full hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 bg-surface border-border">
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-semibold text-lg line-clamp-1 text-ink">{productName}</h3>
            <p className="text-sm text-ink-soft mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-xs">{origin}</span>
              <svg className="w-3.5 h-3.5 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <span className="font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-xs">{destination}</span>
            </p>
          </div>
          <Badge variant={getStatusBadgeVariant(status) as "default" | "success" | "warning" | "error" | "outline"} className="whitespace-nowrap shrink-0 shadow-sm">
            {getStatusLabel(status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 py-4">
        {lastUpdated && (
          <p className="text-xs font-medium text-muted uppercase tracking-wider">Updated {lastUpdated}</p>
        )}
      </CardContent>
      {actionText && actionHref && (
        <CardFooter className="pt-3 border-t border-border mt-auto p-4 bg-slate-50/30 rounded-b-xl">
          <Link href={actionHref} className="w-full">
            <Button variant="outline" className="w-full justify-center bg-white hover:bg-slate-50 text-sm font-semibold text-ink transition-colors shadow-sm ring-1 ring-border border-0">
              {actionText}
            </Button>
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}
