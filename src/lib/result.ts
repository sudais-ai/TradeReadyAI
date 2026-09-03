/**
 * Phase 6 — centralized action-result contract.
 *
 * The existing actions in `src/actions/**` already return a hand-rolled
 * `{ success: boolean; error?: string }` shape. This module exposes a small
 * helper pair (`actionOk` / `actionFail`) that future actions can adopt to
 * avoid repeating the UnauthorizedError / ForbiddenError / ZodError branches.
 *
 * It does NOT change the behaviour of any existing action.
 */
import { ZodError } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/session";

export type ActionResult<T = void> = T extends void
  ? { success: true } | { success: false; error: string }
  : { success: true; data: T } | { success: false; error: string };

export function actionOk<T = void>(data?: T): ActionResult<T> {
  return (
    data === undefined ? { success: true } : { success: true, data }
  ) as ActionResult<T>;
}

export function actionFail(
  error: unknown,
  fallback = "An unexpected error occurred. Please try again."
): { success: false; error: string } {
  if (error instanceof UnauthorizedError) {
    return { success: false, error: "You must be signed in to perform this action." };
  }
  if (error instanceof ForbiddenError) {
    return { success: false, error: "You don't have access to this resource." };
  }
  if (error instanceof ZodError) {
    return {
      success: false,
      error: "Some fields are invalid. Please check and try again.",
    };
  }
  if (error instanceof Error) {
    return { success: false, error: error.message || fallback };
  }
  return { success: false, error: fallback };
}
