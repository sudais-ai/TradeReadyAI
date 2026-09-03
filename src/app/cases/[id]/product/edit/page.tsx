import { notFound } from "next/navigation";
import { getTradeCaseById } from "@/actions/trade-cases";
import { ProductEditForm } from "./ProductEditForm";

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tradeCase = await getTradeCaseById(id);

  if (!tradeCase) {
    notFound();
  }

  // Build initial form data from productFields
  const getField = (label: string) =>
    tradeCase.productFields.find(f => f.label === label)?.value ?? "";

  const initialData = {
    name: tradeCase.productName !== "Unknown Product" ? tradeCase.productName : "",
    description: getField("Product description"),
    category: getField("Category") || "",
    material: getField("Material"),
    packaging: getField("Packaging"),
    intendedUse: getField("Intended use"),
    origin: getField("Country of origin"),
    quantity: getField("Quantity"),
    weight: getField("Weight"),
  };

  return (
    <ProductEditForm
      tradeCaseId={id}
      productName={tradeCase.productName}
      initialData={initialData}
    />
  );
}
