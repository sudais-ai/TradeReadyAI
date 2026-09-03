"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createTradeCase } from "@/actions/trade-cases";
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
  { id: "review", title: "Review & Create" },
];

const STEP_DESCRIPTIONS = [
  "Tell us about the trade route — where the shipment is going and where it's coming from.",
  "Tell us about the product you're shipping.",
  "Review everything before creating your trade case.",
];

export default function CreateTradeCasePage() {
  const router = useRouter();

  const getInitialFormState = () => {
    if (typeof window === "undefined") {
      return {
        direction: "export",
        origin: "",
        destination: "",
        date: "",
        value: "",
        productName: "",
        category: "",
        description: "",
      };
    }
    const savedData = sessionStorage.getItem("tradeReadyFormDraft");
    if (savedData) {
      try {
        const { data } = JSON.parse(savedData);
        if (data) return data;
      } catch (e) {
        console.error("Failed to parse saved form data", e);
      }
    }
    return {
      direction: "export",
      origin: "",
      destination: "",
      date: "",
      value: "",
      productName: "",
      category: "",
      description: "",
    };
  };

  const getInitialStep = () => {
    if (typeof window === "undefined") return 0;
    const savedData = sessionStorage.getItem("tradeReadyFormDraft");
    if (savedData) {
      try {
        const { step } = JSON.parse(savedData);
        if (step !== undefined) return step;
      } catch (e) {
        console.error("Failed to parse saved form data", e);
      }
    }
    return 0;
  };

  const [currentStep, setCurrentStep] = React.useState(getInitialStep);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState(getInitialFormState);

  // Save to sessionStorage when data changes
  React.useEffect(() => {
    sessionStorage.setItem("tradeReadyFormDraft", JSON.stringify({
      step: currentStep,
      data: formData
    }));
  }, [currentStep, formData]);

  const handleNext = () => {
    const newErrors: Record<string, string> = {};
    
    if (currentStep === 0) {
      if (!formData.origin.trim()) newErrors.origin = "Please enter the origin country.";
      if (!formData.destination.trim()) newErrors.destination = "Please enter the destination country.";
      if (!formData.date) newErrors.date = "Please select a shipment date.";
    } else if (currentStep === 1) {
      if (!formData.productName.trim()) newErrors.productName = "Please enter the product name.";
      if (!formData.category) newErrors.category = "Please select a product category.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev: number) => prev + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      // Final submit
      setIsLoading(true);
      setSubmitError(null);
      
      createTradeCase(formData)
        .then((result) => {
          if (result.success) {
            sessionStorage.removeItem("tradeReadyFormDraft");
            router.push(`/cases/${result.id}`);
          } else {
            setSubmitError(result.error || "Failed to create trade case.");
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
      setCurrentStep((prev: number) => prev - 1);
      setErrors({});
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev: typeof formData) => ({ ...prev, [name]: value }));
    // Clear error when user types
    if (errors[name]) {
      setErrors((prev: Record<string, string>) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const getNextButtonText = () => {
    if (currentStep === STEPS.length - 1) return "Create Trade Case";
    if (currentStep === 0) return "Continue to Product Details";
    return "Continue to Review";
  };

  const getBackButtonText = () => {
    if (currentStep === 1) return "Back to Trade Details";
    if (currentStep === 2) return "Back to Product";
    return "Back";
  };

  return (
    <div className="pb-20 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "New Trade Case" },
        ]}
      />

      <PageHeader 
        title="New Trade Case" 
        description="Provide details about your planned shipment. We'll help you check what's needed."
      />
      
      {submitError && (
        <div className="mb-6 p-4 bg-error-50 text-error-900 border border-error-200 rounded-md text-sm" role="alert">
          {submitError}
        </div>
      )}
      
      <StepIndicator steps={STEPS} currentStepId={STEPS[currentStep].id} />
      
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl text-ink font-bold">{STEPS[currentStep].title}</CardTitle>
          <p className="text-sm text-ink-soft mt-1">{STEP_DESCRIPTIONS[currentStep]}</p>
        </CardHeader>
        <CardContent>
          {currentStep === 0 && (
            <div className="space-y-6">
              <fieldset>
                <legend className="text-sm font-semibold text-ink mb-3">Trade direction</legend>
                <div className="flex items-center space-x-6">
                  <div className="flex items-center space-x-2">
                    <Radio 
                      id="export" 
                      name="direction" 
                      value="export"
                      checked={formData.direction === "export"}
                      onChange={handleChange}
                    />
                    <Label htmlFor="export" className="font-medium cursor-pointer text-ink">Export</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Radio 
                      id="import" 
                      name="direction" 
                      value="import"
                      checked={formData.direction === "import"}
                      onChange={handleChange}
                    />
                    <Label htmlFor="import" className="font-medium cursor-pointer text-ink">Import</Label>
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
                    Expected shipment date <span className="text-error-500" aria-hidden="true">*</span>
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
                  <Label htmlFor="value">Approximate value <span className="text-muted font-normal">(optional)</span></Label>
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
                <p className="text-sm text-ink-soft" id="productName-hint">Enter the common name of the product you&apos;re shipping.</p>
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
                  Product category <span className="text-error-500" aria-hidden="true">*</span>
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
                <Label htmlFor="description">Additional details <span className="text-muted font-normal">(optional)</span></Label>
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
              <p className="text-sm text-ink-soft">Check the details below. You can go back to make changes before creating your case.</p>
              
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="bg-slate-50 px-5 py-4 border-b border-border flex items-center justify-between">
                  <h4 className="font-semibold text-ink text-sm">Trade Details</h4>
                  <button
                    type="button"
                    onClick={() => { setCurrentStep(0); setErrors({}); }}
                    className="text-xs text-blue hover:text-blue-deep font-medium transition-colors"
                  >
                    Edit
                  </button>
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
                  <div>
                    <span className="text-muted block mb-1 text-xs uppercase tracking-wider font-medium">Direction</span>
                    <span className="font-medium text-ink capitalize">{formData.direction}</span>
                  </div>
                  <div>
                    <span className="text-muted block mb-1 text-xs uppercase tracking-wider font-medium">Route</span>
                    <span className="font-medium text-ink">{formData.origin} → {formData.destination}</span>
                  </div>
                  <div>
                    <span className="text-muted block mb-1 text-xs uppercase tracking-wider font-medium">Shipment date</span>
                    <span className="font-medium text-ink">{formData.date}</span>
                  </div>
                  <div>
                    <span className="text-muted block mb-1 text-xs uppercase tracking-wider font-medium">Estimated value</span>
                    <span className="font-medium text-ink">{formData.value || "Not specified"}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <div className="bg-slate-50 px-5 py-4 border-b border-border flex items-center justify-between">
                  <h4 className="font-semibold text-ink text-sm">Product Information</h4>
                  <button
                    type="button"
                    onClick={() => { setCurrentStep(1); setErrors({}); }}
                    className="text-xs text-blue hover:text-blue-deep font-medium transition-colors"
                  >
                    Edit
                  </button>
                </div>
                <div className="p-5 space-y-5 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <span className="text-muted block mb-1 text-xs uppercase tracking-wider font-medium">Product name</span>
                      <span className="font-medium text-ink">{formData.productName}</span>
                    </div>
                    <div>
                      <span className="text-muted block mb-1 text-xs uppercase tracking-wider font-medium">Category</span>
                      <span className="font-medium text-ink capitalize">{formData.category.replace("-", " ")}</span>
                    </div>
                  </div>
                  {formData.description && (
                    <div>
                      <span className="text-muted block mb-1 text-xs uppercase tracking-wider font-medium">Additional details</span>
                      <span className="font-medium text-ink">{formData.description}</span>
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
                onClick={() => {
                  sessionStorage.removeItem("tradeReadyFormDraft");
                  router.push("/dashboard");
                }}
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
