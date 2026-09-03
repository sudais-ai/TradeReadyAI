import * as React from "react";
import { cn } from "@/lib/utils";

export type LoadingSpinnerProps = React.SVGProps<SVGSVGElement>;

export function LoadingSpinner({ className, ...props }: LoadingSpinnerProps) {
  return (
    <svg
      className={cn("h-6 w-6 animate-spin text-primary-600", className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      // Phase 17: default to aria-hidden because the spinner is
      // always paired with a text label ("Loading...", "Analyzing...")
      // and never carries semantic meaning by itself. Consumers can
      // still override by passing their own aria-hidden.
      aria-hidden="true"
      {...props}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}
