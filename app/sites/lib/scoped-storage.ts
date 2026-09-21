import { createJSONStorage, type StateStorage } from "zustand/middleware";

/**
 * Storefront-scoped localStorage for zustand `persist`.
 *
 * `localStorage` is partitioned by *origin*, so genuine subdomain stores
 * (`a.dexaposai.com` vs `b.dexaposai.com`) are already isolated. But every
 * path-routed storefront (`dexaposai.com/sites/{slug}` — what the dashboard
 * preview, QR, and marketing links generate) shares the apex origin, so a single
 * global key like `storefront-cart-storage` is read/written by *every* store on
 * that origin: open store B in another tab and store A's cart bleeds in.
 *
 * We fix that by namespacing the persist key with the active store, derived from
 * the current URL (subdomain label, or the `/sites/{slug}` path segment). On a
 * subdomain the origin already isolates things, so the extra suffix is harmless;
 * on the shared apex origin it gives each store its own bucket. Two different
 * stores can never collide because subdomains and slugs are unique per store.
 */
function activeStoreSlug(): string {
  if (typeof window === "undefined") return "";
  const { hostname, pathname } = window.location;
  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000")
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .split(":")[0];

  // Subdomain routing: `{slug}.dexaposai.com` (or `{slug}.localhost` in dev).
  // The rewrite to `/sites/{slug}` is internal, so the browser path here is the
  // relative one (e.g. `/checkout`) — the store identity lives in the host.
  if (hostname !== root && hostname !== "localhost") {
    if (root && hostname.endsWith(`.${root}`)) {
      return hostname.slice(0, -(root.length + 1));
    }
    if (hostname.endsWith(".localhost")) {
      return hostname.slice(0, -".localhost".length);
    }
  }

  // Path routing on the shared origin: `/sites/{slug}/...`.
  const m = pathname.match(/^\/sites\/([^/]+)/);
  if (m) return decodeURIComponent(m[1]);

  return "";
}

function scopedKey(name: string): string {
  const slug = activeStoreSlug();
  return slug ? `${name}::${slug}` : name;
}

const scopedStateStorage: StateStorage = {
  getItem: (name) =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(scopedKey(name)),
  setItem: (name, value) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(scopedKey(name), value);
    }
  },
  removeItem: (name) => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(scopedKey(name));
    }
  },
};

/**
 * Drop-in `storage` for zustand `persist` that namespaces the base key per
 * storefront. Pass the same base `name` you would normally use.
 */
export const storefrontScopedStorage = createJSONStorage(
  () => scopedStateStorage
);
