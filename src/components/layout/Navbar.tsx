"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { AppShell } from "@/components/workspace/AppShell";

export function Navbar({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();

  // Auth pages render their own layout
  if (pathname?.startsWith("/auth")) {
    return (
      <main className="flex-1 flex flex-col w-full min-h-screen">
        {children}
      </main>
    );
  }

  // Root landing page gets marketing nav
  if (pathname === "/") {
    return (
      <>
        <MarketingNav />
        <main className="flex-1 flex flex-col w-full min-h-screen">
          {children}
        </main>
      </>
    );
  }

  // All other authenticated workspace routes get the AppShell
  return <AppShell>{children}</AppShell>;
}
