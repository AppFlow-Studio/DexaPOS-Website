/**
 * Paths a merchant page may not claim.
 *
 * A built site serves from a catch-all under `/sites/[slug]`, which already
 * hosts online-ordering routes. Without this list a merchant could create a page
 * at `checkout` and shadow their own checkout — so this is a correctness guard,
 * not a naming preference.
 *
 * Enforced in application code rather than as a DB CHECK: the list will change
 * as routes are added, and a migration per route is the wrong trade.
 */

/** Reserved first path segments, matched case-insensitively. */
export const RESERVED_PATH_SEGMENTS: readonly string[] = [
  // Online ordering — app/sites/[slug]/*
  "checkout",
  "cart",
  "order",
  "orders",
  "track",
  "menu",
  "info",
  "account",
  "login",
  "logout",
  "signup",
  "reset-password",
  // QR dine-in — app/sites/[slug]/t/[token]
  "t",
  // Platform + convention
  "api",
  "admin",
  "_next",
  "static",
  "assets",
  "sitemap",
  "sitemap.xml",
  "robots",
  "robots.txt",
  "favicon.ico",
  "manifest.json",
  ".well-known",
];

export type PathRejection =
  | "reserved"
  | "invalid_characters"
  | "too_long"
  | "too_deep"
  | "leading_or_trailing_slash";

export interface PathCheck {
  ok: boolean;
  reason?: PathRejection;
  message?: string;
}

/**
 * Mirrors the `site_pages_path_format` CHECK constraint — a test asserts they
 * agree, because a mismatch means the app accepts addresses the database then
 * rejects.
 *
 * Each segment must start *and* end with an alphanumeric, with single hyphens
 * between: `-lead`, `trail-` and `a--b` are all invalid. The whole path may be
 * empty, which is the home page.
 */
const PATH_FORMAT = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;

const MAX_PATH_LENGTH = 120;
const MAX_PATH_DEPTH = 3;

/**
 * Validates a page path. `''` is the home page and is always allowed — it is
 * created by the platform, not typed by a merchant.
 */
export function checkPagePath(rawPath: string): PathCheck {
  const path = rawPath.trim();

  if (path === "") return { ok: true };

  if (path.startsWith("/") || path.endsWith("/")) {
    return {
      ok: false,
      reason: "leading_or_trailing_slash",
      message: "Page addresses should not start or end with a slash.",
    };
  }

  if (path.length > MAX_PATH_LENGTH) {
    return {
      ok: false,
      reason: "too_long",
      message: `Page addresses can be at most ${MAX_PATH_LENGTH} characters.`,
    };
  }

  const segments = path.split("/");

  if (segments.length > MAX_PATH_DEPTH) {
    return {
      ok: false,
      reason: "too_deep",
      message: `Page addresses can be at most ${MAX_PATH_DEPTH} levels deep.`,
    };
  }

  if (!PATH_FORMAT.test(path)) {
    return {
      ok: false,
      reason: "invalid_characters",
      message:
        "Use lowercase letters, numbers and hyphens only — for example, our-story.",
    };
  }

  if (RESERVED_PATH_SEGMENTS.includes(segments[0].toLowerCase())) {
    return {
      ok: false,
      reason: "reserved",
      message: `"${segments[0]}" is reserved by your online store. Try another address.`,
    };
  }

  return { ok: true };
}

/**
 * Best-effort conversion of a page title into a valid path. Returns `''` when
 * nothing usable survives, which callers should treat as "ask the merchant".
 */
export function slugifyPagePath(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_PATH_LENGTH);

  return checkPagePath(slug).ok ? slug : "";
}
