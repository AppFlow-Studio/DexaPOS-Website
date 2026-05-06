import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";
import { validateReauthCookie } from "@/lib/pin-reauth";

// Roles stored in members.role that are allowed to reveal PINs
const STAFF_MANAGE_ROLE_CODES = ["merchant.owner", "merchant.admin", "merchant.manager"];

// UUID v4 regex — same as impersonation.ts
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: Request,
  context: { params: Promise<{ memberId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate re-auth cookie (server-enforced 5-min window)
  const cookieStore = await cookies();
  const reauthCookie = cookieStore.get("pin_reauth")?.value;
  if (!reauthCookie || !validateReauthCookie(reauthCookie, userId)) {
    return NextResponse.json(
      { error: "Re-authentication required", code: "REAUTH_REQUIRED" },
      { status: 401 },
    );
  }

  const { memberId } = await context.params;
  let locationId: string;
  try {
    const body = await req.json();
    locationId = body.locationId;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!memberId || !locationId) {
    return NextResponse.json(
      { error: "memberId and locationId are required" },
      { status: 400 },
    );
  }

  const serviceRole = createServiceRoleClient();

  // Resolve the target member — determines which org we're working in
  const { data: targetMember } = await serviceRole
    .from("members")
    .select("staff_profile_id, user_id, organization_id")
    .eq("id", memberId)
    .single();

  if (!targetMember) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  const targetOrgId = targetMember.organization_id;

  // ── Permission check ──────────────────────────────────────────────────────
  // Path 1: requester is a direct member of the target org with a qualifying role
  let canReveal = false;

  const { data: requesterMember, error: memberErr } = await serviceRole
    .from("members")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", targetOrgId)
    .maybeSingle(); // maybeSingle: returns null (not error) when no row found

  if (requesterMember) {
    canReveal = STAFF_MANAGE_ROLE_CODES.includes(requesterMember.role ?? "");
  }

  // Path 2: HQ admin impersonating this merchant — read cookies directly
  // (avoids React.cache which only works inside React render context)
  if (!canReveal) {
    const impMerchantId = cookieStore.get("x-impersonate-merchant-id")?.value;
    const impSessionId = cookieStore.get("x-impersonate-session-id")?.value;

    if (
      impMerchantId && UUID_REGEX.test(impMerchantId) &&
      impSessionId && UUID_REGEX.test(impSessionId)
    ) {
      // Verify session is active and belongs to this user + merchant
      const { data: session } = await serviceRole
        .from("impersonation_sessions")
        .select("id")
        .eq("id", impSessionId)
        .eq("hq_user_id", userId)
        .is("ended_at", null)
        .single();

      if (session) {
        // Verify merchant belongs to the target org
        const { data: merchant } = await serviceRole
          .from("merchants")
          .select("id")
          .eq("id", impMerchantId)
          .eq("clerk_org_id", targetOrgId)
          .single();

        if (merchant) canReveal = true;
      }
    }
  }

  if (!canReveal) {
    console.error("[reveal-pin] permission denied", {
      userId,
      targetOrgId,
      requesterRole: requesterMember?.role ?? null,
      memberErr: memberErr?.message ?? null,
    });
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  // ── Fetch PIN ─────────────────────────────────────────────────────────────
  let pinQuery = serviceRole
    .from("location_members")
    .select("pin_plain, pin_code")
    .eq("location_id", locationId);

  if (targetMember.staff_profile_id) {
    pinQuery = pinQuery.eq("staff_profile_id", targetMember.staff_profile_id);
  } else if (targetMember.user_id) {
    pinQuery = pinQuery.eq("user_id", targetMember.user_id);
  } else {
    return NextResponse.json(
      { error: "Cannot identify staff member" },
      { status: 400 },
    );
  }

  const { data: locationMember, error: pinError } = await pinQuery.single();

  if (pinError || !locationMember) {
    return NextResponse.json(
      { error: "No PIN found for this location" },
      { status: 404 },
    );
  }

  const pin = locationMember.pin_plain ?? locationMember.pin_code;
  if (!pin || !/^\d{4,6}$/.test(pin)) {
    return NextResponse.json(
      { error: "PIN is not in a readable format" },
      { status: 422 },
    );
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  let staffName = "Unknown Staff";
  if (targetMember.staff_profile_id) {
    const { data: sp } = await serviceRole
      .from("staff_profiles")
      .select("first_name, last_name, display_name")
      .eq("id", targetMember.staff_profile_id)
      .single();
    if (sp) {
      staffName = sp.display_name || `${sp.first_name} ${sp.last_name}`.trim();
    }
  }

  LogAuditEvent({
    clerkOrgId: targetOrgId,
    locationId,
    action: "pin_reveal",
    actionCategory: "staff",
    severity: "warning",
    resourceType: "staff_member",
    resourceId: targetMember.staff_profile_id ?? targetMember.user_id ?? memberId,
    resourceName: staffName,
    piiAccessType: "staff_pii_view",
    metadata: {
      target_member_id: memberId,
      target_staff_name: staffName,
      location_id: locationId,
    },
  }).catch((err) => console.error("[reveal-pin] audit log failed:", err));

  const expiresAt = new Date(Date.now() + 10 * 1000).toISOString();
  return NextResponse.json({ pin, expiresAt });
}
