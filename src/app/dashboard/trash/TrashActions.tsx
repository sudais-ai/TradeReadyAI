"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

interface Props {
  kind: "case" | "document";
  id: string;
  tradeCaseId?: string;
  // Server action — passed as a function. The two restore actions
  // have different signatures:
  //   restoreTradeCase(id)
  //   restoreDocument(tradeCaseId, documentId)
  // Both return the same result shape. We model the union and let
  // the component dispatch based on whether `tradeCaseId` is set.
  restoreFn: ((id: string) => Promise<{
    success: boolean;
    error?: string;
    alreadyActive?: boolean;
  }>) | ((tradeCaseId: string, documentId: string) => Promise<{
    success: boolean;
    error?: string;
    alreadyActive?: boolean;
  }>);
}

export function TrashActions({ kind, id, tradeCaseId, restoreFn }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onRestore() {
    setError(null);
    startTransition(async () => {
      let result: { success: boolean; error?: string; alreadyActive?: boolean };
      if (kind === "document" && tradeCaseId) {
        // restoreDocument(tradeCaseId, documentId)
        result = await (restoreFn as (a: string, b: string) => Promise<typeof result>)(
          tradeCaseId,
          id
        );
      } else {
        // restoreTradeCase(id)
        result = await (restoreFn as (a: string) => Promise<typeof result>)(id);
      }
      if (!result.success) {
        setError(result.error ?? "Restore failed.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="primary"
        onClick={onRestore}
        disabled={isPending}
      >
        {isPending ? "Restoring…" : "Restore"}
      </Button>
      {error && (
        <p className="text-xs text-error-600 max-w-[20rem] text-right">
          {error}
        </p>
      )}
    </div>
  );
}
