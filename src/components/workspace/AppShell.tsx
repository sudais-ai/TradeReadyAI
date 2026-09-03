"use client";

import React, { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TradeReadyLogo } from "../brand/TradeReadyLogo";
import Link from "next/link";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col">
        <Sidebar />
      </div>

      {/* Main layout area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile topbar */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-4 lg:hidden">
          <Link href="/">
            <TradeReadyLogo variant="workspace" tone="default" />
          </Link>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md p-2 text-muted hover:bg-slate-50 hover:text-ink focus:outline-none focus:ring-2 focus:ring-blue"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="sr-only">Open sidebar</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto outline-none" tabIndex={-1}>
          <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="relative z-50 lg:hidden">
          <div 
            className="fixed inset-0 bg-ink/80 backdrop-blur-sm transition-opacity" 
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-64 bg-surface shadow-xl">
            <Sidebar />
          </div>
        </div>
      )}
    </div>
  );
}
