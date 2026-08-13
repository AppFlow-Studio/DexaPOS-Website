import { describe, expect, it } from "vitest";

import {
  RESERVED_PATH_SEGMENTS,
  checkPagePath,
  slugifyPagePath,
} from "../reserved-paths";

describe("checkPagePath", () => {
  it("allows the home page", () => {
    expect(checkPagePath("").ok).toBe(true);
    expect(checkPagePath("   ").ok).toBe(true);
  });

  it.each(["about", "our-story", "private-events", "menu2", "events/catering"])(
    "allows %s",
    (path) => {
      expect(checkPagePath(path).ok).toBe(true);
    },
  );

  /**
   * The reason this module exists: a built site serves from a catch-all under
   * /sites/[slug], so a page at "checkout" would shadow the merchant's own
   * checkout route.
   */
  it.each(["checkout", "cart", "t", "api", "order", "menu"])(
    "refuses the reserved segment %s",
    (path) => {
      const result = checkPagePath(path);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("reserved");
    },
  );

  it("refuses a reserved segment regardless of case", () => {
    expect(checkPagePath("Checkout").ok).toBe(false);
    expect(checkPagePath("CHECKOUT").ok).toBe(false);
  });

  it("refuses a reserved first segment even when nested", () => {
    expect(checkPagePath("checkout/thanks").reason).toBe("reserved");
  });

  it("allows a reserved word in a later segment", () => {
    expect(checkPagePath("about/menu").ok).toBe(true);
  });

  it.each(["About", "our story", "our_story", "café", "a--b", "-lead", "trail-"])(
    "refuses invalid characters in %s",
    (path) => {
      const result = checkPagePath(path);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("invalid_characters");
    },
  );

  it("refuses leading and trailing slashes", () => {
    expect(checkPagePath("/about").reason).toBe("leading_or_trailing_slash");
    expect(checkPagePath("about/").reason).toBe("leading_or_trailing_slash");
  });

  it("refuses paths that are too long or too deep", () => {
    expect(checkPagePath("a".repeat(200)).reason).toBe("too_long");
    expect(checkPagePath("a/b/c/d").reason).toBe("too_deep");
  });

  it("always returns a message a merchant could act on", () => {
    for (const bad of ["checkout", "About", "/x", "a/b/c/d", "a".repeat(200)]) {
      const result = checkPagePath(bad);
      expect(result.ok).toBe(false);
      expect(result.message, `no message for "${bad}"`).toBeTruthy();
    }
  });

  /**
   * The regex here must stay in step with the `site_pages_path_format` CHECK
   * constraint, or the app will accept addresses the database rejects.
   */
  it("mirrors the database CHECK constraint", () => {
    // Transcribed from the CHECK in
    // supabase/migrations/20260813120000_website_builder_foundation.sql.
    const dbPattern = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;
    for (const path of ["", "about", "our-story", "events/catering", "menu2"]) {
      expect(dbPattern.test(path), `${path} should satisfy the DB constraint`).toBe(true);
      expect(checkPagePath(path).ok).toBe(true);
    }
    for (const path of ["About", "our story", "a--b", "-lead"]) {
      expect(dbPattern.test(path), `${path} should fail the DB constraint`).toBe(false);
      expect(checkPagePath(path).ok).toBe(false);
    }
  });
});

describe("slugifyPagePath", () => {
  it.each([
    ["Our Story", "our-story"],
    ["Private Events", "private-events"],
    ["  Catering  ", "catering"],
    ["Gift Cards & More", "gift-cards-more"],
    ["Café Menu", "cafe-menu"],
  ])("turns %s into %s", (title, expected) => {
    expect(slugifyPagePath(title)).toBe(expected);
  });

  it("returns empty string when nothing usable survives", () => {
    expect(slugifyPagePath("!!!")).toBe("");
    expect(slugifyPagePath("   ")).toBe("");
  });

  it("returns empty string rather than a reserved path", () => {
    expect(slugifyPagePath("Checkout")).toBe("");
  });

  it("only ever produces paths that pass checkPagePath", () => {
    for (const title of ["Our Story", "Private Events!", "2024 Specials", "A"]) {
      const slug = slugifyPagePath(title);
      if (slug !== "") {
        expect(checkPagePath(slug).ok, `${title} → ${slug}`).toBe(true);
      }
    }
  });
});

describe("RESERVED_PATH_SEGMENTS", () => {
  it("covers the online-ordering routes that share the URL space", () => {
    for (const segment of ["checkout", "cart", "t", "track", "order"]) {
      expect(RESERVED_PATH_SEGMENTS).toContain(segment);
    }
  });

  it("is lowercase throughout, since matching lowercases the input", () => {
    for (const segment of RESERVED_PATH_SEGMENTS) {
      expect(segment).toBe(segment.toLowerCase());
    }
  });
});
