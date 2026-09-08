import { describe, expect, it } from "vitest";

import { brandSubdomainFromHost, resolveSiteHost } from "../public-url";

/**
 * The address a built site is handed out at, and the address the router accepts.
 *
 * These were two separate definitions — a literal in `public-url.ts` and another
 * in `proxy.ts` — and the gap between them was not theoretical. Every View link,
 * canonical URL and JSON-LD `url` emitted by a development or staging
 * deployment named `dexaposai.com`, where those merchants do not exist, so
 * following one reached the DexaPOS marketing page.
 */

describe("resolveSiteHost", () => {
  it("falls back to the production domain when nothing is configured", () => {
    expect(resolveSiteHost(undefined)).toEqual({
      domain: "dexaposai.com",
      protocol: "https",
    });
    expect(resolveSiteHost("")).toEqual({ domain: "dexaposai.com", protocol: "https" });
    expect(resolveSiteHost("   ")).toEqual({ domain: "dexaposai.com", protocol: "https" });
  });

  it("serves a local root over http, because https://…localhost does not connect", () => {
    expect(resolveSiteHost("localhost:3000")).toEqual({
      domain: "localhost:3000",
      protocol: "http",
    });
    expect(resolveSiteHost("127.0.0.1:3000").protocol).toBe("http");
  });

  it("keeps https for a real host", () => {
    expect(resolveSiteHost("staging.example.com")).toEqual({
      domain: "staging.example.com",
      protocol: "https",
    });
  });

  it("tolerates a value written as a URL", () => {
    // The variable is a host, but it is set by hand and reads like a URL.
    expect(resolveSiteHost("https://example.com/")).toEqual({
      domain: "example.com",
      protocol: "https",
    });
    expect(resolveSiteHost("HTTP://Example.COM").domain).toBe("example.com");
  });
});

describe("brandSubdomainFromHost", () => {
  it("reads the one label in front of the root domain", () => {
    expect(brandSubdomainFromHost("joes-coffee.dexaposai.com", "dexaposai.com")).toBe(
      "joes-coffee",
    );
  });

  it("ignores the port, which a Host header carries and a domain does not", () => {
    expect(brandSubdomainFromHost("joes.localhost:3000", "localhost:3000")).toBe("joes");
  });

  it("returns null for the root domain itself", () => {
    expect(brandSubdomainFromHost("dexaposai.com", "dexaposai.com")).toBeNull();
  });

  it("returns null for an unrelated host", () => {
    expect(brandSubdomainFromHost("example.com", "dexaposai.com")).toBeNull();
    // Not a subdomain — a different domain that merely ends in the same letters.
    expect(brandSubdomainFromHost("notdexaposai.com", "dexaposai.com")).toBeNull();
  });

  it("refuses anything nested deeper than one label", () => {
    // A wildcard certificate covers *.dexaposai.com, so a deeper name reaching
    // the database lookup would widen what a host can address.
    expect(brandSubdomainFromHost("a.b.dexaposai.com", "dexaposai.com")).toBeNull();
  });

  it("refuses the infrastructure names", () => {
    for (const reserved of ["www", "api", "app", "admin", "mail", "cdn", "assets", "static"]) {
      expect(brandSubdomainFromHost(`${reserved}.dexaposai.com`, "dexaposai.com")).toBeNull();
    }
  });

  it("is case-insensitive, as a Host header may be", () => {
    expect(brandSubdomainFromHost("Joes-Coffee.DexaPosAI.com", "dexaposai.com")).toBe(
      "joes-coffee",
    );
  });
});
