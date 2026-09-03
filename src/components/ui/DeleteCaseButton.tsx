"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { deleteTradeCase } from "@/actions/trade-cases";

interface DeleteCaseButtonProps {
  caseId: string;
}

export function DeleteCaseButton({ caseId }: DeleteCaseButtonProps) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    
    try {
      const result = await deleteTradeCase(caseId);
      if (result.success) {
        router.push("/dashboard");
      } else {
        setError(result.error || "Failed to delete trade case.");
        setIsDeleting(false);
        setIsConfirming(false);
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred.");
      setIsDeleting(false);
      setIsConfirming(false);
    }
  };

  if (isConfirming) {
    return (
      <div className="flex items-center gap-2 bg-error-50 px-3 py-1.5 rounded-md border border-error-200">
        <span className="text-sm font-medium text-error-700 mr-2">Are you sure?</span>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => {
            setIsConfirming(false);
            setError(null);
          }}
          disabled={isDeleting}
          className="h-7 text-slate-600"
        >
          Cancel
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleDelete}
          isLoading={isDeleting}
          className="h-7 border-error-200 text-error-700 hover:bg-error-100 hover:text-error-800"
        >
          Confirm Delete
        </Button>
        {error && <span className="text-xs text-error-600 ml-2">{error}</span>}
      </div>
    );
  }

  return (
    <Button 
      variant="ghost" 
      size="sm" 
      onClick={() => setIsConfirming(true)}
      className="text-error-600 hover:text-error-700 hover:bg-error-50"
    >
      Delete
    </Button>
  );
}
