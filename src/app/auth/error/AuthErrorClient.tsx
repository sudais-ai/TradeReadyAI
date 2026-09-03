"use client";

import { useSearchParams } from "next/navigation";
import { AuthShell, AuthInlineLink } from "@/components/auth/AuthShell";

export function AuthErrorClient() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error") || "Unknown";
  const { title, message, showSupportHint } = mapError(error);

  return (
    <AuthShell heading={title}>
      <p className="text-center text-sm text-slate-700">{message}</p>
      {showSupportHint && (
        <p className="mt-2 text-center text-sm text-slate-500">
          If this keeps happening, please contact support.
        </p>
      )}
      <div className="mt-5 flex flex-col gap-3">
        <a
          href="/auth/signin"
          className="inline-flex w-full items-center justify-center rounded-full bg-[#5b6fd1] px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#4d60c2] active:scale-[0.99]"
        >
          Back to sign in
        </a>
        <p className="text-center text-sm text-slate-500">
          Need an account? <AuthInlineLink href="/auth/signup">Sign up</AuthInlineLink>
        </p>
      </div>
    </AuthShell>
  );
}

interface ErrorInfo {
  title: string;
  message: string;
  showSupportHint: boolean;
}

function mapError(code: string): ErrorInfo {
  switch (code) {
    case "CredentialsSignin":
      return {
        title: "Sign-in failed",
        message: "The email or password you entered is incorrect.",
        showSupportHint: false,
      };
    case "Configuration":
      return {
        title: "Sign-in not available",
        message:
          "The sign-in method you chose is not currently available. Please use email and password, or try again later.",
        showSupportHint: true,
      };
    case "AccessDenied":
      return {
        title: "Access denied",
        message:
          "Your account may not have permission to sign in. Please contact support if you believe this is a mistake.",
        showSupportHint: true,
      };
    case "Verification":
      return {
        title: "Link expired",
        message: "The sign-in link is no longer valid. Please request a new one.",
        showSupportHint: false,
      };
    case "MissingCSRF":
      return {
        title: "Session expired",
        message: "Your session expired. Please try signing in again.",
        showSupportHint: false,
      };
    case "OAuthAccountNotLinked":
      return {
        title: "Account already exists",
        message:
          "An account with that email already exists using a different sign-in method. Please sign in with your original method.",
        showSupportHint: false,
      };
    case "CallbackRouteError":
      return {
        title: "Sign-in failed",
        message: "We couldn't complete that sign-in. Please try again.",
        showSupportHint: false,
      };
    case "OAuthSignInError":
    case "OAuthCallbackError":
      return {
        title: "Social sign-in failed",
        message:
          "We couldn't complete the social sign-in. Please try again or use email and password.",
        showSupportHint: false,
      };
    default:
      return {
        title: "Authentication error",
        message: "We couldn't complete that sign-in. Please try again.",
        showSupportHint: false,
      };
  }
}
