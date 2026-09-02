/**
 * Marketing pixels — the IDs a merchant's ad agency needs on the public site.
 *
 * **Called Tracking, not Analytics** (decision W6). Owner's own screen is named
 * Analytics and shows no data whatsoever: no charts, no visitor counts, four
 * text fields and a Save button. That naming is the one clear misstep in the
 * teardown, and it buys a support ticket every time a merchant clicks it
 * expecting numbers. Ours says what it is.
 *
 * The split this rests on: **Reports is your business, Tracking is your
 * marketing.** Order and revenue reporting already lives under Reports, where
 * it is derived from actual orders and is far more accurate than anything
 * pageview analytics could tell you. Rebuilding dashboards nobody trusts is
 * expensive; four validated text inputs are not.
 *
 * Stored in `merchant_sites.integrations`, which has existed and held `{}`
 * since the foundation migration.
 *
 * **Deliberately separate from `online_store_config.google_analytics_id` and
 * `facebook_pixel_id`.** Those belong to the ordering storefront, and reusing
 * them as the source of truth here would force a merchant to measure their
 * marketing site and their checkout as one funnel. Plenty of restaurants want
 * exactly that; plenty want their agency's pixel on the marketing pages and
 * nothing on checkout. Two fields cost nothing and the merge is irreversible.
 *
 * Pure and I/O-free: the settings screen, the script emitter and the tests all
 * read the same specs, so a pattern can never mean one thing in the form and
 * another at render.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────────────────────────────────────

export const TRACKING_PROVIDERS = [
  "facebookPixel",
  "googleAnalytics",
  "googleTagManager",
  "tiktokPixel",
] as const;

export type TrackingProvider = (typeof TRACKING_PROVIDERS)[number];

export interface TrackingProviderSpec {
  id: TrackingProvider;
  label: string;
  /**
   * Doubles as format documentation — `G-`, `GTM-`, the `C4…` shape.
   *
   * Owner's single best detail on this screen, and it costs nothing: a merchant
   * pasting an ID can see at a glance whether they grabbed the right one out of
   * a console full of similar-looking strings.
   */
  placeholder: string;
  /** Where in the provider's own product this ID is found. */
  hint: string;
  /**
   * What a valid ID looks like.
   *
   * Anchored, and restricted to characters that cannot terminate a string
   * literal or open a tag. That is not the primary defence — these values are
   * interpolated into inline script source, so the pattern IS the defence, and
   * it is applied on write *and* again at render.
   */
  pattern: RegExp;
  /** Uppercased before matching, because merchants paste what they copied. */
  uppercase: boolean;
  /** Hosts this provider loads from, for the CSP that does not exist yet. */
  hosts: readonly string[];
}

export const TRACKING_SPECS: Record<TrackingProvider, TrackingProviderSpec> = {
  facebookPixel: {
    id: "facebookPixel",
    label: "Facebook Pixel ID",
    placeholder: "1234567890123456",
    hint: "Meta Events Manager → Data sources → your pixel.",
    pattern: /^\d{8,20}$/,
    uppercase: false,
    hosts: ["https://connect.facebook.net", "https://www.facebook.com"],
  },
  googleAnalytics: {
    id: "googleAnalytics",
    label: "Google Analytics ID",
    placeholder: "G-XXXXXXXXXX",
    hint: "GA4 → Admin → Data streams → your web stream.",
    // GA4 measurement IDs only. A merchant with a Universal Analytics `UA-` id
    // has a property Google switched off in 2023, and silently accepting it
    // would mean a tracking screen that says it is working while nothing is
    // being recorded anywhere.
    pattern: /^G-[A-Z0-9]{6,16}$/,
    uppercase: true,
    hosts: ["https://www.googletagmanager.com", "https://www.google-analytics.com"],
  },
  googleTagManager: {
    id: "googleTagManager",
    label: "Google Tag Manager ID",
    placeholder: "GTM-XXXXXXX",
    hint: "Tag Manager → Workspace → the ID beside your container name.",
    pattern: /^GTM-[A-Z0-9]{5,10}$/,
    uppercase: true,
    hosts: ["https://www.googletagmanager.com"],
  },
  tiktokPixel: {
    id: "tiktokPixel",
    label: "TikTok Pixel ID",
    placeholder: "C4XXXXXXXXXXXXXXXXXX",
    hint: "TikTok Ads Manager → Assets → Events → Web events.",
    pattern: /^[A-Z0-9]{15,25}$/,
    uppercase: true,
    hosts: ["https://analytics.tiktok.com"],
  },
};

/**
 * Google Search Console verification.
 *
 * Not a pixel, and not something Owner offers at all — but it is one of the
 * most frequent restaurant-marketing asks, it is a single constrained token in
 * a single meta tag, and without it a merchant cannot prove to Google that the
 * site is theirs. Grouped here because this is the screen they will look on.
 */
export const searchConsoleSpec = {
  label: "Google Search Console verification",
  placeholder: "AbCdEf1234567890AbCdEf1234567890AbCdEf12345",
  hint: "Search Console → Settings → Ownership verification → HTML tag. Paste the content value only.",
  pattern: /^[A-Za-z0-9_-]{20,120}$/,
} as const;

export interface SiteTracking {
  facebookPixel?: string;
  googleAnalytics?: string;
  googleTagManager?: string;
  tiktokPixel?: string;
  searchConsole?: string;
}

export const DEFAULT_TRACKING: SiteTracking = {};

function idSchema(spec: { pattern: RegExp }, transform: (v: string) => string) {
  return z
    .string()
    .trim()
    .transform(transform)
    .refine((value) => spec.pattern.test(value), {
      message: "That does not look like a valid ID — check the example below the field.",
    });
}

export const siteTrackingSchema = z.object({
  facebookPixel: idSchema(TRACKING_SPECS.facebookPixel, (v) => v).optional(),
  googleAnalytics: idSchema(TRACKING_SPECS.googleAnalytics, (v) => v.toUpperCase()).optional(),
  googleTagManager: idSchema(TRACKING_SPECS.googleTagManager, (v) => v.toUpperCase()).optional(),
  tiktokPixel: idSchema(TRACKING_SPECS.tiktokPixel, (v) => v.toUpperCase()).optional(),
  searchConsole: idSchema(searchConsoleSpec, (v) => v).optional(),
});

/**
 * Completes — and re-validates — a stored tracking block.
 *
 * Field by field, like `resolveBrand`, so one bad ID does not cost the merchant
 * the other three. But note the stronger reason it exists here: these values are
 * interpolated into **inline script source** on a public page. A row written
 * before the pattern was tightened, or edited directly in the database, must not
 * be able to reach that interpolation. This is the boundary that guarantees it,
 * and it runs on every render rather than only on save.
 */
export function resolveTracking(stored: unknown): SiteTracking {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return DEFAULT_TRACKING;

  const source = stored as Record<string, unknown>;
  const out: SiteTracking = {};

  for (const provider of TRACKING_PROVIDERS) {
    const raw = source[provider];
    if (typeof raw !== "string") continue;

    const spec = TRACKING_SPECS[provider];
    const value = spec.uppercase ? raw.trim().toUpperCase() : raw.trim();
    if (spec.pattern.test(value)) out[provider] = value;
  }

  const console_ = source.searchConsole;
  if (typeof console_ === "string" && searchConsoleSpec.pattern.test(console_.trim())) {
    out.searchConsole = console_.trim();
  }

  return out;
}

/**
 * The human name of one tracking field, for an error a merchant will read.
 *
 * "That does not look like a valid ID" is useless on a screen with five of
 * them, and the server only knows the field by its key.
 */
export function trackingFieldLabel(field: string): string {
  if (field === "searchConsole") return searchConsoleSpec.label;
  const spec = TRACKING_SPECS[field as TrackingProvider];
  return spec ? spec.label : field;
}

/** Whether anything at all is configured — decides if the island loads. */
export function hasAnyTracking(tracking: SiteTracking): boolean {
  return TRACKING_PROVIDERS.some((provider) => Boolean(tracking[provider]));
}

/**
 * Every third-party host the configured providers load from.
 *
 * **There is no Content-Security-Policy in this application today** — no
 * `headers()` in `next.config.ts`, no CSP in `middleware.ts`, nothing. So there
 * is no host list to update, and this constant is not currently enforcing
 * anything. It exists so that whoever adds a CSP has the list rather than
 * discovering it one broken pixel at a time, and so that adding a fifth
 * provider is one registry entry rather than a grep.
 */
export function trackingScriptHosts(tracking: SiteTracking): string[] {
  const hosts = new Set<string>();
  for (const provider of TRACKING_PROVIDERS) {
    if (!tracking[provider]) continue;
    for (const host of TRACKING_SPECS[provider].hosts) hosts.add(host);
  }
  return [...hosts].sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// The event vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The complete list of things a built site reports, and the only list.
 *
 * Fixed and typed rather than free strings, because the failure mode of ad-hoc
 * event names is not an error — it is a merchant's agency building a conversion
 * campaign on `order_click` while a later build starts sending `orderClick`,
 * and nobody noticing until the quarter's numbers are wrong.
 *
 * Four of these have nothing to fire them yet: forms, reservations, careers and
 * events are Phases 7 to 10. They are declared now so that those phases add a
 * call site rather than a vocabulary — and so the mapping below is decided once,
 * by someone looking at the whole set, instead of four times by whoever happens
 * to be building each feature.
 */
export const TRACKING_EVENTS = [
  "page_view",
  /** A guest left for the ordering storefront. The closest thing to intent this site has. */
  "order_click",
  "form_submit",
  "reservation_start",
  "reservation_complete",
  "application_submit",
  "event_cta_click",
] as const;

export type TrackingEvent = (typeof TRACKING_EVENTS)[number];

/**
 * How each event is named to each provider.
 *
 * Meta and TikTok both have a small set of *standard* events their optimisation
 * models actually understand, and a `trackCustom` escape hatch that they do
 * not. Mapping to a standard event where an honest one exists — `Schedule` for a
 * completed reservation, `SubmitApplication` for a job application — is the
 * difference between a pixel that reports and a pixel that improves the
 * merchant's ad targeting. Where no honest standard event exists, a custom one
 * is correct: `InitiateCheckout` for someone who merely clicked "Order Online"
 * would be a lie that quietly corrupts the campaign it feeds.
 */
export const EVENT_NAMES: Record<
  TrackingEvent,
  { ga: string; meta: { name: string; standard: boolean }; tiktok: string | null }
> = {
  page_view: { ga: "page_view", meta: { name: "PageView", standard: true }, tiktok: "Pageview" },
  order_click: {
    ga: "order_click",
    meta: { name: "OrderClick", standard: false },
    tiktok: "ClickButton",
  },
  form_submit: { ga: "form_submit", meta: { name: "Lead", standard: true }, tiktok: "SubmitForm" },
  reservation_start: {
    ga: "reservation_start",
    meta: { name: "ReservationStart", standard: false },
    tiktok: "ClickButton",
  },
  reservation_complete: {
    ga: "reservation_complete",
    meta: { name: "Schedule", standard: true },
    tiktok: "CompleteRegistration",
  },
  application_submit: {
    ga: "application_submit",
    meta: { name: "SubmitApplication", standard: true },
    tiktok: "SubmitForm",
  },
  event_cta_click: {
    ga: "event_cta_click",
    meta: { name: "EventCtaClick", standard: false },
    tiktok: "ClickButton",
  },
};

/**
 * The attribute a server-rendered element carries to report a click.
 *
 * Sections are server components and must stay that way — that discipline is
 * what keeps the builder canvas and the public site one render instead of two.
 * So a tracked link does not get an `onClick`; it gets `data-sb-track`, and one
 * delegated listener on the document handles every one of them. Adding tracking
 * to a new button is an attribute, not a client component.
 */
export const TRACK_ATTRIBUTE = "data-sb-track";
/** Reports once when a successful result is rendered, rather than when it is clicked. */
export const TRACK_VIEW_ATTRIBUTE = "data-sb-track-view";

/** `{...trackAttrs('order_click')}` on any server-rendered element. */
export function trackAttrs(event: TrackingEvent): Record<string, string> {
  return { [TRACK_ATTRIBUTE]: event };
}

/** `{...trackViewAttrs('form_submit')}` on a server-rendered success state. */
export function trackViewAttrs(event: TrackingEvent): Record<string, string> {
  return { [TRACK_VIEW_ATTRIBUTE]: event };
}
