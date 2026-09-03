import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { CaseCard } from "@/components/ui/CaseCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { getTradeCases } from "@/actions/trade-cases";
import { isSessionStale } from "@/lib/auth/session";
import { auth } from "@/lib/auth/route";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/dashboard");
  }
  const claimMs = session.user.passwordChangedAt;
  const claimDate = typeof claimMs === "number" ? new Date(claimMs) : null;
  if (await isSessionStale(session.user.id, claimDate)) {
    redirect("/auth/signin?callbackUrl=/dashboard&reason=stale");
  }

  const tradeCases = await getTradeCases();
  const hasCases = tradeCases.length > 0;
  const casesNeedingAttention = tradeCases.filter(
    (c) => c.status === "Needs Information" || c.status === "In Progress"
  );
  const completedCases = tradeCases.filter(
    (c) => c.status === "Reviewed" || c.status === "Ready for Review"
  );
  const draftCases = tradeCases.filter((c) => c.status === "Draft");

  const firstName = session.user.name?.split(" ")[0] || "";

  return (
    <div className="pb-20">
      <PageHeader
        title={`${getGreeting()}${firstName ? `, ${firstName}` : ""}`}
        description={
          hasCases
            ? `You have ${tradeCases.length} trade ${tradeCases.length === 1 ? "case" : "cases"}${casesNeedingAttention.length > 0 ? ` · ${casesNeedingAttention.length} ${casesNeedingAttention.length === 1 ? "needs" : "need"} attention` : ""}`
            : "Get started by creating your first trade case."
        }
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

      {hasCases && (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            <MetricCard
              label="Total Cases"
              value={tradeCases.length}
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              }
            />
            <MetricCard
              label="Needs Attention"
              value={casesNeedingAttention.length}
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              }
            />
            <MetricCard
              label="Completed"
              value={completedCases.length}
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <MetricCard
              label="Drafts"
              value={draftCases.length}
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              }
            />
          </div>

          {/* Section Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-xl font-bold text-ink">Your Trade Cases</h2>
            <div className="flex items-center gap-2">
              <Link href="/dashboard/activity">
                <Button variant="ghost" size="sm" className="text-muted hover:text-ink">
                  <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Activity
                </Button>
              </Link>
              <Link href="/dashboard/queue">
                <Button variant="ghost" size="sm" className="text-muted hover:text-ink">
                  <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                  </svg>
                  Queue
                </Button>
              </Link>
              <Link href="/dashboard/trash">
                <Button variant="ghost" size="sm" className="text-muted hover:text-ink">
                  <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  Trash
                </Button>
              </Link>
            </div>
          </div>

          {/* Case Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tradeCases.map((c) => (
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
        </>
      )}

      {!hasCases && (
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
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Your First Case
              </Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
