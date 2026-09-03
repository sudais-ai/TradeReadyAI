import { notFound } from "next/navigation";
import Link from "next/link";
import { getTradeCaseById } from "@/actions/trade-cases";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { DocumentsManager } from "./DocumentsManager";

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tradeCase = await getTradeCaseById(id);

  if (!tradeCase) {
    notFound();
  }

  return (
    <div className="pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: tradeCase.productName, href: `/cases/${tradeCase.id}` },
          { label: "Documents" },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Documents</h1>
          <p className="text-sm text-ink-soft mt-1">
            Track the documents associated with this trade case.
          </p>
        </div>
        <Link href={`/cases/${tradeCase.id}`}>
          <Button variant="ghost" size="sm">← Back to Case</Button>
        </Link>
      </div>

      <DocumentsManager
        tradeCaseId={tradeCase.id}
        initialDocuments={tradeCase.documents}
      />

      <div className="mt-8 pt-6 border-t border-border flex justify-end">
        <Link href={`/cases/${tradeCase.id}/requirements`}>
          <Button className="bg-blue hover:bg-blue-deep text-white shadow-sm">
            Continue to Requirements →
          </Button>
        </Link>
      </div>
    </div>
  );
}
