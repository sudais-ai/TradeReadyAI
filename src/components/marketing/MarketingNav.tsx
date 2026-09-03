"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TradeReadyLogo } from "../brand/TradeReadyLogo";
import { Button } from "../ui/Button";

export function MarketingNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile menu on navigation
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-4 py-4 sm:px-6 lg:px-8 pointer-events-none">
      <div className="mx-auto max-w-7xl">
        {/* Clean transparent navbar — no glass panel, no rounded pill.
            The logo, links and CTAs sit directly over the page content. */}
        <div className="pointer-events-auto flex items-center justify-between px-2 sm:px-4">
          <Link href="/" className="flex shrink-0 items-center">
            <TradeReadyLogo variant="workspace" tone="inverted" />
          </Link>

          {/* Desktop Links */}
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="#product"
              className="text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              Product
            </Link>
            <Link
              href="#workflow"
              className="text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              How it works
            </Link>
            <Link
              href="#security"
              className="text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              Security
            </Link>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/auth/signin">
              <Button
                variant="ghost"
                className="rounded-full px-5 text-white/80 hover:text-white hover:bg-white/10"
              >
                Log in
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button className="rounded-full bg-blue hover:bg-blue-deep text-white px-5">
                Start Free
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center rounded-full p-2 text-white/70 hover:bg-white/10 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="sr-only">Open menu</span>
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="pointer-events-auto mt-2 rounded-xl bg-ink/90 border border-white/10 p-3 md:hidden">
            <nav className="flex flex-col space-y-4">
              <Link
                href="#product"
                className="text-base font-medium text-white px-2 py-1"
              >
                Product
              </Link>
              <Link
                href="#workflow"
                className="text-base font-medium text-white px-2 py-1"
              >
                How it works
              </Link>
              <Link
                href="#security"
                className="text-base font-medium text-white px-2 py-1"
              >
                Security
              </Link>
              <div className="h-px w-full bg-white/10" />
              <Link href="/auth/signin" className="w-full">
                <Button
                  variant="outline"
                  className="w-full justify-center border-white/20 text-white hover:bg-white/10"
                >
                  Log in
                </Button>
              </Link>
              <Link href="/auth/signup" className="w-full">
                <Button className="w-full justify-center bg-blue hover:bg-blue-deep text-white">
                  Start Free
                </Button>
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
