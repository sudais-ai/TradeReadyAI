import { notFound } from "next/navigation";
import Link from "next/link";
import { getTradeCaseById } from "@/actions/trade-cases";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { CaseSection } from "@/components/ui/CaseSection";
import { NextStepCard } from "@/components/ui/NextStepCard";
import { Button } from "@/components/ui/Button";
import { DeleteCaseButton } from "@/components/ui/DeleteCaseButton";

function getCaseStatusBadgeVariant(status: string) {
  switch (status) {
    case "Draft": return "default";
    case "In Progress": return "warning";
    case "Needs Information": return "error";
    case "Ready for Review": return "outline";
    case "Reviewed": return "success";
    default: return "default";
  }
}

function getHumanStatus(status: string) {
  switch (status) {
    case "Needs Information": return "Information needed";
    default: return status;
  }
}

export default async function CaseWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tradeCase = await getTradeCaseById(id);

  if (!tradeCase) {
    notFound();
  }

  const completedSections = tradeCase.sections.filter((s) => s.status === "Complete").length;
  const totalSections = tradeCase.sections.length;
  const progressPercent = Math.round((completedSections / totalSections) * 100);
  const needsAttention = tradeCase.sections.filter((s) => s.status === "Needs Information" || s.status === "In Progress");

  // Determine next step description
  const nextStepDescription = tradeCase.status === "Reviewed"
    ? "This case has been reviewed. You can view the full trade dossier."
    : tradeCase.status === "Ready for Review"
    ? "All sections are complete. You can now review the entire case."
    : "We need a few more details before we can check the relevant trade requirements for this shipment.";

  return (
    <div className="pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: tradeCase.productName },
        ]}
      />

      {/* Case Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-10">
        <div>
          <div className="flex items-center gap-4 mb-3 flex-wrap">
            <h1 className="font-display text-3xl font-bold tracking-tight text-ink">{tradeCase.productName}</h1>
            <Badge variant={getCaseStatusBadgeVariant(tradeCase.status) as "default" | "success" | "warning" | "error" | "outline"} className="shadow-sm">
              {getHumanStatus(tradeCase.status)}
            </Badge>
          </div>
          <p className="text-ink-soft flex items-center gap-2.5 flex-wrap text-sm">
            <span className="font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">{tradeCase.origin}</span>
            <svg className="w-4 h-4 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <span className="font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">{tradeCase.destination}</span>
            <span className="text-slate-300 mx-1">·</span>
            <span className="text-slate-600 font-medium capitalize tracking-wide">{tradeCase.direction}</span>
          </p>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mt-4">Last updated {tradeCase.lastUpdated}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <DeleteCaseButton caseId={tradeCase.id} />
          <Link href={`/cases/${tradeCase.id}/edit`}>
            <Button variant="outline" size="sm">Edit Case</Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">← Dashboard</Button>
          </Link>
        </div>
      </div>

      {/* Mobile section nav — horizontal scroll on small screens */}
      <nav
        aria-label="Case sections"
        className="lg:hidden mb-6 -mx-4 sm:-mx-6 lg:mx-0"
      >
        <div className="overflow-x-auto px-4 sm:px-6 lg:px-0">
          <ul className="flex gap-2 min-w-max">
            {tradeCase.sections.map((section) => {
              const isComplete = section.status === "Complete";
              return (
                <li key={section.id} className="shrink-0">
                  <Link
                    href={section.actionHref}
                    className="flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${isComplete ? "bg-success-500" : "bg-slate-300"}`}
                      aria-hidden="true"
                    />
                    {section.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Main layout: sidebar + content */}
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar — case navigation (desktop only) */}
        <aside className="hidden lg:block w-56 shrink-0">
          <nav className="sticky top-24 space-y-1" aria-label="Case sections">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3 px-3">Sections</p>
            {tradeCase.sections.map((section) => {
              const isComplete = section.status === "Complete";
              return (
                <Link
                  key={section.id}
                  href={section.actionHref}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-slate-50 hover:text-ink transition-colors"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
                    {isComplete ? (
                      <svg className="w-4 h-4 text-mint" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-slate-200" />
                    )}
                  </span>
                  <span className="truncate">{section.title}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Next Step Card — only show if case is not fully reviewed */}
          {tradeCase.status !== "Reviewed" && (
            <NextStepCard
              title={tradeCase.nextAction}
              description={nextStepDescription}
              actionText={tradeCase.nextAction}
              actionHref={tradeCase.nextActionHref}
            />
          )}

          {/* Progress Summary */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-ink text-lg">Overall Progress</h2>
              <span className="text-sm font-bold text-ink">
                {progressPercent}%
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden mb-4">
              <div
                className="h-full rounded-full bg-blue transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
                role="progressbar"
                aria-valuenow={progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Case progress: ${completedSections} of ${totalSections} sections complete`}
              />
            </div>
            <p className="text-sm font-medium text-ink-soft">
              {completedSections} of {totalSections} sections complete
              {needsAttention.length > 0 && (
                <> · <span className="text-amber font-semibold">{needsAttention.length} {needsAttention.length === 1 ? "needs" : "need"} attention</span></>
              )}
            </p>
          </div>

          {/* Case Overview */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="font-display font-semibold text-ink text-lg mb-5">Case Details</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5 text-sm">
              <div>
                <span className="text-muted block mb-1 text-xs uppercase tracking-wider font-medium">Direction</span>
                <span className="font-semibold text-ink">{tradeCase.direction}</span>
              </div>
              <div>
                <span className="text-muted block mb-1 text-xs uppercase tracking-wider font-medium">Origin</span>
                <span className="font-semibold text-ink">{tradeCase.origin}</span>
              </div>
              <div>
                <span className="text-muted block mb-1 text-xs uppercase tracking-wider font-medium">Destination</span>
                <span className="font-semibold text-ink">{tradeCase.destination}</span>
              </div>
              <div>
                <span className="text-muted block mb-1 text-xs uppercase tracking-wider font-medium">Product</span>
                <span className="font-semibold text-ink">{tradeCase.productName}</span>
              </div>
              <div>
                <span className="text-muted block mb-1 text-xs uppercase tracking-wider font-medium">Shipment Date</span>
                <span className="font-semibold text-ink">{tradeCase.shipmentDate}</span>
              </div>
              <div>
                <span className="text-muted block mb-1 text-xs uppercase tracking-wider font-medium">Estimated Value</span>
                <span className="font-semibold text-ink">{tradeCase.estimatedValue}</span>
              </div>
            </div>
          </div>

          {/* Case Sections */}
          <div>
            <h2 className="font-display font-semibold text-ink text-lg mb-4">Sections</h2>
            <div className="space-y-3">
              {tradeCase.sections.map((section) => (
                <CaseSection
                  key={section.id}
                  title={section.title}
                  status={section.status}
                  description={section.description}
                  progress={section.progress}
                  actionText={section.actionText}
                  actionHref={section.actionHref}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
