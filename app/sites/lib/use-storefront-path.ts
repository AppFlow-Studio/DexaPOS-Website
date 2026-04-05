"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Returns a function that builds correct paths for storefront navigation.
 * When on subdomain routing (e.g. joes-coffee.localhost:3000), paths are relative (e.g. /checkout).
 * When on direct path routing (e.g. localhost:3000/sites/joes-coffee), paths include the prefix.
 *
 * Uses useState+useEffect instead of typeof window so that SSR and the initial
 * client render agree (both produce /sites/{slug}), preventing hydration mismatches.
 */
export function useStorefrontPath(slug: string) {
  const [isSubdomain, setIsSubdomain] = useState(false);

  useEffect(() => {
    const hostname = window.location.hostname;
    setIsSubdomain(
      hostname !== "localhost" &&
        (hostname.endsWith(".localhost") || hostname.endsWith(".dexaposai.com"))
    );
  }, []);

  return useCallback(
    (path: string = "") => {
      if (isSubdomain) {
        // Middleware prepends /sites/{slug}, so just use the relative path
        return path || "/";
      }
      return `/sites/${slug}${path}`;
    },
    [slug, isSubdomain]
  );
}
