"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthShell,
  AuthInput,
  AuthPrimaryButton,
  AuthInlineLink,
  LockIcon,
  CheckIcon,
} from "@/components/auth/AuthShell";
import { validatePassword } from "@/lib/auth/password";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });

  const passwordValid = validatePassword(formData.password) === null;
  const passwordsMatch =
    formData.confirmPassword.length > 0 &&
    formData.password === formData.confirmPassword;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!passwordValid) {
      setError(validatePassword(formData.password) ?? "Please choose a stronger password.");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: formData.password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof data?.error === "string" ? data.error : "Failed to reset password. Please try again.");
        return;
      }
      setSuccess(true);
      // Redirect to signin after a short delay so the user sees the success state.
      setTimeout(() => router.push("/auth/signin"), 1200);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthShell heading="Invalid link">
        <div role="alert" className="mx-1 rounded-md bg-error-50 px-3 py-2 text-sm text-error-600 ring-1 ring-error-200">
          Invalid or missing reset token. Please request a new password reset link.
        </div>
        <div className="mt-4 text-center text-sm text-slate-500">
          <AuthInlineLink href="/auth/forgot-password">Request a new reset link</AuthInlineLink>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell heading="Reset password">
      <p className="px-2 pb-2 text-center text-sm text-slate-600">
        Choose a new password for your account.
      </p>

      {success && (
        <div role="status" className="mx-1 mb-3 rounded-md bg-success-50 px-3 py-2 text-sm text-success-700 ring-1 ring-success-200">
          Your password has been reset. Redirecting to sign in…
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        {error && (
          <div role="alert" className="mx-1 mb-2 rounded-md bg-error-50 px-3 py-2 text-sm text-error-600 ring-1 ring-error-200">
            {error}
          </div>
        )}

        <AuthInput
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="New password"
          value={formData.password}
          onChange={handleChange}
          disabled={isLoading || success}
          aria-label="New password"
          icon={<LockIcon className="h-5 w-5" />}
          rightAdornment={passwordValid ? <CheckIcon className="h-4 w-4" /> : null}
        />

        <AuthInput
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Confirm new password"
          value={formData.confirmPassword}
          onChange={handleChange}
          disabled={isLoading || success}
          aria-label="Confirm new password"
          icon={<LockIcon className="h-5 w-5" />}
          rightAdornment={passwordsMatch ? <CheckIcon className="h-4 w-4" /> : null}
        />

        <p className="px-1 pt-1 text-xs text-slate-500">
          Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.
        </p>

        <div className="pt-2">
          <AuthPrimaryButton type="submit" isLoading={isLoading} disabled={success}>
            Reset password
          </AuthPrimaryButton>
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Remembered it? <AuthInlineLink href="/auth/signin">Sign in</AuthInlineLink>
      </p>
    </AuthShell>
  );
}
