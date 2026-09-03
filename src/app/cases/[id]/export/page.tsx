import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { generateExportData } from "@/actions/export";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId } from "@/lib/auth/session";

export default async function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Security: must be signed in.
  const userId = await getCurrentUserId();
  if (!userId) {
    notFound();
  }

  // Verify ownership of the case.
  // Phase 15: the original code ran the ownership check and the export
  // data generation sequentially. We tested Promise.all in parallel
  // but the SQLite connection serializes both queries anyway, so the
  // net effect is identical or slightly worse. Keep them sequential;
  // the bigger win came from trimming the include on the export query.
  const tradeCase = await prisma.tradeCase.findFirst({
    where: { id, userId },
    include: { product: true },
  });

  if (!tradeCase) {
    notFound();
  }

  const result = await generateExportData(id);

  if (!result.success || !result.data) {
    return (
      <div className="pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: tradeCase.product?.name || "Unknown", href: `/cases/${id}` },
            { label: "Export" },
          ]}
        />
        <div className="mt-8 p-6 rounded-lg border border-error-200 bg-error-50">
          <h2 className="font-semibold text-error-700 text-lg mb-2">Export Failed</h2>
          <p className="text-sm text-error-600">{result.error || "Could not generate export data."}</p>
          <Link href={`/cases/${id}`} className="mt-4 inline-block">
            <Button variant="outline" size="sm">← Back to Case</Button>
          </Link>
        </div>
      </div>
    );
  }

  const data = result.data;

  const evaluationSummary = {
    total: data.requirements.length,
    satisfied: data.requirements.filter((r) => r.evaluation?.status === "SATISFIED").length,
    notSatisfied: data.requirements.filter((r) => r.evaluation?.status === "NOT_SATISFIED").length,
    insufficient: data.requirements.filter((r) => r.evaluation?.status === "INSUFFICIENT_EVIDENCE").length,
    pending: data.requirements.filter((r) => !r.evaluation || r.evaluation.status === "PENDING" || r.evaluation.status === "PROCESSING").length,
    failed: data.requirements.filter((r) => r.evaluation?.status === "FAILED").length,
  };

  const documentSummary = {
    total: data.documents.length,
    ready: data.documents.filter((d) => d.processingStatus === "READY" && d.embeddingStatus === "READY").length,
    processing: data.documents.filter((d) => d.processingStatus === "PENDING" || d.processingStatus === "PROCESSING").length,
    failed: data.documents.filter((d) => d.processingStatus === "FAILED" || d.embeddingStatus === "FAILED").length,
  };

  return (
    <div className="pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: tradeCase.product?.name || "Unknown", href: `/cases/${id}` },
          { label: "Export Report" },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Export Report</h1>
          <p className="text-sm text-slate-500 mt-1">
            Trade compliance report for {tradeCase.product?.name || "Unknown Product"}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href={`/cases/${id}`}>
            <Button variant="outline" size="sm">← Back to Case</Button>
          </Link>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const content = `
TradeReady AI - Trade Compliance Report
========================================

TRADE CASE DETAILS
------------------
Case reference: ${data.tradeCase.id}
Direction:      ${data.tradeCase.direction}
Origin:         ${data.tradeCase.origin}
Destination:    ${data.tradeCase.destination}
Shipment Date:  ${data.tradeCase.shipmentDate || "Not specified"}
Estimated Value: ${data.tradeCase.estimatedValue || "Not specified"}
Status:         ${data.tradeCase.status}

PRODUCT INFORMATION
-------------------
${data.product ? Object.entries(data.product).map(([k, v]) => v ? `${k}: ${v}` : "").filter(Boolean).join("\n") : "No product information"}

DOCUMENTS (${documentSummary.total})
-------------------
${data.documents.map((d, i) => `${i + 1}. ${d.name} (${d.type || "No type"}) - ${d.status}`).join("\n") || "No documents uploaded"}

REQUIREMENTS & EVALUATIONS (${evaluationSummary.total})
-------------------
${data.requirements.map((r, i) => `${i + 1}. ${r.title} - ${r.status}${r.evaluation ? ` | Eval: ${r.evaluation.status} (${(r.evaluation.confidence! * 100).toFixed(0)}%)` : " | Not evaluated"}`).join("\n") || "No requirements"}

Generated: ${new Date(data.generatedAt).toLocaleString()}
========================================
DISCLAIMER: TradeReady AI provides decision-support information only.
`
              const blob = new Blob([content], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `tradeready-${id}-report.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download Report
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {/* Case Overview */}
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-semibold text-slate-900 text-sm mb-3">Case Overview</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Route</span>
              <span className="font-medium text-slate-900">{data.tradeCase.origin} → {data.tradeCase.destination}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Direction</span>
              <span className="font-medium text-slate-900 capitalize">{data.tradeCase.direction}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Shipment</span>
              <span className="font-medium text-slate-900">{data.tradeCase.shipmentDate || "TBD"}</span>
            </div>
          </div>
        </div>

        {/* Documents Summary */}
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-semibold text-slate-900 text-sm mb-3">Documents</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Total</span>
              <span className="font-medium text-slate-900">{documentSummary.total}</span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-slate-500">Ready</span>
              <Badge variant="success">{documentSummary.ready}</Badge>
            </div>
            {documentSummary.failed > 0 && (
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500">Failed</span>
                <Badge variant="error">{documentSummary.failed}</Badge>
              </div>
            )}
          </div>
        </div>

        {/* Requirements Summary */}
        <div className="rounded-lg border border-border bg-surface p-5 sm:col-span-2">
          <h2 className="font-semibold text-slate-900 text-sm mb-3">Requirements Evaluation</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="flex justify-between sm:flex-col sm:justify-start gap-1">
              <span className="text-slate-500">Total</span>
              <span className="font-medium text-slate-900">{evaluationSummary.total}</span>
            </div>
            {evaluationSummary.satisfied > 0 && (
              <div className="flex justify-between sm:flex-col sm:justify-start gap-1">
                <span className="text-slate-500">Satisfied</span>
                <Badge variant="success">{evaluationSummary.satisfied}</Badge>
              </div>
            )}
            {evaluationSummary.notSatisfied > 0 && (
              <div className="flex justify-between sm:flex-col sm:justify-start gap-1">
                <span className="text-slate-500">Not Satisfied</span>
                <Badge variant="error">{evaluationSummary.notSatisfied}</Badge>
              </div>
            )}
            {evaluationSummary.insufficient > 0 && (
              <div className="flex justify-between sm:flex-col sm:justify-start gap-1">
                <span className="text-slate-500">Insufficient</span>
                <Badge variant="warning">{evaluationSummary.insufficient}</Badge>
              </div>
            )}
            {evaluationSummary.pending > 0 && (
              <div className="flex justify-between sm:flex-col sm:justify-start gap-1">
                <span className="text-slate-500">Pending</span>
                <span className="font-medium text-slate-900">{evaluationSummary.pending}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full Report */}
      <div className="rounded-lg border border-border bg-surface">
        <div className="p-5 border-b border-border">
          <h2 className="font-semibold text-slate-900 text-sm">Full Report</h2>
        </div>

        {/* Trade Case Details */}
        <div className="p-5 border-b border-border">
          <h3 className="font-semibold text-slate-900 text-sm mb-3">Trade Case Details</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-slate-500 block mb-0.5 text-xs">Case reference</span>
              <span className="font-medium text-slate-900 text-xs break-all">{data.tradeCase.id}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5 text-xs">Direction</span>
              <span className="font-medium text-slate-900 capitalize">{data.tradeCase.direction}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5 text-xs">Origin</span>
              <span className="font-medium text-slate-900">{data.tradeCase.origin}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5 text-xs">Destination</span>
              <span className="font-medium text-slate-900">{data.tradeCase.destination}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5 text-xs">Shipment Date</span>
              <span className="font-medium text-slate-900">{data.tradeCase.shipmentDate || "Not specified"}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5 text-xs">Estimated Value</span>
              <span className="font-medium text-slate-900">{data.tradeCase.estimatedValue || "Not specified"}</span>
            </div>
          </div>
        </div>

        {/* Product Information */}
        <div className="p-5 border-b border-border">
          <h3 className="font-semibold text-slate-900 text-sm mb-3">Product Information</h3>
          {data.product ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div className="col-span-2 sm:col-span-1">
                <span className="text-slate-500 block mb-0.5 text-xs">Name</span>
                <span className="font-medium text-slate-900">{data.product.name}</span>
              </div>
              {data.product.description && (
                <div className="col-span-2">
                  <span className="text-slate-500 block mb-0.5 text-xs">Description</span>
                  <span className="text-slate-700">{data.product.description}</span>
                </div>
              )}
              {data.product.category && (
                <div>
                  <span className="text-slate-500 block mb-0.5 text-xs">Category</span>
                  <span className="font-medium text-slate-900">{data.product.category}</span>
                </div>
              )}
              {data.product.material && (
                <div>
                  <span className="text-slate-500 block mb-0.5 text-xs">Material</span>
                  <span className="font-medium text-slate-900">{data.product.material}</span>
                </div>
              )}
              {data.product.packaging && (
                <div>
                  <span className="text-slate-500 block mb-0.5 text-xs">Packaging</span>
                  <span className="font-medium text-slate-900">{data.product.packaging}</span>
                </div>
              )}
              {data.product.intendedUse && (
                <div className="col-span-2">
                  <span className="text-slate-500 block mb-0.5 text-xs">Intended Use</span>
                  <span className="font-medium text-slate-900">{data.product.intendedUse}</span>
                </div>
              )}
              {data.product.origin && (
                <div>
                  <span className="text-slate-500 block mb-0.5 text-xs">Origin</span>
                  <span className="font-medium text-slate-900">{data.product.origin}</span>
                </div>
              )}
              {data.product.quantity && (
                <div>
                  <span className="text-slate-500 block mb-0.5 text-xs">Quantity</span>
                  <span className="font-medium text-slate-900">{data.product.quantity}</span>
                </div>
              )}
              {data.product.weight && (
                <div>
                  <span className="text-slate-500 block mb-0.5 text-xs">Weight</span>
                  <span className="font-medium text-slate-900">{data.product.weight}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No product information provided.</p>
          )}
        </div>

        {/* Documents List */}
        <div className="p-5 border-b border-border">
          <h3 className="font-semibold text-slate-900 text-sm mb-3">
            Documents ({data.documents.length})
          </h3>
          {data.documents.length === 0 ? (
            <p className="text-sm text-slate-500">No documents uploaded.</p>
          ) : (
            <div className="space-y-2">
              {data.documents.map((doc, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-md border border-slate-200 bg-slate-50">
                  <span className="font-medium text-slate-900 text-sm flex-1">{doc.name}</span>
                  <div className="flex gap-2 flex-wrap">
                    {doc.type && <Badge variant="outline">{doc.type}</Badge>}
                    <Badge variant={doc.status === "Added" ? "success" : "default"}>{doc.status}</Badge>
                    {doc.processingStatus === "READY" && doc.embeddingStatus === "READY" && (
                      <Badge variant="success">Ready</Badge>
                    )}
                    {doc.processingStatus === "FAILED" || doc.embeddingStatus === "FAILED" ? (
                      <Badge variant="error">Failed</Badge>
                    ) : doc.processingStatus === "PENDING" || doc.processingStatus === "PROCESSING" ? (
                      <Badge variant="warning">Processing</Badge>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Requirements & Evaluations */}
        <div className="p-5">
          <h3 className="font-semibold text-slate-900 text-sm mb-3">
            Requirements & Evaluations ({data.requirements.length})
          </h3>
          {data.requirements.length === 0 ? (
            <p className="text-sm text-slate-500">No requirements added.</p>
          ) : (
            <div className="space-y-4">
              {data.requirements.map((req, i) => (
                <div key={i} className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-medium text-slate-900 text-sm">{req.title}</h4>
                    <Badge variant={req.status === "Confirmed" ? "success" : req.status === "Needs review" ? "warning" : "default"}>
                      {req.status}
                    </Badge>
                    {req.source && (
                      <span className="text-xs text-slate-500">Source: {req.source}</span>
                    )}
                  </div>

                  {req.evaluation ? (
                    <div className="mt-3 pl-3 border-l-2 border-slate-300">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-slate-700">Evaluation:</span>
                        <Badge
                          variant={
                            req.evaluation.status === "SATISFIED"
                              ? "success"
                              : req.evaluation.status === "NOT_SATISFIED"
                              ? "error"
                              : req.evaluation.status === "INSUFFICIENT_EVIDENCE"
                              ? "warning"
                              : "default"
                          }
                        >
                          {req.evaluation.status.replace(/_/g, " ")}
                        </Badge>
                        {req.evaluation.confidence !== null && (
                          <span className="text-xs text-slate-500">
                            ({(req.evaluation.confidence * 100).toFixed(0)}% confidence)
                          </span>
                        )}
                      </div>
                      {req.evaluation.summary && (
                        <p className="text-xs text-slate-600 mb-2">{req.evaluation.summary}</p>
                      )}

                      {req.evaluation.evidences.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-slate-700 mb-1">
                            Evidence ({req.evaluation.evidences.length} sources):
                          </p>
                          <div className="space-y-2">
                            {req.evaluation.evidences.map((ev, j) => (
                              <div key={j} className="text-xs bg-white p-2 rounded border border-slate-200">
                                <p className="font-medium text-slate-700">From: {ev.documentName}</p>
                                {ev.reason && (
                                  <p className="text-slate-600 mt-0.5">Reason: {ev.reason}</p>
                                )}
                                {ev.contentSnapshot && (
                                  <p className="text-slate-500 mt-0.5 font-mono bg-slate-50 p-1 rounded">
                                    {ev.contentSnapshot.length > 150
                                      ? ev.contentSnapshot.slice(0, 150) + "..."
                                      : ev.contentSnapshot}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 mt-2">Not yet evaluated</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mt-8 p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
        <p className="font-medium text-slate-700 mb-1">Disclaimer</p>
        <p>TradeReady AI provides decision-support information only. Final customs and trade decisions should always be confirmed with the relevant authority or a qualified trade professional.</p>
      </div>
    </div>
  );
}
