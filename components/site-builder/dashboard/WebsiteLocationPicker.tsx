"use client";

import { MapPin } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { useLocationStore } from "@/stores/location-store";

/**
 * Shown on website-builder entry routes when the location switcher is on
 * "All locations" and the merchant has several storefronts. The website is one
 * brand-level site, but its pages, hours and prices are per-location, so editing
 * needs a branch chosen first — the same "select a location" step Tables and Tax
 * Rates use when scoped to all.
 *
 * Selecting a branch both syncs the global switcher (store + `x-location-id`
 * cookie) and navigates to the current route with `?location=`, so the server
 * component re-resolves immediately and the rest of the dashboard agrees on the
 * choice.
 */
export function WebsiteLocationPicker({
  locations,
}: {
  locations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const setSelectedLocation = useLocationStore((state) => state.setSelectedLocation);

  const choose = (id: string) => {
    setSelectedLocation(id);
    router.push(`${pathname}?location=${encodeURIComponent(id)}`);
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h2 className="text-lg font-semibold">Select a location</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your website is one site for the whole business, but each location has its own pages,
          hours and prices. Choose a location to manage its website.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {locations.map((location) => (
          <button
            key={location.id}
            type="button"
            onClick={() => choose(location.id)}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <MapPin className="size-4 text-muted-foreground" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{location.name}</span>
              <span className="block text-xs text-muted-foreground">
                Manage this location&rsquo;s website
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
