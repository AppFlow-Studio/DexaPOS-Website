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
export const INTEGRATION_PROVIDERS = ["google-maps", "spotify"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export interface ResolvedIntegrationEmbed {
  provider: IntegrationProvider;
  src: string;
  title: string;
  height: number;
  allow: string;
}

export const integrationsSchema = z
  .object({
    title: titleSchema.optional(),
    subtitle: subtitleSchema.optional(),
    provider: z.enum(INTEGRATION_PROVIDERS),
    /** A provider share/embed link. Never HTML and never rendered verbatim. */
    embedUrl: z.string().max(4096),
  })
  .superRefine((value, ctx) => {
    if (!value.embedUrl.trim()) return;
    if (resolveIntegrationEmbed(value.provider, value.embedUrl)) return;

    ctx.addIssue({
      code: "custom",
      path: ["embedUrl"],
      message:
        value.provider === "google-maps"
          ? "Paste a Google Maps embed URL"
          : "Paste a Spotify share or embed URL",
    });
  });

export type IntegrationsProps = z.infer<typeof integrationsSchema>;

export function integrationsDefaults(): IntegrationsProps {
  return { provider: "google-maps", embedUrl: "" };
}

/**
 * Turns a merchant-pasted provider link into the only URL the iframe may load.
 *
 * Full iframe markup, javascript URLs, lookalike hosts, credentials and provider
 * mismatches all return null. Spotify query strings are discarded; Google Maps
 * parameters are retained because they are the map definition itself.
 */
export function resolveIntegrationEmbed(
  provider: IntegrationProvider,
  input: string,
): ResolvedIntegrationEmbed | null {
  return provider === "google-maps" ? resolveGoogleMaps(input) : resolveSpotify(input);
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
