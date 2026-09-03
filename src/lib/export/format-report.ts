/**
 * Pure helper for rendering the export report as plain text. Lives outside of
 * any "use server" file so it can be a regular function (Server Action files
 * require every export to be an async function).
 */
export interface ExportData {
  tradeCase: {
    id: string;
    direction: string;
    origin: string;
    destination: string;
    shipmentDate: string | null;
    estimatedValue: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  product: {
    name: string;
    description: string | null;
    category: string | null;
    material: string | null;
    packaging: string | null;
    intendedUse: string | null;
    origin: string | null;
    quantity: string | null;
    weight: string | null;
  } | null;
  documents: {
    name: string;
    type: string | null;
    status: string;
    processingStatus: string | null;
    embeddingStatus: string | null;
    chunkCount: number;
  }[];
  requirements: {
    title: string;
    status: string;
    source: string | null;
    evaluation: {
      status: string;
      summary: string | null;
      confidence: number | null;
      evidences: {
        reason: string | null;
        contentSnapshot: string | null;
        documentName: string;
      }[];
    } | null;
  }[];
  generatedAt: string;
}

export function formatExportReport(data: ExportData): string {
  const lines: string[] = [];

  // Header
  lines.push("=".repeat(70));
  lines.push("TRADEREADY AI — TRADE COMPLIANCE REPORT");
  lines.push("=".repeat(70));
  lines.push("");

  // Trade Case Details
  lines.push("TRADE CASE DETAILS");
  lines.push("-".repeat(40));
  lines.push(`Case ID:        ${data.tradeCase.id}`);
  lines.push(`Direction:      ${data.tradeCase.direction}`);
  lines.push(`Origin:         ${data.tradeCase.origin}`);
  lines.push(`Destination:    ${data.tradeCase.destination}`);
  lines.push(`Shipment Date:  ${data.tradeCase.shipmentDate || "Not specified"}`);
  lines.push(`Estimated Value: ${data.tradeCase.estimatedValue || "Not specified"}`);
  lines.push(`Status:         ${data.tradeCase.status}`);
  lines.push(`Created:        ${new Date(data.tradeCase.createdAt).toLocaleDateString()}`);
  lines.push(`Last Updated:   ${new Date(data.tradeCase.updatedAt).toLocaleDateString()}`);
  lines.push("");

  // Product Information
  lines.push("PRODUCT INFORMATION");
  lines.push("-".repeat(40));
  if (data.product) {
    lines.push(`Product Name:   ${data.product.name}`);
    if (data.product.description) lines.push(`Description:    ${data.product.description}`);
    if (data.product.category) lines.push(`Category:       ${data.product.category}`);
    if (data.product.material) lines.push(`Material:       ${data.product.material}`);
    if (data.product.packaging) lines.push(`Packaging:      ${data.product.packaging}`);
    if (data.product.intendedUse) lines.push(`Intended Use:   ${data.product.intendedUse}`);
    if (data.product.origin) lines.push(`Origin:         ${data.product.origin}`);
    if (data.product.quantity) lines.push(`Quantity:       ${data.product.quantity}`);
    if (data.product.weight) lines.push(`Weight:         ${data.product.weight}`);
  } else {
    lines.push("No product information provided.");
  }
  lines.push("");

  // Documents
  lines.push("DOCUMENTS");
  lines.push("-".repeat(40));
  if (data.documents.length === 0) {
    lines.push("No documents uploaded.");
  } else {
    data.documents.forEach((doc, i) => {
      lines.push(`${i + 1}. ${doc.name}`);
      lines.push(`   Type: ${doc.type || "Not specified"}`);
      lines.push(`   Status: ${doc.status}`);
      if (doc.processingStatus) lines.push(`   Processing: ${doc.processingStatus}`);
      if (doc.chunkCount > 0) lines.push(`   Sections: ${doc.chunkCount} prepared`);
      lines.push("");
    });
  }

  // Requirements & Evaluations
  lines.push("REQUIREMENTS & EVALUATIONS");
  lines.push("-".repeat(40));
  if (data.requirements.length === 0) {
    lines.push("No requirements added.");
  } else {
    data.requirements.forEach((req, i) => {
      lines.push(`${i + 1}. ${req.title}`);
      lines.push(`   Status: ${req.status}`);
      if (req.source) lines.push(`   Source: ${req.source}`);

      if (req.evaluation) {
        lines.push(`   Evaluation: ${req.evaluation.status}`);
        if (req.evaluation.summary) lines.push(`   Summary: ${req.evaluation.summary}`);
        if (req.evaluation.confidence !== null) {
          lines.push(`   Confidence: ${(req.evaluation.confidence * 100).toFixed(0)}%`);
        }

        if (req.evaluation.evidences.length > 0) {
          lines.push(`   Evidence (${req.evaluation.evidences.length} sources):`);
          req.evaluation.evidences.forEach((ev, j) => {
            lines.push(`     ${j + 1}. From: ${ev.documentName}`);
            if (ev.reason) lines.push(`        Reason: ${ev.reason}`);
            if (ev.contentSnapshot) {
              const snippet = ev.contentSnapshot.length > 100 ? ev.contentSnapshot.slice(0, 100) + "..." : ev.contentSnapshot;
              lines.push(`        Snippet: "${snippet}"`);
            }
          });
        }
      } else {
        lines.push("   Evaluation: Not yet evaluated");
      }
      lines.push("");
    });
  }

  // Footer
  lines.push("=".repeat(70));
  lines.push(`Report generated: ${new Date(data.generatedAt).toLocaleString()}`);
  lines.push("");
  lines.push("DISCLAIMER: TradeReady AI provides decision-support information only.");
  lines.push("Final customs and trade decisions should always be confirmed with the");
  lines.push("relevant authority or a qualified trade professional.");
  lines.push("=".repeat(70));

  return lines.join("\n");
}
