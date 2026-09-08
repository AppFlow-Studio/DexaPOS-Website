import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { type BookableLocation, type ReservationsConfig } from "./protocol";

/**
 * The booking widget's configuration, loaded once per public render.
 *
 * **Why this is loaded into the render context and not fetched by the widget.**
 * `ReservationsSection` is a server component that must never be `async`: the
 * builder canvas renders the whole section graph through `renderToStaticMarkup`,
 * which cannot await, and Next refuses `react-dom/server` in any module graph
 * that reaches a client component. So the section cannot fetch, and the widget
 * fetching on mount would put a configuration round trip in front of the guest's
 * first paint — on the one screen where a slow first paint loses the booking.
 *
 * Instead `buildPublicRenderContext` (already async, already public-only) loads
 * this, the section serialises it into its `data-dexa-reservations` attribute,
 * and `ReservationRuntime` portals a widget that already knows everything.
 *
 * **Why a service-role client for a public page.** Every reservation table is
 * RLS'd to `is_merchant_admin` and the public site renders through an anon
 * client, which by design can read none of them. Rather than open those tables
 * to anon, this goes through `get_public_reservation_config` — SECURITY DEFINER,
 * granted to the service role only, returning an allowlist of columns. Same
 * shape as `get_public_reservation_availability`. The service role never leaves
 * the server: this module is `server-only` and the section receives plain data.
 */

interface ConfigRow {
  location_id: string;
  location_name: string | null;
  address: string | null;
  timezone: string | null;
  phone: string | null;
  booking_policy: string | null;
  collect_birthday: boolean | null;
  large_party_phone: string | null;
  cancellation_cutoff_min: number | null;
  min_party_size: number | null;
  max_party_size: number | null;
  max_advance_days: number | null;
}

/**
 * The zone a branch is labelled in when the column is empty.
 *
 * Matches `DEFAULT_RESERVATION_TIMEZONE` in `lib/reservations/local-time.ts`,
 * which the dashboard already falls back to. Duplicating the literal rather than
 * importing keeps this module free of a client-side dependency.
 */
const FALLBACK_TIMEZONE = "America/New_York";

/**
 * Bookable branches for a site, or an empty list.
 *
 * **Never throws.** This runs inside the render of a merchant's home page, and a
 * reservations outage must not blank a restaurant's website. An empty list makes
 * the section fall back to the venue's phone number, which is a worse booking
 * experience and an honest one.
 *
 * **Returns the branch list only — not `approvalMode`**, and the type says so on
 * purpose. Approval mode is one site-wide value while this RPC returns one row
 * per branch, so sourcing it here would either duplicate it N times or require
 * picking a winner among rows that could disagree. `buildPublicRenderContext`
 * merges it in from `brand`, which it already holds. Omitting it from the return
 * type is what stops someone adding it here later as an apparent convenience.
 */
export async function loadReservationsConfig(
  siteId: string,
): Promise<Omit<ReservationsConfig, "approvalMode">> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc("get_public_reservation_config", {
      p_site_id: siteId,
    } as never);

    if (error || !Array.isArray(data)) {
      if (error) console.error("[reservations-config] load failed:", error);
      // Branches only. This function never emits `approvalMode` — see its
      // return type — so the failure paths must not either, or a caller could
      // read a site-wide setting off an outage.
      return { locations: [] };
    }

    const locations = (data as unknown as ConfigRow[]).flatMap((row): BookableLocation[] => {
      if (!row?.location_id) return [];

      // A branch whose bounds came back unusable is a branch that cannot be
      // booked. Dropping it is right: showing it would put the guest in front of
      // a party-size control with no valid values.
      const min = row.min_party_size ?? 1;
      const max = row.max_party_size ?? 0;
      if (max < min || max < 1) return [];

      return [
        {
          id: row.location_id,
          name: row.location_name?.trim() || "Restaurant",
          address: row.address?.trim() || null,
          timezone: row.timezone?.trim() || FALLBACK_TIMEZONE,
          phone: row.phone?.trim() || null,
          bookingPolicy: row.booking_policy?.trim() || null,
          collectBirthday: row.collect_birthday === true,
          largePartyPhone: row.large_party_phone?.trim() || null,
          cancellationCutoffMin: row.cancellation_cutoff_min ?? 120,
          minPartySize: Math.max(1, min),
          maxPartySize: max,
          maxAdvanceDays: row.max_advance_days ?? 60,
        },
      ];
    });

    return { locations };
  } catch (err) {
    console.error("[reservations-config] load threw:", err);
    return { locations: [] };
  }
}
