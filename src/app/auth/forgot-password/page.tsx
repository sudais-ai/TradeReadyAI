"use client";

import { useMemo, useState } from "react";
import {
  AuthShell,
  AuthInput,
  AuthPrimaryButton,
  AuthInlineLink,
  UserIcon,
  CheckIcon,
} from "@/components/auth/AuthShell";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [email, setEmail] = useState("");
  const emailValid = useMemo(() => EMAIL_RE.test(email.trim()), [email]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!emailValid) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(typeof data?.error === "string" ? data.error : "Failed to send reset email. Please try again.");
        return;
      }
      setSuccess(true);
      setEmail("");
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell 
      heading="Reset Password"
      belowHeading="Enter your email and we'll send you a link to reset your password."
    >

      {success ? (
        <div
          role="status"
          className="mx-1 mt-2 rounded-md bg-success-50 px-3 py-2 text-sm text-success-700 ring-1 ring-success-200"
        >
          If an account exists with that email, you&apos;ll receive a password reset link shortly.
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          {error && (
            <div
              role="alert"
              className="mx-1 mb-2 rounded-md bg-error-50 px-3 py-2 text-sm text-error-600 ring-1 ring-error-200"
            >
              {error}
            </div>
          )}

          <AuthInput
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="Email"
            value={email}
            onChange={handleChange}
            disabled={isLoading}
            aria-invalid={email.length > 0 && !emailValid}
            aria-label="Email address"
            icon={<UserIcon className="h-5 w-5" />}
            rightAdornment={emailValid ? <CheckIcon className="h-4 w-4" /> : null}
          />

          <div className="pt-3">
            <AuthPrimaryButton type="submit" isLoading={isLoading}>
              Send reset link
            </AuthPrimaryButton>
          </div>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-ink-soft">
        Remembered your password?{" "}
        <AuthInlineLink href="/auth/signin">Sign in</AuthInlineLink>
      </p>
    </AuthShell>
  );
}
