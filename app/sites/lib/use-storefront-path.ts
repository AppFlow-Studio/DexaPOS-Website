"use client";

import { useCallback } from "react";

/**
 * Returns a function that builds correct paths for storefront navigation.
 * When on subdomain routing (e.g. joes-coffee.localhost:3000), paths are relative (e.g. /checkout).
 * When on direct path routing (e.g. localhost:3000/sites/joes-coffee), paths include the prefix.
 */
export function useStorefrontPath(slug: string) {
  return useCallback(
    (path: string = "") => {
      if (typeof window === "undefined") return `/sites/${slug}${path}`;

      const hostname = window.location.hostname;
      const isSubdomain =
        hostname !== "localhost" &&
        (hostname.endsWith(".localhost") || hostname.endsWith(".dexapos.com"));

      if (isSubdomain) {
        // Middleware prepends /sites/{slug}, so just use the relative path
        return path || "/";
      }
      return `/sites/${slug}${path}`;
    },
    [slug]
  );
}
