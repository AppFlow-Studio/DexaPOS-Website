import { describe, expect, it } from "vitest";

import { addSection } from "../mutations";
import { createStarterPage } from "../page-document";
import { addableKinds, SECTION_REGISTRY } from "../sections/registry";
import {
  integrationsSchema,
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

describe("the embed URL is a security boundary", () => {
  const attacks = [
    "",
    "javascript:alert(1)",
    "<iframe src='https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC'></iframe>",
    "https://open.spotify.com.evil.test/playlist/37i9dQZF1DX4JAvHpjipBk",
    "https://evil.test/www.google.com/maps/embed?pb=x",
    "http://www.google.com/maps/embed?pb=x",
    "https://user:pass@www.google.com/maps/embed?pb=x",
  ];

  it("rejects markup, foreign hosts, insecure URLs and credentials", () => {
    for (const attack of attacks) {
      expect(resolveIntegrationEmbed("google-maps", attack), attack).toBeNull();
      expect(resolveIntegrationEmbed("spotify", attack), attack).toBeNull();
    }
  });

  it("can only produce one of the two allowlisted iframe hosts", () => {
    const samples = [
      resolveIntegrationEmbed("google-maps", "https://www.google.com/maps/embed?pb=map"),
      resolveIntegrationEmbed(
        "spotify",
        "https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy",
      ),
    ];

    for (const sample of samples) {
      expect(sample).not.toBeNull();
      expect(new URL(sample!.src).hostname).toMatch(/^(www\.google\.com|open\.spotify\.com)$/);
    }
  });
});
