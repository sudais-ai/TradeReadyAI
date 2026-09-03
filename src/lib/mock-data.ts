// ============================================================
// Centralized Mock Data for TradeReady AI
// ============================================================
// All mock data lives here so it can be replaced with real API
// calls later without touching individual components.
// ============================================================

export type SectionStatus = "Complete" | "In Progress" | "Needs Information" | "Not Started";
export type CaseStatus = "Draft" | "In Progress" | "Needs Information" | "Ready for Review" | "Reviewed";

export interface TradeCaseSection {
  id: string;
  title: string;
  status: SectionStatus;
  description: string;
  progress?: string; // e.g. "2 of 4"
  actionText: string;
  actionHref: string;
}

export interface MockDocument {
  id: string;
  name: string;
  type?: string;
  status: string;
  description?: string | null;
  size?: number | null;
  fileRef?: string | null;
  processingStatus?: string | null;
  embeddingStatus?: string | null;
  chunkCount?: number | null;
  evidenceCount?: number;
  uploadedAt?: string;
}

export interface MockProductField {
  label: string;
  value: string | null;
  helpText?: string;
}

export interface MockRequirement {
  id: string;
  title: string;
  status: "May be required" | "Needs review" | "Confirmed";
  source?: string;
}

export interface TradeCase {
  id: string;
  productName: string;
  productDescription: string;
  origin: string;
  destination: string;
  direction: "export" | "import";
  status: CaseStatus;
  shipmentDate: string;
  estimatedValue: string;
  lastUpdated: string;
  nextAction: string;
  nextActionHref: string;
  sections: TradeCaseSection[];
  documents: MockDocument[];
  productFields: MockProductField[];
  requirements: MockRequirement[];
}

// ============================================================
// Mock Trade Cases
// ============================================================

export const mockTradeCases: TradeCase[] = [
  {
    id: "TR-2026-081",
    productName: "Aseptic Mango Pulp",
    productDescription: "Processed mango pulp in aseptic packaging for food manufacturing use.",
    origin: "Pakistan",
    destination: "United Kingdom",
    direction: "export",
    status: "Needs Information",
    shipmentDate: "2026-10-15",
    estimatedValue: "$48,000",
    lastUpdated: "2026-08-23",
    nextAction: "Complete product details",
    nextActionHref: "/cases/TR-2026-081/product",
    sections: [
      {
        id: "trade-details",
        title: "Trade Details",
        status: "Complete",
        description: "All trade route details have been provided.",
        actionText: "View details",
        actionHref: "/cases/TR-2026-081",
      },
      {
        id: "product",
        title: "Product Information",
        status: "Needs Information",
        description: "Some product details are still missing.",
        actionText: "Complete details",
        actionHref: "/cases/TR-2026-081/product",
      },
      {
        id: "documents",
        title: "Documents",
        status: "In Progress",
        description: "Some documents may still be needed.",
        progress: "2 of 4",
        actionText: "Manage documents",
        actionHref: "/cases/TR-2026-081/documents",
      },
      {
        id: "requirements",
        title: "Requirements",
        status: "Not Started",
        description: "Trade requirements will appear after enough product information is available.",
        actionText: "View requirements",
        actionHref: "/cases/TR-2026-081/requirements",
      },
      {
        id: "review",
        title: "Review",
        status: "Not Started",
        description: "Complete the required sections first.",
        actionText: "View review",
        actionHref: "/cases/TR-2026-081/review",
      },
    ],
    documents: [
      { id: "doc-1", name: "Commercial Invoice", status: "Added", description: "Invoice for the shipment." },
      { id: "doc-2", name: "Product Specification", status: "Added", description: "Technical product details." },
      { id: "doc-3", name: "Packing List", status: "Missing", description: "Required for customs clearance." },
      { id: "doc-4", name: "Certificate of Origin", status: "Missing", description: "May be required for preferential tariff treatment." },
    ],
    productFields: [
      { label: "Product name", value: "Aseptic Mango Pulp" },
      { label: "Product description", value: "Processed mango pulp in aseptic packaging for food manufacturing use." },
      { label: "Material", value: "Mango fruit pulp" },
      { label: "Packaging", value: null, helpText: "We need this to check packaging-specific requirements." },
      { label: "Intended use", value: "Food manufacturing ingredient" },
      { label: "Country of origin", value: "Pakistan" },
      { label: "Quantity", value: "2,400 units (200kg drums)" },
      { label: "Weight", value: null, helpText: "Net weight helps determine applicable duties." },
    ],
    requirements: [],
  },
  {
    id: "TR-2026-079",
    productName: "Lithium Ion Batteries",
    productDescription: "Rechargeable lithium-ion battery cells for consumer electronics.",
    origin: "China",
    destination: "Germany",
    direction: "import",
    status: "In Progress",
    shipmentDate: "2026-11-01",
    estimatedValue: "$125,000",
    lastUpdated: "2026-08-22",
    nextAction: "View requirements",
    nextActionHref: "/cases/TR-2026-079/requirements",
    sections: [
      { id: "trade-details", title: "Trade Details", status: "Complete", description: "All trade route details have been provided.", actionText: "View details", actionHref: "/cases/TR-2026-079" },
      { id: "product", title: "Product Information", status: "Complete", description: "All required product details have been provided.", actionText: "View details", actionHref: "/cases/TR-2026-079/product" },
      { id: "documents", title: "Documents", status: "Complete", description: "All documents have been added.", progress: "4 of 4", actionText: "View documents", actionHref: "/cases/TR-2026-079/documents" },
      { id: "requirements", title: "Requirements", status: "In Progress", description: "Requirements are being reviewed.", actionText: "View requirements", actionHref: "/cases/TR-2026-079/requirements" },
      { id: "review", title: "Review", status: "Not Started", description: "Complete the required sections first.", actionText: "View review", actionHref: "/cases/TR-2026-079/review" },
    ],
    documents: [
      { id: "doc-1", name: "Commercial Invoice", status: "Added" },
      { id: "doc-2", name: "Battery Test Report (UN 38.3)", status: "Added" },
      { id: "doc-3", name: "Material Safety Data Sheet", status: "Added" },
      { id: "doc-4", name: "Packing List", status: "Added" },
    ],
    productFields: [
      { label: "Product name", value: "Lithium Ion Batteries" },
      { label: "Product description", value: "Rechargeable lithium-ion battery cells for consumer electronics." },
      { label: "Material", value: "Lithium cobalt oxide cathode" },
      { label: "Packaging", value: "Individual cells in fire-retardant packaging" },
      { label: "Intended use", value: "Consumer electronics power supply" },
      { label: "Country of origin", value: "China" },
      { label: "Quantity", value: "10,000 units" },
      { label: "Weight", value: "500 kg gross" },
    ],
    requirements: [],
  },
  {
    id: "TR-2026-075",
    productName: "Cotton T-Shirts (Men's)",
    productDescription: "100% cotton men's t-shirts for retail distribution.",
    origin: "India",
    destination: "United States",
    direction: "export",
    status: "Reviewed",
    shipmentDate: "2026-09-20",
    estimatedValue: "$32,000",
    lastUpdated: "2026-08-20",
    nextAction: "View dossier",
    nextActionHref: "/cases/TR-2026-075/review",
    sections: [
      { id: "trade-details", title: "Trade Details", status: "Complete", description: "All trade route details have been provided.", actionText: "View details", actionHref: "/cases/TR-2026-075" },
      { id: "product", title: "Product Information", status: "Complete", description: "All required product details have been provided.", actionText: "View details", actionHref: "/cases/TR-2026-075/product" },
      { id: "documents", title: "Documents", status: "Complete", description: "All documents have been added.", progress: "3 of 3", actionText: "View documents", actionHref: "/cases/TR-2026-075/documents" },
      { id: "requirements", title: "Requirements", status: "Complete", description: "All requirements have been reviewed.", actionText: "View requirements", actionHref: "/cases/TR-2026-075/requirements" },
      { id: "review", title: "Review", status: "Complete", description: "This case has been reviewed.", actionText: "View dossier", actionHref: "/cases/TR-2026-075/review" },
    ],
    documents: [
      { id: "doc-1", name: "Commercial Invoice", status: "Added" },
      { id: "doc-2", name: "Packing List", status: "Added" },
      { id: "doc-3", name: "Certificate of Origin", status: "Added" },
    ],
    productFields: [
      { label: "Product name", value: "Cotton T-Shirts (Men's)" },
      { label: "Product description", value: "100% cotton men's t-shirts for retail distribution." },
      { label: "Material", value: "100% cotton" },
      { label: "Packaging", value: "Poly-bagged, carton boxes" },
      { label: "Intended use", value: "Retail sale" },
      { label: "Country of origin", value: "India" },
      { label: "Quantity", value: "5,000 units" },
      { label: "Weight", value: "1,200 kg gross" },
    ],
    requirements: [],
  },
];

// Helper to find a case by ID
export function getTradeCaseById(id: string): TradeCase | undefined {
  return mockTradeCases.find((c) => c.id === id);
}
