import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { pushMenuToConnectedChannels } from "@/app/dashboard/actions/orderout";

/**
 * Internal endpoint invoked from the item/modifier snooze DB trigger
 * (notify_item_snooze_change) via pg_net. Re-pushes the location's active
 * OrderOut menus so an out-of-stock change made anywhere — including directly
 * on the POS (which bypasses the web action's re-push) — propagates to the
 * connected delivery apps. Authenticated by a shared secret; runs server-to-
 * server with the service-role client (no Clerk session).
 */
export async function POST(request: Request) {
  const secret = process.env.INTERNAL_NOTIFICATION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  if (request.headers.get("x-internal-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { location_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const locationId = body.location_id;
  if (!locationId) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();

    // Location must be onboarded + active on OrderOut.
    const { data: restaurant } = await supabase
      .from("orderout_restaurants")
      .select("id, status, merchant_id")
      .eq("location_id", locationId)
      .maybeSingle();

    if (!restaurant || restaurant.status !== "active") {
      return NextResponse.json({ ok: true, skipped: "not_active" });
    }

    // Resolve the merchant's clerk org (push action keys off it).
    let merchantId = restaurant.merchant_id as string | null;
    if (!merchantId) {
      const { data: loc } = await supabase
        .from("locations")
        .select("merchant_id")
        .eq("id", locationId)
        .maybeSingle();
      merchantId = loc?.merchant_id ?? null;
    }
    if (!merchantId) {
      return NextResponse.json({ ok: true, skipped: "no_merchant" });
    }

    const { data: merchant } = await supabase
      .from("merchants")
      .select("clerk_org_id")
      .eq("id", merchantId)
      .maybeSingle();

    const clerkOrgId = merchant?.clerk_org_id;
    if (!clerkOrgId) {
      return NextResponse.json({ ok: true, skipped: "no_org" });
    }

    // Active menu links for this restaurant.
    const { data: links } = await supabase
      .from("orderout_menu_links")
      .select("menu_id")
      .eq("orderout_restaurant_id", restaurant.id)
      .eq("is_active", true);

    if (!links || links.length === 0) {
      return NextResponse.json({ ok: true, skipped: "no_menus" });
    }

    const results = await Promise.allSettled(
      links.map((l) =>
        pushMenuToConnectedChannels({
          clerkOrgId,
          menuId: l.menu_id,
          locationId,
          skipCooldown: true,
          internal: true,
        }),
      ),
    );

    const pushed = results.filter(
      (r) => r.status === "fulfilled" && r.value?.success,
    ).length;

    return NextResponse.json({ ok: true, menus: links.length, pushed });
  } catch (err) {
    console.error("[orderout-resync] failed:", err);
    return NextResponse.json({ error: "resync_failed" }, { status: 500 });
  }
}
