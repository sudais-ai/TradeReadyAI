import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface NextStepCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description: string;
  actionText: string;
  actionHref: string;
}

export function NextStepCard({
  title,
  description,
  actionText,
  actionHref,
  className,
  ...props
}: NextStepCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-blue/20 bg-blue-soft/30 p-8 shadow-sm",
        className
      )}
      {...props}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-blue mb-3">Next Step</p>
      <h3 className="font-display font-bold text-ink text-2xl mb-3">{title}</h3>
      <p className="text-base text-ink-soft leading-relaxed mb-6 max-w-2xl">{description}</p>
      <Link href={actionHref}>
        <Button className="bg-blue hover:bg-blue-deep text-white shadow-sm font-semibold">{actionText}</Button>
      </Link>
    </div>
  );
}
