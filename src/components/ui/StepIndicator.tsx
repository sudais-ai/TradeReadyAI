import * as React from "react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  title: string;
}

interface StepIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  steps: Step[];
  currentStepId: string;
}

export function StepIndicator({ steps, currentStepId, className, ...props }: StepIndicatorProps) {
  const currentIndex = steps.findIndex((step) => step.id === currentStepId);

  return (
    <div className={cn("mb-12", className)} {...props}>
      <nav aria-label="Progress">
        <ol role="list" className="flex items-center w-full">
          {steps.map((step, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isLast = index === steps.length - 1;

            return (
              <li key={step.id} className={cn("relative flex items-center", !isLast && "flex-1")}>
                <div className="flex items-center relative z-10 group">
                  <div
                    className={cn(
                      "flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors bg-surface",
                      isCompleted
                        ? "border-primary-600 bg-primary-600 text-white"
                        : isCurrent
                        ? "border-primary-600 text-primary-600"
                        : "border-slate-300 text-slate-500"
                    )}
                  >
                    {isCompleted ? (
                      <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span
                    className={cn(
                      "absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium whitespace-nowrap hidden sm:block",
                      isCurrent ? "text-primary-600" : "text-slate-500"
                    )}
                  >
                    {step.title}
                  </span>
                </div>
                {!isLast && (
                  <div className={cn("h-0.5 w-full", isCompleted ? "bg-primary-600" : "bg-slate-200")} />
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
