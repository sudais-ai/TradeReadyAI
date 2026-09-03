import { notFound } from "next/navigation";
import Link from "next/link";
import { getTradeCaseById } from "@/actions/trade-cases";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

function getSectionStatusLabel(status: string) {
  switch (status) {
    case "Needs Information": return "Information needed";
    default: return status;
  }
}

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tradeCase = await getTradeCaseById(id);

  if (!tradeCase) {
    notFound();
  }

  const completedSections = tradeCase.sections.filter((s) => s.status === "Complete");
  const incompleteSections = tradeCase.sections.filter((s) => s.status !== "Complete");
  const isReady = incompleteSections.length === 0;

  return (
    <div className="pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: tradeCase.productName, href: `/cases/${tradeCase.id}` },
          { label: "Review" },
        ]}
      />

      <PageHeader
        title="Case Review"
        description={`${tradeCase.productName} · ${tradeCase.origin} → ${tradeCase.destination}`}
        actions={
          <Link href={`/cases/${tradeCase.id}`}>
            <Button variant="outline" size="sm">← Back to Case</Button>
          </Link>
        }
      />

      {/* Summary */}
      <div className="rounded-lg border border-border bg-surface p-6 mb-6">
        <div className="flex items-start gap-4 mb-6">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${isReady ? "bg-success-100" : "bg-warning-100"}`} aria-hidden="true">
            {isReady ? (
              <svg className="h-6 w-6 text-success-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="h-6 w-6 text-warning-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            )}
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 text-lg">
              {isReady ? "This case is ready" : "This case is not ready yet"}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {completedSections.length} of {tradeCase.sections.length} {tradeCase.sections.length === 1 ? "section" : "sections"} complete.
              {incompleteSections.length > 0 && ` ${incompleteSections.length} still ${incompleteSections.length === 1 ? "needs" : "need"} attention.`}
            </p>
          </div>
        </div>

        {/* Section status list */}
        <div className="space-y-2">
          {tradeCase.sections.map((section) => {
            const isComplete = section.status === "Complete";
            return (
              <Link
                key={section.id}
                href={section.actionHref}
                className="flex items-center gap-3 p-3 rounded-md hover:bg-slate-50 transition-colors -mx-1"
              >
                <span className="shrink-0" aria-hidden="true">
                  {isComplete ? (
                    <svg className="h-5 w-5 text-success-600" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-warning-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
                    </svg>
                  )}
                </span>
                <span className={`text-sm flex-1 ${isComplete ? "text-slate-600" : "text-slate-900 font-medium"}`}>
                  {section.title}
                </span>
                <Badge variant={isComplete ? "success" : section.status === "Needs Information" ? "error" : section.status === "In Progress" ? "warning" : "default"}>
                  {getSectionStatusLabel(section.status)}
                </Badge>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      {!isReady && (
        <div className="rounded-lg border border-warning-200 bg-warning-50 p-6">
          <h3 className="font-semibold text-slate-900 mb-2">What needs to be done</h3>
          <ul className="space-y-2 mb-4">
            {incompleteSections.map((section) => (
              <li key={section.id} className="flex items-start gap-2 text-sm text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-warning-500 shrink-0 mt-1.5" aria-hidden="true" />
                <span><strong className="font-medium text-slate-700">{section.title}</strong> — {section.description}</span>
              </li>
            ))}
          </ul>
          <Link href={tradeCase.nextActionHref}>
            <Button>{tradeCase.nextAction}</Button>
          </Link>
        </div>
      )}

      {isReady && (
        <div className="rounded-lg border border-success-200 bg-success-50 p-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-100 mx-auto mb-3" aria-hidden="true">
            <svg className="h-5 w-5 text-success-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="font-semibold text-slate-900 mb-1">All sections are complete</p>
          <p className="text-sm text-slate-600">This trade case has been fully reviewed and is ready.</p>
        </div>
      )}

      {/* Trust disclaimer */}
      <div className="mt-8 p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
        <p>TradeReady AI provides decision-support information. Final customs and trade decisions should always be confirmed with the relevant authority or a qualified trade professional.</p>
      </div>

      <div className="mt-8 pt-6 border-t border-border flex justify-end">
        <Link href="/dashboard">
          <Button className="bg-blue hover:bg-blue-deep text-white shadow-sm">
            Finish & Return to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
