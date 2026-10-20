/**
 * Where the deep-link checkout route sends the user when the checkout it was
 * asked for doesn't happen — the platform gate can't reach checkout, there is
 * no package, or the account is already Pro. Absent a continuation the answer
 * is the plans takeover.
 *
 * Onboarding needs a different answer. Its Start click hands off to checkout
 * mid-funnel, so carrying the onboarding step Start would otherwise have taken
 * keeps every no-purchase exit inside the funnel instead of dropping the user
 * on plans — outside onboarding, before research or hatching ever runs.
 *
 * The value is a same-app path, sanitized on read like every other
 * URL-supplied destination.
 */
import { sanitizeReturnTo } from "@/utils/return-to";

export const CHECKOUT_CONTINUE_PARAM = "continue";

/** The checkout route's non-purchase destination, or `fallback` when none. */
export function checkoutContinuation(
  searchParams: URLSearchParams,
  fallback: string,
): string {
  return sanitizeReturnTo(searchParams.get(CHECKOUT_CONTINUE_PARAM), fallback);
}
