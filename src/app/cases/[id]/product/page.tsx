import { notFound } from "next/navigation";
import Link from "next/link";
import { getTradeCaseById } from "@/actions/trade-cases";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tradeCase = await getTradeCaseById(id);

  if (!tradeCase) {
    notFound();
  }

  const filledCount = tradeCase.productFields.filter((f) => f.value !== null).length;
  const totalCount = tradeCase.productFields.length;
  const missingCount = totalCount - filledCount;

  return (
    <div className="pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: tradeCase.productName, href: `/cases/${tradeCase.id}` },
          { label: "Product Information" },
        ]}
      />

      <PageHeader
        title="Product Information"
        description={
          <>
            {filledCount} of {totalCount} details provided
            {missingCount > 0 && <> · <span className="text-warning-600 font-medium">{missingCount} still needed</span></>}
          </>
        }
        actions={
          <div className="flex items-center gap-3 shrink-0">
            <Link href={`/cases/${tradeCase.id}/product/edit`}>
              <Button size="sm">Edit Product</Button>
            </Link>
            <Link href={`/cases/${tradeCase.id}`}>
              <Button variant="ghost" size="sm">← Back to Case</Button>
            </Link>
          </div>
        }
      />

      {missingCount > 0 && (
        <div className="mb-6 p-4 rounded-lg bg-warning-50 border border-warning-100 text-sm text-slate-600">
          <div className="flex gap-3 items-start">
            <svg className="w-5 h-5 text-warning-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium text-slate-700 mb-0.5">Some details are still needed</p>
              <p>Providing the missing information helps us check the relevant trade requirements more accurately.</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {tradeCase.productFields.map((field, index) => {
          const isMissing = field.value === null;
          return (
            <div
              key={field.label}
              className={`flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-6 p-4 ${index !== tradeCase.productFields.length - 1 ? "border-b border-border" : ""}`}
            >
              <div className="sm:w-44 shrink-0">
                <span className="text-sm font-medium text-slate-700">{field.label}</span>
              </div>
              <div className="flex-1 min-w-0">
                {isMissing ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                    <span className="text-sm text-slate-400 italic">Not yet provided</span>
                    {field.helpText && (
                      <span className="text-xs text-slate-400">— {field.helpText}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-slate-900">{field.value}</span>
                )}
              </div>
              <div className="shrink-0">
                {isMissing ? (
                  <Badge variant="warning">Needed</Badge>
                ) : (
                  <Badge variant="success">Provided</Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
