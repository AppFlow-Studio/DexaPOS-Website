import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MAX_SUBDOMAIN_LENGTH,
  RESERVED_SUBDOMAINS,
  SUBDOMAIN_FORMAT,
  checkSubdomain,
  slugifySubdomain,
} from "../reserved-subdomains";

/**
 * Sibling of `reserved-paths.test.ts`, and load-bearing for the same reason:
 * the TypeScript rules and the SQL CHECK are two statements of one thing, and a
 * mismatch means the app cheerfully accepts a web address the database then
 * rejects — or worse, accepts one that can never resolve.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");

function readFile(relative: string): string {
  return readFileSync(join(REPO_ROOT, relative), "utf-8");
}

describe("subdomain format", () => {
  it("accepts ordinary restaurant addresses", () => {
    for (const value of ["joes-coffee", "joes", "a1b", "downtown-hamra", "cafe123"]) {
      expect(checkSubdomain(value).ok, `${value} should be allowed`).toBe(true);
    }
  });

  it("rejects addresses that are not valid DNS labels", () => {
    expect(checkSubdomain("-leading").reason).toBe("invalid_characters");
    expect(checkSubdomain("trailing-").reason).toBe("invalid_characters");
    expect(checkSubdomain("has space").reason).toBe("invalid_characters");
    expect(checkSubdomain("UPPER").ok).toBe(true); // lowercased first
    expect(checkSubdomain("under_score").reason).toBe("invalid_characters");
    expect(checkSubdomain("dot.ted").reason).toBe("invalid_characters");
  });

  it("enforces the length bounds", () => {
    expect(checkSubdomain("ab").reason).toBe("too_short");
    expect(checkSubdomain("a".repeat(MAX_SUBDOMAIN_LENGTH)).ok).toBe(true);
    expect(checkSubdomain("a".repeat(MAX_SUBDOMAIN_LENGTH + 1)).reason).toBe("too_long");
  });

  it("refuses platform-owned names", () => {
    for (const value of ["www", "api", "admin", "dashboard", "manage"]) {
      expect(checkSubdomain(value).reason, `${value} should be reserved`).toBe("reserved");
    }
  });

  /**
   * The reserved list must be a superset of the labels `proxy.ts` refuses to
   * treat as store subdomains. A name this list allowed and the proxy refused
   * would be an address a merchant could claim, pay attention to, and never
   * reach.
   */
  it("covers every label proxy.ts refuses to route", () => {
    const proxy = readFile("proxy.ts");
    const reserved = proxy.match(/const RESERVED = new Set\(\[([^\]]*)\]\)/);

    expect(reserved, "could not find the RESERVED set in proxy.ts").not.toBeNull();

    const labels = [...reserved![1].matchAll(/'([^']+)'|"([^"]+)"/g)].map(
      (m) => m[1] ?? m[2],
    );

    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(RESERVED_SUBDOMAINS, `proxy.ts reserves "${label}"`).toContain(label);
    }
  });

  /**
   * Mirrors the `merchant_sites_subdomain_format` CHECK. Compared as source
   * text rather than by behaviour, because the two engines are different — the
   * point is that nobody edits one without the other.
   */
  it("matches the CHECK constraint in the migration", () => {
    const migration = readFile(
      "supabase/migrations/20260816140000_website_public_addressing.sql",
    );

    const check = migration.match(/subdomain ~ '([^']+)'/);
    expect(check, "could not find the subdomain CHECK in the migration").not.toBeNull();

    // Postgres anchors with ^…$ exactly as the JS literal does; the only
    // difference is JS's leading slash-delimiters.
    expect(check![1]).toBe(SUBDOMAIN_FORMAT.source);
  });
});

describe("slugifySubdomain", () => {
  it("turns a restaurant name into a usable address", () => {
    expect(slugifySubdomain("Joe's Coffee Shop")).toBe("joe-s-coffee-shop");
    expect(slugifySubdomain("Café München")).toBe("cafe-munchen");
  });

  it("returns empty when nothing usable survives, rather than a bad address", () => {
    expect(slugifySubdomain("!!!")).toBe("");
    expect(slugifySubdomain("ab")).toBe("");
    expect(slugifySubdomain("www")).toBe("");
  });

  it("never returns a trailing hyphen after the length cut", () => {
    const long = `${"a".repeat(MAX_SUBDOMAIN_LENGTH - 1)} extra`;
    const slug = slugifySubdomain(long);

    expect(slug.endsWith("-")).toBe(false);
    expect(checkSubdomain(slug).ok).toBe(true);
  });
});
