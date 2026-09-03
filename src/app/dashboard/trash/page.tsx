import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth/session";
import { getDeletedTradeCases, restoreTradeCase } from "@/actions/trade-cases";
import { getDeletedDocuments, restoreDocument } from "@/actions/documents";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrashActions } from "./TrashActions";

function formatDate(input: string | null): string {
  if (!input) return "Unknown";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString();
}

export default async function TrashPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/auth/signin?callbackUrl=/dashboard/trash");
  }

  const [cases, docs] = await Promise.all([
    getDeletedTradeCases(),
    getDeletedDocuments(),
  ]);

  return (
    <div className="pb-20">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Trash" },
        ]}
      />

      <PageHeader
        title="Trash"
        description="Restore deleted trade cases and documents. Items here are kept for recovery and never appear in your normal lists."
      />

      <section className="mb-10">
        <h2 className="font-display text-lg font-bold text-ink mb-3">
          Deleted Trade Cases
        </h2>
        {cases.length === 0 ? (
          <EmptyState
            title="No deleted cases"
            description="Cases you delete will appear here for restoration."
          />
        ) : (
          <div className="space-y-3">
            {cases.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="font-display font-medium text-ink text-lg">
                      {c.productName}{" "}
                      <span className="text-sm font-sans text-ink-soft">
                        ({c.origin} → {c.destination})
                      </span>
                    </p>
                    <p className="text-xs text-muted mt-1.5 uppercase tracking-wide">
                      Deleted {formatDate(c.deletedAt)} · {c.documentCount} document(s)
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <TrashActions
                      kind="case"
                      id={c.id}
                      restoreFn={restoreTradeCase}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-bold text-ink mb-3">
          Deleted Documents
        </h2>
        {docs.length === 0 ? (
          <EmptyState
            title="No deleted documents"
            description="Documents you delete will appear here for restoration."
          />
        ) : (
          <div className="space-y-3">
            {docs.map((d) => (
              <Card key={d.id}>
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="font-display font-medium text-ink text-lg">{d.name}</p>
                    <p className="text-xs text-muted mt-1.5 uppercase tracking-wide">
                      From case:{" "}
                      <Link
                        className="text-blue hover:text-blue-deep font-semibold"
                        href={
                          d.caseDeleted
                            ? "/dashboard/trash"
                            : `/cases/${d.tradeCaseId}`
                        }
                      >
                        {d.caseName}
                      </Link>{" "}
                      · Deleted {formatDate(d.deletedAt)}
                      {d.caseDeleted ? " (case also deleted)" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <TrashActions
                      kind="document"
                      id={d.id}
                      tradeCaseId={d.tradeCaseId}
                      restoreFn={restoreDocument}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="mt-10">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm">← Back to dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
