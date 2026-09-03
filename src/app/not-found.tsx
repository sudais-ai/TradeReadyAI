"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4 relative overflow-hidden">
      {/* Soft background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-soft/30 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-mint/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        <div className="mb-8">
          <span className="font-display text-[120px] sm:text-[160px] font-bold text-ink/5 leading-none select-none">404</span>
        </div>
        
        <div className="rounded-2xl bg-blue-soft/50 p-5 mb-8 inline-flex shadow-sm ring-1 ring-blue/10">
          <svg className="w-10 h-10 text-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-ink mb-4">Page not found</h1>
        <p className="text-base text-ink-soft mb-10 max-w-md mx-auto leading-relaxed">
          We couldn&apos;t find the page or trade case you&apos;re looking for. It might have been moved or deleted.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
          <Link href="/dashboard">
            <Button size="lg" className="bg-blue hover:bg-blue-deep text-white shadow-sm px-6">
              Return to Dashboard
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" size="lg" className="bg-surface border-border px-6">
              Go Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
