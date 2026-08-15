import { cache } from "react";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ResolverSources } from "./bindings/resolve";
import { createSupabaseResolverSources } from "./bindings/supabase-sources";

/**
 * Per-request singletons.
 *
 * The builder page renders a canvas by awaiting `renderCanvas` — a Server Action
 * called *in process*, inside the same request. Both sides used to build their
 * own Supabase client, their own site context, and their own resolver sources,
 * so a single page open issued every query twice: `merchants` ×2,
 * `online_store_config` ×2, and `get_menus_for_location` ×2 at 320 KB a time.
 * Measured against staging, that duplication was worth ~860 ms per open.
 *
 * `cache()` is React's request-scoped memo: within one server request every call
 * returns the same value, and the next request starts empty. That is exactly the
 * lifetime we want — **there is no cross-request staleness window for a price to
 * hide in**, so this buys speed without weakening the live-data guarantee that
 * the whole feature rests on (decision A4).
 *
 * Note the boundary this does *not* cross: when the browser invokes
 * `renderCanvas` after an edit, that is a new request with an empty cache, and it
 * pays for its own fetches. Making repeated edits cheap is a separate problem —
 * it needs a narrower menu query, not a longer-lived cache.
 */

/**
 * One Supabase client per request.
 *
 * Also the reason the memos below work at all: `cache()` keys on argument
 * identity, and a freshly constructed client is a new object every time, so any
 * function taking a client as a parameter can never hit its own cache. Keeping
 * the client out of those signatures is what makes them memoisable.
 */
export const getRequestSupabase = cache(() => createServerSupabaseClient());

/**
 * One resolver-sources instance per request, per pricing policy.
 *
 * `createSupabaseResolverSources` already memoises `fetchMenuItems` per
 * merchant+location — but that memo lives on the *instance*, so two instances
 * meant two 320 KB menu fetches. Sharing the instance is what collapses them
 * into one.
 */
export const getResolverSources = cache(
  (deliveryPricingEnabled: boolean): ResolverSources =>
    createSupabaseResolverSources(getRequestSupabase(), { deliveryPricingEnabled }),
);
