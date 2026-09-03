"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  PasswordStrengthMeter,
} from "@/components/auth/AuthShell";
import { validatePassword } from "@/lib/auth/password";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapError(message: string | null | undefined): string {
  if (!message) return "Sign-up failed. Please try again.";
  if (message === "CredentialsSignin") return "The email or password you entered is incorrect.";
  if (message === "Configuration") return "Authentication is temporarily unavailable. Please try again later.";
  if (message === "RateLimit") return "Too many sign-up attempts. Please wait and try again.";
  if (message === "AccountExists") return "An account with this email already exists.";
  return message;
}

export default function SignUpPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const emailValid = useMemo(
    () => EMAIL_RE.test(formData.email.trim()),
    [formData.email]
  );
  const passwordValid = useMemo(
    () => validatePassword(formData.password) === null,
    [formData.password]
  );
  const passwordsMatch =
    formData.confirmPassword.length > 0 &&
    formData.password === formData.confirmPassword;
  const nameValid = formData.name.trim().length > 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  };

  /**
   * Sign up flow:
   *   1. Validate all fields client-side FIRST.
   *   2. POST the registration data to /api/auth/register (creates the User).
   *   3. If success, perform the same credentials login POST used by the
   *      SignIn page so the session cookie is set.
   *   4. Soft-navigate to /dashboard.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Step 1: Validate name
    if (!nameValid) {
      setError("Please enter your name.");
      return;
    }
    // Step 2: Validate email format
    if (!emailValid) {
      setError("Please enter a valid email address.");
      return;
    }
    // Step 3: Validate password requirements (specific error message)
    if (!passwordValid) {
      setError(validatePassword(formData.password) ?? "Please choose a stronger password.");
      return;
    }
    // Step 4: Validate confirm password
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    // Step 5: ALL validation passed → now check backend (which checks email existence)
    setIsLoading(true);
    try {
      const regRes = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
        }),
      });
      const regData = await regRes.json().catch(() => ({}));
      if (!regRes.ok) {
        if (regRes.status === 409) {
          // Step 6: Email already exists → show specific message with Log in action
          setError(
            <span>
              An account with this email already exists.{" "}
              <Link href="/auth/signin" className="font-semibold underline hover:text-error-700">
                Please log in instead.
              </Link>
            </span>
          );
        } else if (regRes.status === 429) {
          setError("Too many sign-up attempts. Please wait and try again.");
        } else {
          setError(
            typeof regData?.error === "string"
              ? mapError(regData.error)
              : "Registration failed. Please try again."
          );
        }
        return;
      }

      // Now log the user in via the official next-auth signIn method.
      const loginRes = await signIn("credentials", {
        redirect: false,
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        callbackUrl: "/dashboard",
      });

      if (loginRes?.ok) {
        router.push(loginRes.url || "/dashboard");
        router.refresh();
        return;
      }

      // Account was created but auto-login failed — send to sign in page.
      setError("Account created. Please sign in to continue.");
      setTimeout(() => {
        router.push("/auth/signin");
      }, 1500);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      heading="Create Workspace"
      belowHeading="Sign up to get started."
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
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Full name"
          value={formData.name}
          onChange={handleChange}
          disabled={isLoading}
          aria-label="Full name"
          icon={<UserIcon className="h-5 w-5" />}
          rightAdornment={nameValid ? <CheckIcon className="h-4 w-4" /> : null}
        />

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

        <div>
          <AuthInput
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            disabled={isLoading}
            aria-label="Password"
            icon={<LockIcon className="h-5 w-5" />}
            rightAdornment={passwordValid ? <CheckIcon className="h-4 w-4" /> : null}
          />
          <PasswordStrengthMeter password={formData.password} />
        </div>

        <AuthInput
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Confirm password"
          value={formData.confirmPassword}
          onChange={handleChange}
          disabled={isLoading}
          aria-label="Confirm password"
          icon={<LockIcon className="h-5 w-5" />}
          rightAdornment={passwordsMatch ? <CheckIcon className="h-4 w-4" /> : null}
        />

        {/* Help text only shown while the user has not yet entered a valid password. */}
        {formData.password.length > 0 && !passwordValid && (
          <p className="px-1 text-xs text-slate-500">
            Use 8+ characters with uppercase, lowercase, a number, and a symbol.
          </p>
        )}

        <div className="pt-2">
          <AuthPrimaryButton type="submit" isLoading={isLoading}>
            Create Workspace
          </AuthPrimaryButton>
        </div>
      </form>

      <div className="mt-6">

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account? <AuthInlineLink href="/auth/signin">Log in</AuthInlineLink>
        </p>
      </div>
    </AuthShell>
  );
}
