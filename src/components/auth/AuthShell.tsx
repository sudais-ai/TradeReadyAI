"use client";

import * as React from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { TradeReadyLogo } from "../brand/TradeReadyLogo";
import { cn } from "@/lib/utils";

/**
 * Shared visual shell for the Login / Sign Up / Forgot Password pages.
 *
 * Left side: video background with subtle overlay and floating badges.
 * Right side: clean white auth form card.
 */
interface AuthShellProps {
  heading: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  belowHeading?: React.ReactNode;
  pitchPanel?: React.ReactNode;
}

export function AuthShell({ heading, children, footer, belowHeading }: AuthShellProps) {
  return (
    <div className="relative min-h-screen w-full flex bg-ink selection:bg-blue/30 overflow-hidden font-body text-ink">
      {/* ─── LEFT SIDE: Video Background ─────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Video */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src="/assets/tradeready-trade-evidence-grid.mp4" type="video/mp4" />
        </video>

        {/* Subtle dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-ink/70 via-ink/50 to-ink/60" />
      </div>

      {/* ─── RIGHT SIDE: Auth Form ───────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen bg-surface">
        {/* Top bar (mobile/tablet only or always visible) */}
        <header className="flex items-center justify-between p-6">
          <Link href="/" className="hover:opacity-90 transition-opacity lg:hidden">
            <TradeReadyLogo variant="full" tone="inverted" />
          </Link>
          <div className="lg:block" />
          <Link
            href="/"
            className="text-sm font-medium text-muted hover:text-ink transition-colors flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to site
          </Link>
        </header>

        {/* Form Card */}
        <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-ink tracking-tight">
                {heading}
              </h1>
              {belowHeading && (
                <div className="mt-2 text-sm text-ink-soft">{belowHeading}</div>
              )}
            </div>

            {children}

            {footer && (
              <div className="mt-6 pt-6 border-t border-border text-center text-sm text-muted">
                {footer}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Rounded input with a leading icon. Optional right-side adornment (e.g. green
 * check). All auth pages use this so the inputs look consistent.
 */
interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon: React.ReactNode;
  rightAdornment?: React.ReactNode;
  inputClassName?: string;
}

export const AuthInput = React.forwardRef<HTMLInputElement, AuthInputProps>(
  ({ icon, rightAdornment, className, inputClassName, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const isPassword = type === "password";
    const actualType = isPassword ? (showPassword ? "text" : "password") : type;

    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-1.5 ring-1 ring-border transition-all focus-within:ring-2 focus-within:ring-blue focus-within:bg-white",
          className
        )}
      >
        <span className="flex h-5 w-5 items-center justify-center text-muted" aria-hidden="true">
          {icon}
        </span>
        <input
          ref={ref}
          type={actualType}
          {...props}
          className={cn(
            "w-full bg-transparent py-2 text-sm text-ink placeholder:text-muted focus:outline-none disabled:opacity-60",
            inputClassName
          )}
        />
        {rightAdornment && (
          <span className="flex h-5 w-5 items-center justify-center text-mint" aria-hidden="true">
            {rightAdornment}
          </span>
        )}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="flex h-5 w-5 items-center justify-center text-muted hover:text-ink transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        )}
      </div>
    );
  }
);
AuthInput.displayName = "AuthInput";

interface AuthPrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
}

export function AuthPrimaryButton({ isLoading, className, children, disabled, ...props }: AuthPrimaryButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex w-full items-center justify-center rounded-xl bg-blue px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
    >
      {isLoading && (
        <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

interface SocialButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  provider: "facebook" | "google";
  callbackUrl?: string;
}

export function SocialButton({ provider, callbackUrl, className, disabled, ...props }: SocialButtonProps) {
  const [available, setAvailable] = React.useState<boolean | null>(null);
  const [clicked, setClicked] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/providers", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        if (cancelled) return;
        setAvailable(Boolean((data as Record<string, any>)?.[provider]));
      })
      .catch(() => {
        if (cancelled) return;
        setAvailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const palette =
    provider === "facebook"
      ? "bg-[#1877F2] hover:bg-[#166FE0] text-white border border-transparent"
      : "bg-white hover:bg-slate-50 text-ink border border-border shadow-sm";

  const icon =
    provider === "facebook" ? (
      <FacebookIcon className="h-5 w-5" />
    ) : (
      <GoogleIcon className="h-5 w-5" />
    );

  const label = provider === "facebook" ? "Facebook" : "Google";
  const isDisabled = disabled || available === false || clicked;

  return (
    <button
      type="button"
      {...props}
      disabled={isDisabled}
      title={
        available === false
          ? `${label} sign-in is not configured on this server.`
          : undefined
      }
      onClick={(e) => {
        e.preventDefault();
        if (isDisabled) return;
        setClicked(true);
        signIn(provider, { callbackUrl: callbackUrl ?? "/dashboard" });
      }}
      className={cn(
        "inline-flex w-full items-center justify-center gap-3 rounded-xl px-5 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
        palette,
        className
      )}
    >
      {icon}
      <span>
        {available === false
          ? `${label} unavailable`
          : clicked
            ? `Connecting…`
            : `${label}`}
      </span>
    </button>
  );
}

export function AuthInlineLink({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="font-semibold text-blue transition hover:text-blue-deep hover:underline"
    >
      {children}
    </Link>
  );
}

// Visual indicator for password strength
export function PasswordStrengthMeter({ password }: { password: string }) {
  const getStrength = () => {
    let strength = 0;
    if (password.length > 7) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/[a-z]/.test(password)) strength += 25;
    if (/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password)) strength += 25;
    return strength;
  };

  const strength = getStrength();
  
  let colorClass = "bg-slate-200";
  let label = "Enter a password";
  if (password.length > 0) {
    if (strength <= 25) {
      colorClass = "bg-error-500";
      label = "Weak";
    } else if (strength <= 50) {
      colorClass = "bg-amber";
      label = "Fair";
    } else if (strength <= 75) {
      colorClass = "bg-blue";
      label = "Good";
    } else {
      colorClass = "bg-mint";
      label = "Strong";
    }
  }

  return (
    <div className="w-full mt-2">
      <div className="flex gap-1 h-1 w-full rounded-full overflow-hidden mb-1 bg-slate-100">
        <div className={cn("h-full transition-all duration-300", password.length > 0 && strength >= 25 ? colorClass : "bg-transparent")} style={{ width: "25%" }} />
        <div className={cn("h-full transition-all duration-300", password.length > 0 && strength >= 50 ? colorClass : "bg-transparent")} style={{ width: "25%" }} />
        <div className={cn("h-full transition-all duration-300", password.length > 0 && strength >= 75 ? colorClass : "bg-transparent")} style={{ width: "25%" }} />
        <div className={cn("h-full transition-all duration-300", password.length > 0 && strength >= 100 ? colorClass : "bg-transparent")} style={{ width: "25%" }} />
      </div>
      <div className="text-[10px] uppercase font-semibold tracking-wider text-muted text-right">
        {label}
      </div>
    </div>
  );
}

// Icons
export function EyeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export function EyeSlashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

export function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function LockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function FacebookIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M13 22v-8h2.5l.5-3H13V9c0-.9.3-1.5 1.6-1.5H16V4.8c-.3 0-1.3-.1-2.5-.1-2.5 0-4 1.5-4 4.2V11H7v3h2.5v8H13z" />
    </svg>
  );
}

export function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.1A6.97 6.97 0 0 1 5.5 12c0-.73.12-1.43.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.47 1.18 4.93l3.66-2.83z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335" />
    </svg>
  );
}
