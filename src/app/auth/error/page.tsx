import { Suspense } from "react";
import { AuthErrorClient } from "./AuthErrorClient";

/**
 * Server entry point for /auth/error. The client-side error-mapper
 * uses `useSearchParams` and therefore has to be inside a <Suspense>
 * boundary for static rendering under Next 16.
 */
export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <AuthErrorClient />
    </Suspense>
  );
}
