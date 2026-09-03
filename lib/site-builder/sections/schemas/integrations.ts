import { z } from "zod";

import { subtitleSchema, titleSchema } from "../primitives";

/**
 * The intentionally short provider list for third-party page embeds.
 *
 * Each provider here has an official iframe contract that can be reconstructed
 * from typed data. Providers that require pasted JavaScript (Tock, Instagram
 * widgets, arbitrary review plugins) do not belong here: copied script is
 * merchant-authored code executing on a DexaPOS subdomain.
 */
export const INTEGRATION_PROVIDERS = ["google-maps", "spotify", "untappd"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

/** A human-meaningful id echoed back to the merchant so they can check it. */
export interface EmbedIdentifier {
  label: string;
  value: string;
}

export interface ResolvedIntegrationEmbed {
  provider: IntegrationProvider;
  src: string;
  title: string;
  height: number;
  allow: string;
  /**
   * The parts of the embed worth showing back.
   *
   * Derived on read from `src` rather than stored beside it, so there is no
   * second copy to fall out of step with the link. Empty for Google Maps: its
   * `pb` blob is not something a merchant can meaningfully verify, and a
   * read-only field showing it would be noise wearing the clothes of a check.
   */
  identifiers: EmbedIdentifier[];
}

/**
 * Everything provider-specific, in one row each.
 *
 * The panel copy lives here rather than in the drawer because it is a fact
 * about the provider, not about the form: "Untappd iframe URL or IDs" is only
 * the right label while `provider` is `untappd`. A fourth provider is one entry
 * in this table plus one resolver — not a new branch in three files.
 */
export interface ProviderSpec {
  /** Provider name, as the merchant knows it. */
  label: string;
  /**
   * The heading an unconfigured section shows, and the iframe's accessible
   * title when the merchant has not given the section one of their own.
   */
  placeholderTitle: string;
  /** Label for the paste field in the settings panel. */
  inputLabel: string;
  /** Help text under that field. */
  help: string;
  /** A real example of the shortest accepted form. */
  placeholder: string;
  /** Shown when nothing in the pasted text resolves. */
  error: string;
}

export const PROVIDER_SPECS: Record<IntegrationProvider, ProviderSpec> = {
  "google-maps": {
    label: "Google Maps",
    placeholderTitle: "Google map",
    inputLabel: "Google Maps embed code or URL",
    help: "In Google Maps choose Share → Embed a map, then paste the whole code or just its link.",
    placeholder: 'https://www.google.com/maps/embed?pb=…',
    error: "That is not a Google Maps embed. Use Share → Embed a map and paste what it gives you.",
  },
  spotify: {
    label: "Spotify",
    placeholderTitle: "Spotify player",
    inputLabel: "Spotify embed code, link or URI",
    help: "In Spotify choose Share → Embed (or Copy link) on any playlist, album or track.",
    placeholder: "https://open.spotify.com/playlist/…",
    error: "That is not a Spotify playlist, album, artist, track, show or episode link.",
  },
  untappd: {
    label: "Untappd",
    placeholderTitle: "Untappd beer menu",
    inputLabel: "Untappd iframe URL or IDs",
    help:
      "Paste the iframe code from Untappd for Business, its business.untappd.com iframe URL, " +
      "or the location/theme IDs (for example 2800/7676). Only the verified IDs are saved.",
    placeholder: "https://business.untappd.com/embeds/iframes/2800/7676",
    error: "That is not an Untappd embed. Paste the iframe from Untappd for Business, or its two IDs.",
  },
};

export const integrationsSchema = z
  .object({
    title: titleSchema.optional(),
    subtitle: subtitleSchema.optional(),
    provider: z.enum(INTEGRATION_PROVIDERS),
    /**
     * A provider share/embed link. Never HTML and never rendered verbatim.
     *
     * What is *stored* is always the canonical URL `resolveIntegrationEmbed`
     * reconstructs, never the merchant's paste — which is what lets the panel
     * accept iframe markup without any markup reaching the document.
     */
    embedUrl: z.string().max(4096),
  })
  .superRefine((value, ctx) => {
    if (!value.embedUrl.trim()) return;
    if (resolveIntegrationEmbed(value.provider, value.embedUrl)) return;

    ctx.addIssue({
      code: "custom",
      path: ["embedUrl"],
      message: PROVIDER_SPECS[value.provider].error,
    });
  });

export type IntegrationsProps = z.infer<typeof integrationsSchema>;

export function integrationsDefaults(): IntegrationsProps {
  return { provider: "google-maps", embedUrl: "" };
}

/**
 * Turns whatever the merchant pasted into the only URL the iframe may load.
 *
 * Three input shapes are accepted, because those are the three things a
 * merchant actually has in their clipboard: the provider's full `<iframe>`
 * snippet, the bare link, or — for Untappd — the two ids on their own.
 *
 * **Markup is unwrapped, not trusted.** Any `src` found in pasted code is
 * pulled out and then faces the *same* validator a typed URL faces, so the
 * boundary has not moved: full iframe markup, `javascript:` URLs, lookalike
 * hosts, credentials and provider mismatches all still end at `null`, and the
 * only thing that can ever come back out is a URL this file rebuilt itself.
 * Nothing the merchant typed is echoed into the document.
 */
export function resolveIntegrationEmbed(
  provider: IntegrationProvider,
  input: string,
): ResolvedIntegrationEmbed | null {
  const resolve = RESOLVERS[provider];

  for (const candidate of candidates(input)) {
    const embed = resolve(candidate);
    if (embed) return embed;
  }
  return null;
}

const RESOLVERS: Record<
  IntegrationProvider,
  (input: string) => ResolvedIntegrationEmbed | null
> = {
  "google-maps": resolveGoogleMaps,
  spotify: resolveSpotify,
  untappd: resolveUntappd,
};

/**
 * The strings worth trying, in order of confidence.
 *
 * The paste itself comes first so a plain link never pays for the markup path,
 * then every `src` attribute found inside it. A snippet carrying more than one
 * iframe yields more than one candidate and the first that validates wins,
 * rather than the paste being refused for containing something extra.
 */
function candidates(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  return [trimmed, ...embeddedSources(trimmed)];
}

const SRC_ATTRIBUTE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

function embeddedSources(input: string): string[] {
  if (!input.includes("<")) return [];
  return [...input.matchAll(SRC_ATTRIBUTE)]
    .map((match) => decodeEntities(match[1] ?? match[2] ?? "").trim())
    .filter(Boolean);
}

/**
 * The handful of entities that appear in a copied embed snippet.
 *
 * Google Maps' own code escapes every `&` between its query parameters, so
 * without this the pasted form of a map resolves to a different URL than the
 * link form of the same map.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function resolveGoogleMaps(input: string): ResolvedIntegrationEmbed | null {
  const url = parseHttpsUrl(input);
  if (!url || url.hostname !== "www.google.com") return null;

  const path = url.pathname.replace(/\/$/, "");
  const v1 = path.match(/^\/maps\/embed\/v1\/(place|view|directions|streetview|search)$/);
  const copiedEmbed = path === "/maps/embed" && Boolean(url.searchParams.get("pb"));

  // Maps Embed API URLs require a browser-visible, referrer-restricted key.
  // The ordinary Google Maps "Share → Embed" URL instead carries `pb`.
  if (v1 && !url.searchParams.get("key")) return null;
  if (!v1 && !copiedEmbed) return null;

  return {
    provider: "google-maps",
    src: url.toString(),
    title: "Google Maps",
    height: 450,
    allow: "fullscreen",
    identifiers: [],
  };
}

function resolveSpotify(input: string): ResolvedIntegrationEmbed | null {
  const uri = input.trim().match(/^spotify:(track|album|artist|playlist|episode|show):([A-Za-z0-9]{10,64})$/);
  if (uri) return spotifyEmbed(uri[1], uri[2]);

  const url = parseHttpsUrl(input);
  if (!url || url.hostname !== "open.spotify.com") return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "embed") parts.shift();
  if (parts.length !== 2) return null;

  const [kind, id] = parts;
  if (!/^(track|album|artist|playlist|episode|show)$/.test(kind)) return null;
  if (!/^[A-Za-z0-9]{10,64}$/.test(id)) return null;
  return spotifyEmbed(kind, id);
}

function spotifyEmbed(kind: string, id: string): ResolvedIntegrationEmbed {
  return {
    provider: "spotify",
    src: `https://open.spotify.com/embed/${kind}/${id}`,
    title: "Spotify",
    height: kind === "track" || kind === "episode" ? 152 : 352,
    allow: "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture",
    identifiers: [
      { label: "Type", value: kind },
      { label: "Spotify ID", value: id },
    ],
  };
}

/**
 * Untappd for Business hosts the beer menu; the two ids are the whole address.
 *
 * `location` picks whose taps, `theme` picks how they are styled. Everything
 * else a merchant might paste — the query string, the surrounding markup, the
 * width and height attributes Untappd suggests — is discarded, which is what
 * the panel means when it says only the verified ids are saved.
 */
function resolveUntappd(input: string): ResolvedIntegrationEmbed | null {
  const bare = input.trim().match(/^(\d{1,10})\s*\/\s*(\d{1,10})$/);
  if (bare) return untappdEmbed(bare[1], bare[2]);

  const url = parseHttpsUrl(input);
  if (!url || url.hostname !== "business.untappd.com") return null;

  const path = url.pathname.match(/^\/embeds\/iframes\/(\d{1,10})\/(\d{1,10})\/?$/);
  if (!path) return null;
  return untappdEmbed(path[1], path[2]);
}

function untappdEmbed(locationId: string, themeId: string): ResolvedIntegrationEmbed {
  return {
    provider: "untappd",
    src: `https://business.untappd.com/embeds/iframes/${locationId}/${themeId}`,
    title: "Untappd beer menu",
    // A draft list is long and cross-origin, so it cannot report its own height.
    // Tall enough that a typical tap list is read rather than scrolled inside a
    // letterbox; the frame scrolls internally past that.
    height: 900,
    allow: "",
    identifiers: [
      { label: "Location ID", value: locationId },
      { label: "Theme ID", value: themeId },
    ],
  };
}

function parseHttpsUrl(input: string): URL | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}
