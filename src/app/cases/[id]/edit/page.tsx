"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import { getTradeCaseById, updateTradeCase } from "@/actions/trade-cases";
import { PageHeader } from "@/components/ui/PageHeader";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Radio } from "@/components/ui/Radio";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

const STEPS = [
  { id: "trade-details", title: "Trade Details" },
  { id: "product", title: "Product" },
  { id: "review", title: "Review & Save" },
];

const STEP_DESCRIPTIONS = [
  "Update the trade route details.",
  "Update the product information.",
  "Review your changes before saving.",
];

export default function EditTradeCasePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  
  const [isFetching, setIsFetching] = React.useState(true);
  const [currentStep, setCurrentStep] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  
  const [formData, setFormData] = React.useState({
    direction: "export",
    origin: "",
    destination: "",
    date: "",
    value: "",
    productName: "",
    category: "",
    description: "",
  });

  // Fetch initial data
  React.useEffect(() => {
    let isMounted = true;
    
    async function loadData() {
      try {
        const caseData = await getTradeCaseById(id);
        if (caseData && isMounted) {
          setFormData({
            direction: caseData.direction.toLowerCase(),
            origin: caseData.origin,
            destination: caseData.destination,
            date: caseData.shipmentDate !== "Unknown" ? caseData.shipmentDate : "",
            value: caseData.estimatedValue !== "Unknown" ? caseData.estimatedValue : "",
            productName: caseData.productName !== "Unknown Product" ? caseData.productName : "",
            category: caseData.productFields.find(f => f.label === "Category")?.value || "",
            description: caseData.productDescription !== "No description provided." ? caseData.productDescription : "",
          });
        }
      } catch (e) {
        console.error("Failed to load trade case", e);
      } finally {
        if (isMounted) setIsFetching(false);
      }
    }
    
    loadData();
    return () => { isMounted = false; };
  }, [id]);

  const handleNext = () => {
    const newErrors: Record<string, string> = {};
    
    if (currentStep === 0) {
      if (!formData.origin.trim()) newErrors.origin = "Please enter the origin country.";
      if (!formData.destination.trim()) newErrors.destination = "Please enter the destination country.";
    } else if (currentStep === 1) {
      if (!formData.productName.trim()) newErrors.productName = "Please enter the product name.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      // Final submit
      setIsLoading(true);
      setSubmitError(null);
      
      updateTradeCase(id, formData)
        .then((result) => {
          if (result.success) {
            router.push(`/cases/${id}`);
          } else {
            setSubmitError(result.error || "Failed to save changes.");
            setIsLoading(false);
          }
        })
        .catch((e) => {
          console.error(e);
          setSubmitError("An unexpected error occurred.");
          setIsLoading(false);
        });
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      setErrors({});
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const getNextButtonText = () => {
    if (currentStep === STEPS.length - 1) return "Save Changes";
    if (currentStep === 0) return "Continue to Product Details";
    return "Continue to Review";
  };

  const getBackButtonText = () => {
    if (currentStep === 1) return "Back to Trade Details";
    if (currentStep === 2) return "Back to Product";
    return "Back";
  };

  if (isFetching) {
    return (
      <div className="pb-20 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center text-slate-500">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-primary-600 rounded-full animate-spin mb-4"></div>
          <p>Loading case details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-20 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Case Overview", href: `/cases/${id}` },
          { label: "Edit Case" },
        ]}
      />

      <PageHeader 
        title="Edit Trade Case" 
        description="Update the details for this shipment."
      />
      
      {submitError && (
        <div className="mb-6 p-4 bg-error-50 text-error-900 border border-error-200 rounded-md text-sm" role="alert">
          {submitError}
        </div>
      )}
      
      <StepIndicator steps={STEPS} currentStepId={STEPS[currentStep].id} />
      
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[currentStep].title}</CardTitle>
          <p className="text-sm text-slate-500 mt-1">{STEP_DESCRIPTIONS[currentStep]}</p>
        </CardHeader>
        <CardContent>
          {currentStep === 0 && (
            <div className="space-y-6">
              <fieldset>
                <legend className="text-sm font-medium text-slate-900 mb-3">Trade direction</legend>
                <div className="flex items-center space-x-6">
                  <div className="flex items-center space-x-2">
                    <Radio 
                      id="export" 
                      name="direction" 
                      value="export"
                      checked={formData.direction === "export"}
                      onChange={handleChange}
                    />
                    <Label htmlFor="export" className="font-normal cursor-pointer">Export</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Radio 
                      id="import" 
                      name="direction" 
                      value="import"
                      checked={formData.direction === "import"}
                      onChange={handleChange}
                    />
                    <Label htmlFor="import" className="font-normal cursor-pointer">Import</Label>
                  </div>
                </div>
              </fieldset>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="origin">
                    Origin country <span className="text-error-500" aria-hidden="true">*</span>
                  </Label>
                  <Input 
                    id="origin" 
                    name="origin"
                    placeholder="e.g. Pakistan" 
                    value={formData.origin}
                    onChange={handleChange}
                    aria-invalid={!!errors.origin}
                    aria-describedby={errors.origin ? "origin-error" : undefined}
                    error={!!errors.origin}
                  />
                  {errors.origin && <p id="origin-error" className="text-sm text-error-600" role="alert">{errors.origin}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destination">
                    Destination country <span className="text-error-500" aria-hidden="true">*</span>
                  </Label>
                  <Input 
                    id="destination" 
                    name="destination"
                    placeholder="e.g. United Kingdom" 
                    value={formData.destination}
                    onChange={handleChange}
                    aria-invalid={!!errors.destination}
                    aria-describedby={errors.destination ? "destination-error" : undefined}
                    error={!!errors.destination}
                  />
                  {errors.destination && <p id="destination-error" className="text-sm text-error-600" role="alert">{errors.destination}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="date">
                    Expected shipment date <span className="text-slate-400 font-normal">(optional)</span>
                  </Label>
                  <Input 
                    id="date" 
                    name="date"
                    type="date"
                    value={formData.date}
                    onChange={handleChange}
                    aria-invalid={!!errors.date}
                    aria-describedby={errors.date ? "date-error" : undefined}
                    error={!!errors.date}
                  />
                  {errors.date && <p id="date-error" className="text-sm text-error-600" role="alert">{errors.date}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="value">Approximate value <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <Input 
                    id="value" 
                    name="value"
                    placeholder="e.g. $50,000" 
                    value={formData.value}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="productName">
                  Product name <span className="text-error-500" aria-hidden="true">*</span>
                </Label>
                <p className="text-sm text-slate-500" id="productName-hint">Enter the common name of the product you&apos;re shipping.</p>
                <Input 
                  id="productName" 
                  name="productName"
                  placeholder="e.g. Aseptic mango pulp" 
                  value={formData.productName}
                  onChange={handleChange}
                  aria-invalid={!!errors.productName}
                  aria-describedby={`productName-hint${errors.productName ? " productName-error" : ""}`}
                  error={!!errors.productName}
                />
                {errors.productName && <p id="productName-error" className="text-sm text-error-600" role="alert">{errors.productName}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="category">
                  Product category <span className="text-slate-400 font-normal">(optional)</span>
                </Label>
                <Select 
                  id="category" 
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  aria-invalid={!!errors.category}
                  aria-describedby={errors.category ? "category-error" : undefined}
                  error={!!errors.category}
                >
                  <option value="">Choose a category…</option>
                  <option value="agriculture">Agriculture & Food</option>
                  <option value="electronics">Electronics & Tech</option>
                  <option value="textiles">Textiles & Apparel</option>
                  <option value="machinery">Machinery & Industrial</option>
                  <option value="chemicals">Chemicals</option>
                  <option value="other">Other</option>
                </Select>
                {errors.category && <p id="category-error" className="text-sm text-error-600" role="alert">{errors.category}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Additional details <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Textarea 
                  id="description" 
                  name="description"
                  placeholder="Any extra details that might affect trade requirements, e.g. temperature controlled, hazardous goods, etc." 
                  value={formData.description}
                  onChange={handleChange}
                  rows={4}
                />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <p className="text-sm text-slate-500">Check the details below. You can go back to make changes before saving.</p>
              
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h4 className="font-semibold text-slate-800 text-sm">Trade Details</h4>
                  <button
                    type="button"
                    onClick={() => { setCurrentStep(0); setErrors({}); }}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
                  >
                    Edit
                  </button>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500 block mb-1">Direction</span>
                    <span className="font-medium text-slate-900 capitalize">{formData.direction}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-1">Route</span>
                    <span className="font-medium text-slate-900">{formData.origin} → {formData.destination}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-1">Shipment date</span>
                    <span className="font-medium text-slate-900">{formData.date || "Not specified"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-1">Estimated value</span>
                    <span className="font-medium text-slate-900">{formData.value || "Not specified"}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h4 className="font-semibold text-slate-800 text-sm">Product Information</h4>
                  <button
                    type="button"
                    onClick={() => { setCurrentStep(1); setErrors({}); }}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
                  >
                    Edit
                  </button>
                </div>
                <div className="p-4 space-y-4 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-500 block mb-1">Product name</span>
                      <span className="font-medium text-slate-900">{formData.productName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-1">Category</span>
                      <span className="font-medium text-slate-900 capitalize">{formData.category ? formData.category.replace("-", " ") : "Not specified"}</span>
                    </div>
                  </div>
                  {formData.description && (
                    <div>
                      <span className="text-slate-500 block mb-1">Additional details</span>
                      <span className="font-medium text-slate-900">{formData.description}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between border-t border-border pt-6">
          <div className="flex gap-3">
            {currentStep > 0 ? (
              <Button variant="outline" onClick={handleBack} disabled={isLoading}>
                {getBackButtonText()}
              </Button>
            ) : (
              <Button 
                variant="ghost" 
                onClick={() => router.push(`/cases/${id}`)}
                disabled={isLoading}
              >
                Cancel
              </Button>
            )}
          </div>
          
          <Button onClick={handleNext} isLoading={isLoading}>
            {getNextButtonText()}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
