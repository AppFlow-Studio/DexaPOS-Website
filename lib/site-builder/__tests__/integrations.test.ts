import { describe, expect, it } from "vitest";

import { addSection } from "../mutations";
import { createStarterPage } from "../page-document";
import { addableKinds, SECTION_REGISTRY } from "../sections/registry";
import {
  INTEGRATION_PROVIDERS,
  integrationsSchema,
  PROVIDER_SPECS,
  resolveIntegrationEmbed,
} from "../sections/schemas/integrations";

describe("the Integrations section contract", () => {
  it("is an ordinary addable body section with valid defaults", () => {
    const def = SECTION_REGISTRY.integrations;
    expect(addableKinds()).toContain("integrations");
    expect(def.editable && def.deletable && def.movable).toBe(true);
    expect(def.zone).toBe("body");
    expect(def.schema.safeParse(def.defaults()).success).toBe(true);

    const added = addSection(createStarterPage({ locationId: "loc_1" }), "integrations");
    expect(added.ok).toBe(true);
  });

  it("requires the selected provider to match the pasted link", () => {
    expect(
      integrationsSchema.safeParse({
        provider: "spotify",
        embedUrl: "https://www.google.com/maps/embed?pb=restaurant-map",
      }).success,
    ).toBe(false);
    expect(
      integrationsSchema.safeParse({
        provider: "google-maps",
        embedUrl: "https://open.spotify.com/playlist/37i9dQZF1DX4JAvHpjipBk",
      }).success,
    ).toBe(false);
    expect(
      integrationsSchema.safeParse({
        provider: "untappd",
        embedUrl: "https://www.google.com/maps/embed?pb=restaurant-map",
      }).success,
    ).toBe(false);
  });

  /**
   * Switching provider strands the old link under a schema that refuses it, and
   * `updateSectionProps` rejects the whole props object rather than repairing
   * it — so the panel would simply go dead. The drawer clears the link in the
   * same patch, which only works because an empty link is a legal state.
   */
  it("accepts an empty link, so switching provider is a state it can pass through", () => {
    for (const provider of INTEGRATION_PROVIDERS) {
      expect(integrationsSchema.safeParse({ provider, embedUrl: "" }).success, provider).toBe(
        true,
      );
    }
  });

  it("declares that the provider selector clears the link", () => {
    const overrides = SECTION_REGISTRY.integrations.fieldOverrides?.({ provider: "untappd" });
    expect(overrides?.provider?.clears).toEqual(["embedUrl"]);
    expect(overrides?.embedUrl?.label).toBe(PROVIDER_SPECS.untappd.inputLabel);
    expect(overrides?.embedUrl?.help).toBe(PROVIDER_SPECS.untappd.help);
  });
});

describe("Google Maps embeds", () => {
  it("accepts a copied Google Maps embed URL", () => {
    const resolved = resolveIntegrationEmbed(
      "google-maps",
      "https://www.google.com/maps/embed?pb=restaurant-map",
    );
    expect(resolved?.provider).toBe("google-maps");
    expect(resolved?.src).toMatch(/^https:\/\/www\.google\.com\/maps\/embed\?/);
  });

  it("accepts an official v1 URL only when it carries an API key", () => {
    expect(
      resolveIntegrationEmbed(
        "google-maps",
        "https://www.google.com/maps/embed/v1/place?key=AIzaExampleKey1234567890&q=Beirut",
      ),
    ).not.toBeNull();
    expect(
      resolveIntegrationEmbed(
        "google-maps",
        "https://www.google.com/maps/embed/v1/place?q=Beirut",
      ),
    ).toBeNull();
  });

  /**
   * A `pb` blob is not something a merchant can read and check, so offering a
   * read-only box containing it would be a confirmation that confirms nothing.
   */
  it("offers no identifiers to read back", () => {
    expect(
      resolveIntegrationEmbed("google-maps", "https://www.google.com/maps/embed?pb=map")
        ?.identifiers,
    ).toEqual([]);
  });
});

describe("Spotify embeds", () => {
  it("turns a share URL into a canonical embed URL and drops its tracking query", () => {
    const resolved = resolveIntegrationEmbed(
      "spotify",
      "https://open.spotify.com/playlist/37i9dQZF1DX4JAvHpjipBk?si=tracking-token",
    );
    expect(resolved).toMatchObject({
      provider: "spotify",
      src: "https://open.spotify.com/embed/playlist/37i9dQZF1DX4JAvHpjipBk",
      height: 352,
    });
  });

  it("accepts a Spotify URI and uses the compact height for a track", () => {
    const resolved = resolveIntegrationEmbed(
      "spotify",
      "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
    );
    expect(resolved?.src).toBe(
      "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC",
    );
    expect(resolved?.height).toBe(152);
  });
});

describe("Untappd beer menus", () => {
  const canonical = "https://business.untappd.com/embeds/iframes/2800/7676";

  it.each([
    ["the bare ids", "2800/7676"],
    ["the ids with stray spacing", "  2800 / 7676  "],
    ["the iframe URL", canonical],
    ["a trailing slash", canonical + "/"],
    ["the URL with a query string", canonical + "?utm_source=x"],
    [
      "the pasted iframe snippet",
      '<iframe src="' + canonical + '" width="100%" height="800"></iframe>',
    ],
    ["a single-quoted snippet", "<iframe src='" + canonical + "'></iframe>"],
  ])("accepts %s", (_label, input) => {
    expect(resolveIntegrationEmbed("untappd", input)?.src).toBe(canonical);
  });

  it("reads the location and theme ids back for the merchant to check", () => {
    expect(resolveIntegrationEmbed("untappd", canonical)?.identifiers).toEqual([
      { label: "Location ID", value: "2800" },
      { label: "Theme ID", value: "7676" },
    ]);
  });

  it("refuses ids that are not ids", () => {
    for (const input of ["2800", "2800/", "abc/def", "2800/7676/9", "/2800/7676"]) {
      expect(resolveIntegrationEmbed("untappd", input), input).toBeNull();
    }
  });
});

describe("pasted embed code", () => {
  it("unwraps a Spotify snippet to the same URL as the bare link", () => {
    const bare = resolveIntegrationEmbed(
      "spotify",
      "https://open.spotify.com/playlist/37i9dQZF1DX4JAvHpjipBk",
    );
    const pasted = resolveIntegrationEmbed(
      "spotify",
      '<iframe style="border-radius:12px" ' +
        'src="https://open.spotify.com/embed/playlist/37i9dQZF1DX4JAvHpjipBk?utm_source=generator" ' +
        'width="100%" height="352" frameBorder="0"></iframe>',
    );
    expect(pasted?.src).toBe(bare?.src);
  });

  /**
   * Google's own snippet escapes every `&` between its query parameters, so
   * without entity decoding the pasted form of a map would resolve to a
   * different URL than the link form of the very same map.
   */
  it("decodes the entities in a copied Google Maps snippet", () => {
    const resolved = resolveIntegrationEmbed(
      "google-maps",
      '<iframe src="https://www.google.com/maps/embed?pb=!1m18!3m3&amp;zoom=15&amp;hl=en" ' +
        'width="600" height="450" style="border:0;" allowfullscreen loading="lazy"></iframe>',
    );
    expect(resolved?.src).toContain("&zoom=15");
    expect(resolved?.src).not.toContain("&amp;");
  });

  it("takes the first source in a snippet that actually validates", () => {
    const resolved = resolveIntegrationEmbed(
      "untappd",
      '<img src="https://evil.test/tracker.gif">' +
        '<iframe src="https://business.untappd.com/embeds/iframes/11/22"></iframe>',
    );
    expect(resolved?.src).toBe("https://business.untappd.com/embeds/iframes/11/22");
  });

  it("gives every provider the panel copy the drawer needs", () => {
    for (const provider of INTEGRATION_PROVIDERS) {
      const spec = PROVIDER_SPECS[provider];
      expect(spec.label, provider).toBeTruthy();
      expect(spec.placeholderTitle, provider).toBeTruthy();
      expect(spec.inputLabel, provider).toBeTruthy();
      expect(spec.help, provider).toBeTruthy();
      expect(spec.error, provider).toBeTruthy();
    }
  });
});

describe("the embed URL is a security boundary", () => {
  /**
   * Markup is no longer on this list, because unwrapping it is now the point.
   * Nothing was loosened by that: a `src` pulled out of a snippet faces the
   * identical validator a typed URL faces, so every entry here fails for
   * exactly the reason it always did — bare or wrapped in an iframe tag, as the
   * second test asserts directly.
   */
  const attacks = [
    "",
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "https://open.spotify.com.evil.test/playlist/37i9dQZF1DX4JAvHpjipBk",
    "https://evil.test/www.google.com/maps/embed?pb=x",
    "http://www.google.com/maps/embed?pb=x",
    "https://user:pass@www.google.com/maps/embed?pb=x",
    "https://business.untappd.com.evil.test/embeds/iframes/2800/7676",
    "https://user:pass@business.untappd.com/embeds/iframes/2800/7676",
  ];

  it("rejects foreign hosts, insecure URLs and credentials", () => {
    for (const provider of INTEGRATION_PROVIDERS) {
      for (const attack of attacks) {
        expect(resolveIntegrationEmbed(provider, attack), provider + " <- " + attack).toBeNull();
      }
    }
  });

  it("rejects the same payloads when they arrive wrapped in markup", () => {
    for (const provider of INTEGRATION_PROVIDERS) {
      for (const attack of attacks) {
        const wrapped = '<iframe src="' + attack + '"></iframe>';
        expect(resolveIntegrationEmbed(provider, wrapped), provider + " <- " + wrapped).toBeNull();
      }
    }
  });

  it("never lets srcdoc, a script tag or an event handler through", () => {
    const payloads = [
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '<script src="https://evil.test/x.js"></script>',
      '<img src="x" onerror="alert(1)">',
      '<iframe onload="alert(1)"></iframe>',
    ];

    for (const provider of INTEGRATION_PROVIDERS) {
      for (const payload of payloads) {
        expect(resolveIntegrationEmbed(provider, payload), payload).toBeNull();
      }
    }
  });

  it("can only ever produce an allowlisted iframe host", () => {
    const samples = [
      resolveIntegrationEmbed("google-maps", "https://www.google.com/maps/embed?pb=map"),
      resolveIntegrationEmbed(
        "spotify",
        "https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy",
      ),
      resolveIntegrationEmbed("untappd", "2800/7676"),
    ];

    for (const sample of samples) {
      expect(sample).not.toBeNull();
      expect(new URL(sample!.src).hostname).toMatch(
        /^(www\.google\.com|open\.spotify\.com|business\.untappd\.com)$/,
      );
    }
  });

  /**
   * The stored value is a URL this file rebuilt from parsed parts, so no
   * substring of a hostile paste can ride along inside it.
   */
  it("keeps nothing of the paste but the parts it validated", () => {
    const resolved = resolveIntegrationEmbed(
      "untappd",
      '<iframe src="https://business.untappd.com/embeds/iframes/2800/7676?token=secret" ' +
        'onload="alert(1)" width="100%"></iframe>',
    );
    expect(resolved?.src).toBe("https://business.untappd.com/embeds/iframes/2800/7676");
    expect(resolved?.src).not.toContain("token");
    expect(resolved?.src).not.toContain("alert");
  });
});
