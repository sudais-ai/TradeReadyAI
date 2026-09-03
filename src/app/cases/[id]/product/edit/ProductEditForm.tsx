"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { updateProduct } from "@/actions/products";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

interface ProductEditFormProps {
  tradeCaseId: string;
  productName: string;
  initialData: {
    name: string;
    description: string;
    category: string;
    material: string;
    packaging: string;
    intendedUse: string;
    origin: string;
    quantity: string;
    weight: string;
  };
}

export function ProductEditForm({ tradeCaseId, productName, initialData }: ProductEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [formData, setFormData] = React.useState(initialData);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => { const n = { ...prev }; delete n[name]; return n; });
    }
    if (success) setSuccess(false);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Product name is required.";
    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientErrors = validate();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await updateProduct(tradeCaseId, formData);
      if (result.success) {
        setSuccess(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setError(result.error || "We couldn't save these product details. Please try again.");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="pb-20 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: productName, href: `/cases/${tradeCaseId}` },
          { label: "Product Information", href: `/cases/${tradeCaseId}/product` },
          { label: "Edit" },
        ]}
      />

      <PageHeader
        title="Edit Product Information"
        description="Update the details about the product in this trade case."
      />

      {success && (
        <div
          className="mb-6 p-4 bg-success-50 border border-success-200 text-success-800 rounded-md text-sm flex items-center gap-3"
          role="status"
          aria-live="polite"
        >
          <svg className="w-5 h-5 text-success-600 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
          </svg>
          <span>Product details saved successfully.</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-error-50 border border-error-200 text-error-900 rounded-md text-sm" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">
                Product name <span className="text-error-500" aria-hidden="true">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Aseptic Mango Pulp"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "name-error" : undefined}
                error={!!errors.name}
              />
              {errors.name && <p id="name-error" className="text-sm text-error-600" role="alert">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                placeholder="Describe the product and its intended use in trade."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="category">Category <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Input
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  placeholder="e.g. Agriculture & Food"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="origin">Country of origin <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Input
                  id="origin"
                  name="origin"
                  value={formData.origin}
                  onChange={handleChange}
                  placeholder="e.g. Pakistan"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Additional Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="material">Material <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Input
                  id="material"
                  name="material"
                  value={formData.material}
                  onChange={handleChange}
                  placeholder="e.g. Mango fruit pulp"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="packaging">Packaging <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Input
                  id="packaging"
                  name="packaging"
                  value={formData.packaging}
                  onChange={handleChange}
                  placeholder="e.g. 200kg aseptic drums"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="intendedUse">Intended use <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Input
                id="intendedUse"
                name="intendedUse"
                value={formData.intendedUse}
                onChange={handleChange}
                placeholder="e.g. Food manufacturing ingredient"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Input
                  id="quantity"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  placeholder="e.g. 2,400 units"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight">Weight <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Input
                  id="weight"
                  name="weight"
                  value={formData.weight}
                  onChange={handleChange}
                  placeholder="e.g. 480 kg gross"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t border-border pt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push(`/cases/${tradeCaseId}/product`)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isLoading}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
