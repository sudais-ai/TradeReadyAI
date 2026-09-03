"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  AuthShell,
  AuthInput,
  AuthPrimaryButton,
  AuthInlineLink,
  SocialButton,
  UserIcon,
  LockIcon,
  CheckIcon,
} from "@/components/auth/AuthShell";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapError(message: string | null | undefined): string {
  if (!message) return "Sign-in failed. Please try again.";
  if (message === "CredentialsSignin") return "The email or password you entered is incorrect.";
  if (message === "Configuration") return "Authentication is temporarily unavailable. Please try again later.";
  if (message === "AccessDenied") return "Access denied. Your account may not have permission to sign in.";
  if (message === "Verification") return "The sign-in link is no longer valid. Please request a new one.";
  if (message === "MissingCSRF") return "Your session expired. Please try again.";
  if (message === "OAuthAccountNotLinked") return "That email is already linked to a different sign-in method.";
  if (message === "CallbackRouteError") return "We couldn't complete that sign-in. Please try again.";
  if (message === "RateLimit") return "Too many sign-in attempts. Please wait a few minutes and try again.";
  if (message.includes("Account temporarily locked")) return message;
  return message;
}

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const urlError = searchParams.get("error");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError ? mapError(urlError) : null
  );
  const [formData, setFormData] = useState({ email: "", password: "" });

  const emailValid = useMemo(
    () => EMAIL_RE.test(formData.email.trim()),
    [formData.email]
  );
  const passwordValid = formData.password.length > 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!emailValid) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!passwordValid) {
      setError("Please enter your password.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        callbackUrl,
      });

      if (!res) {
        setError("Sign-in failed. Please try again.");
        return;
      }

      if (res.error) {
        setError(mapError(res.error));
        return;
      }

      if (res.ok) {
        // Successful login — navigate to the callback URL
        router.push(res.url || callbackUrl);
        router.refresh();
        return;
      }

      setError("Sign-in failed. Please try again.");
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      heading="Log in"
      belowHeading="Enter your details to access your workspace."
    >
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
          value={formData.email}
          onChange={handleChange}
          disabled={isLoading}
          aria-invalid={formData.email.length > 0 && !emailValid}
          aria-label="Email address"
          icon={<UserIcon className="h-5 w-5" />}
          rightAdornment={emailValid ? <CheckIcon className="h-4 w-4" /> : null}
        />

        <AuthInput
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          disabled={isLoading}
          aria-label="Password"
          icon={<LockIcon className="h-5 w-5" />}
        />

        <div className="flex items-center justify-between pt-2 pb-1">
          <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
            <input 
              type="checkbox" 
              className="rounded border-border text-blue focus:ring-blue h-4 w-4 bg-slate-50"
            />
            <span className="select-none">Remember me</span>
          </label>
          <Link
            href="/auth/forgot-password"
            className="text-sm font-semibold text-blue transition hover:text-blue-deep hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <div className="pt-3">
          <AuthPrimaryButton type="submit" isLoading={isLoading}>
            Log in
          </AuthPrimaryButton>
        </div>
      </form>

      {/* Lower section: footer link */}
      <div className="mt-6">

        <p className="mt-6 text-center text-sm text-slate-500">
          Don&apos;t have an account? <AuthInlineLink href="/auth/signup">Sign up</AuthInlineLink>
        </p>
      </div>
    </AuthShell>
  );
}
