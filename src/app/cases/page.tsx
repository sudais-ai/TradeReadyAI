import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { CaseCard } from "@/components/ui/CaseCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { getTradeCases } from "@/actions/trade-cases";
import { isSessionStale } from "@/lib/auth/session";
import { auth } from "@/lib/auth/route";

export default async function CasesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/cases");
  }
  
  const claimMs = session.user.passwordChangedAt;
  const claimDate = typeof claimMs === "number" ? new Date(claimMs) : null;
  if (await isSessionStale(session.user.id, claimDate)) {
    redirect("/auth/signin?callbackUrl=/cases&reason=stale");
  }

  const tradeCases = await getTradeCases();
  const hasCases = tradeCases.length > 0;
  
  const draftCases = tradeCases.filter(c => c.status === "Draft");
  const inProgressCases = tradeCases.filter(c => c.status === "In Progress" || c.status === "Needs Information");
  const reviewCases = tradeCases.filter(c => c.status === "Ready for Review" || c.status === "Reviewed");

  return (
    <div className="pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Trade Cases" },
        ]}
      />

      <PageHeader 
        title="Trade Cases" 
        description="Manage your product classifications, documentation, and compliance reviews."
        actions={
          <Link href="/cases/new">
            <Button className="bg-blue hover:bg-blue-deep text-white shadow-sm">
              <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Trade Case
            </Button>
          </Link>
        }
      />
      
      {!hasCases ? (
        <div className="mt-8">
          <EmptyState 
            title="No trade cases yet" 
            description="Create your first trade case to start checking product requirements, documents, and trade information."
            icon={
              <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            }
            action={
              <Link href="/cases/new">
                <Button className="bg-blue hover:bg-blue-deep text-white shadow-sm px-6">
                  Create Your First Case
                </Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="space-y-12">
          {inProgressCases.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-bold text-ink mb-4">Action Needed</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {inProgressCases.map((c) => (
                  <CaseCard
                    key={c.id}
                    id={c.id}
                    productName={c.productName}
                    origin={c.origin}
                    destination={c.destination}
                    status={c.status}
                    lastUpdated={c.lastUpdated}
                    actionText={c.nextAction}
                    actionHref={`/cases/${c.id}`}
                  />
                ))}
              </div>
            </section>
          )}

          {draftCases.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-bold text-ink mb-4">Drafts</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {draftCases.map((c) => (
                  <CaseCard
                    key={c.id}
                    id={c.id}
                    productName={c.productName}
                    origin={c.origin}
                    destination={c.destination}
                    status={c.status}
                    lastUpdated={c.lastUpdated}
                    actionText={c.nextAction}
                    actionHref={`/cases/${c.id}`}
                  />
                ))}
              </div>
            </section>
          )}

          {reviewCases.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-bold text-ink mb-4">Review</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reviewCases.map((c) => (
                  <CaseCard
                    key={c.id}
                    id={c.id}
                    productName={c.productName}
                    origin={c.origin}
                    destination={c.destination}
                    status={c.status}
                    lastUpdated={c.lastUpdated}
                    actionText={c.nextAction}
                    actionHref={`/cases/${c.id}`}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
