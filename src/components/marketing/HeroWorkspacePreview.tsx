"use client";

import React from "react";

export function HeroWorkspacePreview() {
  return (
    <div className="relative mx-auto max-w-5xl rounded-xl border border-white/20 bg-white/10 p-2 backdrop-blur-2xl shadow-2xl">
      <div className="rounded-lg bg-surface shadow-inner overflow-hidden border border-border">
        {/* Fake Browser Chrome */}
        <div className="flex h-12 items-center gap-2 border-b border-border bg-slate-50 px-4">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-slate-300" />
            <div className="h-3 w-3 rounded-full bg-slate-300" />
            <div className="h-3 w-3 rounded-full bg-slate-300" />
          </div>
          <div className="mx-4 flex h-6 flex-1 items-center justify-center rounded bg-white px-2 text-xs text-muted shadow-sm ring-1 ring-border">
            app.tradeready.ai
          </div>
        </div>

        {/* Dashboard Mockup Content */}
        <div className="flex h-[400px]">
          {/* Sidebar */}
          <div className="w-48 border-r border-border bg-surface p-4 hidden md:block">
            <div className="h-6 w-24 rounded bg-slate-100 mb-8" />
            <div className="space-y-3">
              <div className="h-4 w-full rounded bg-blue-soft" />
              <div className="h-4 w-3/4 rounded bg-slate-100" />
              <div className="h-4 w-5/6 rounded bg-slate-100" />
            </div>
            <div className="mt-8 space-y-3">
              <div className="h-3 w-16 rounded bg-slate-200 mb-4" />
              <div className="h-4 w-full rounded bg-slate-100" />
              <div className="h-4 w-2/3 rounded bg-slate-100" />
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-6 bg-paper overflow-hidden relative">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="h-6 w-48 rounded bg-slate-200 mb-2" />
                <div className="h-4 w-32 rounded bg-slate-100" />
              </div>
              <div className="h-8 w-24 rounded bg-blue hidden sm:block" />
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-lg bg-surface border border-border p-4 shadow-sm flex flex-col justify-between">
                  <div className="h-3 w-16 rounded bg-slate-100" />
                  <div className="h-8 w-12 rounded bg-slate-200" />
                </div>
              ))}
            </div>

            {/* Animated Progress UI Element */}
            <div className="absolute right-8 top-32 hidden lg:flex flex-col items-center justify-center h-32 w-32 rounded-full border-[6px] border-blue-soft shadow-lg bg-surface">
              <span className="text-xl font-display font-bold text-blue">85%</span>
              <span className="text-xs text-muted uppercase tracking-wider font-semibold">Ready</span>
              <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#0A8FD5"
                  strokeWidth="10"
                  strokeDasharray="283"
                  strokeDashoffset="42" /* 85% of 283 */
                  strokeLinecap="round"
                />
              </svg>
            </div>

            {/* Table Mockup */}
            <div className="rounded-lg bg-surface border border-border shadow-sm">
              <div className="h-12 border-b border-border bg-slate-50 px-4 flex items-center">
                <div className="h-3 w-24 rounded bg-slate-200" />
              </div>
              <div className="p-4 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-100" />
                      <div>
                        <div className="h-3 w-32 rounded bg-slate-200 mb-1.5" />
                        <div className="h-2 w-24 rounded bg-slate-100" />
                      </div>
                    </div>
                    <div className="h-5 w-16 rounded-full bg-green-50 hidden sm:block" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
