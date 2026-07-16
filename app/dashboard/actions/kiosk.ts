"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveImpersonationFromCookies } from "@/lib/admin/impersonation";
import { LogAuditEvent } from "./audit-logs";
import { getCurrentUserMerchantRole } from "./role-check";

export type KioskTemplateId = "template_a" | "template_b" | "template_c";
export type KioskOrientation = "vertical" | "horizontal";

export interface KioskProfile {
  id: string;
  merchant_id: string;
  location_id: string;
  profile_name: string;
  template_id: KioskTemplateId;
  primary_color: string;
  secondary_color: string | null;
  accent_color: string | null;
  background_color: string;
  text_color: string;
  header_text_color: string | null;
  font_family: string | null;
  logo_url: string | null;
  idle_images_vertical: string[];
  idle_images_horizontal: string[];
  idle_video_vertical: string | null;
  idle_video_horizontal: string | null;
  order_banner_images_vertical: string[];
  order_banner_images_horizontal: string[];
  orientation: KioskOrientation;
  idle_timeout_seconds: number;
  cart_reset_timeout_seconds: number;
  welcome_message: string | null;
  pickup_number_prefix: string | null;
  auto_print_receipt: boolean;
  receipt_email_prompt: boolean;
  receipt_sms_prompt: boolean;
  show_calorie_info: boolean;
  show_allergens: boolean;
  loyalty_enrollment_enabled: boolean;
  tip_screen_enabled: boolean;
  tip_presets: number[];
  is_active: boolean;
  payment_terminal_id: string | null;
  admin_pin_hash: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KioskLocationSummary {
  id: string;
  name: string;
  address: string | null;
  activeProfileCount: number;
  totalProfileCount: number;
}

export interface KioskStationBinding {
  id: string;
  station_name: string;
  station_code: string | null;
  station_number: number | null;
  is_online: boolean | null;
  kiosk_profile_id: string | null;
}

export interface KioskPaymentTerminal {
  id: string;
  terminal_name: string;
  terminal_type: string | null;
  terminal_model: string | null;
  is_active: boolean | null;
}

export interface KioskEditorData {
  location: { id: string; name: string };
  profiles: KioskProfile[];
  stations: KioskStationBinding[];
  paymentTerminals: KioskPaymentTerminal[];
}

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

const uuidSchema = z.string().uuid();
const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a 6-digit hex color.");
const templateSchema = z.enum(["template_a", "template_b", "template_c"]);
const orientationSchema = z.enum(["vertical", "horizontal"]);

const profileInputSchema = z.object({
  id: uuidSchema.optional(),
  location_id: uuidSchema,
  profile_name: z.string().trim().min(1).max(80),
  template_id: templateSchema,
  primary_color: hexColorSchema,
  secondary_color: hexColorSchema.nullable(),
  accent_color: hexColorSchema.nullable(),
  background_color: hexColorSchema,
  text_color: hexColorSchema,
  header_text_color: hexColorSchema.nullable(),
  font_family: z.string().trim().min(1).max(80).nullable(),
  logo_url: z.string().url().nullable(),
  idle_images_vertical: z.array(z.string().url()).max(5),
  idle_images_horizontal: z.array(z.string().url()).max(5),
  idle_video_vertical: z.string().url().nullable(),
  idle_video_horizontal: z.string().url().nullable(),
  order_banner_images_vertical: z.array(z.string().url()).max(5),
  order_banner_images_horizontal: z.array(z.string().url()).max(5),
  orientation: orientationSchema,
  idle_timeout_seconds: z.coerce.number().int().min(15).max(600),
  cart_reset_timeout_seconds: z.coerce.number().int().min(10).max(300),
  welcome_message: z.string().trim().max(120).nullable(),
  pickup_number_prefix: z.string().trim().max(12).nullable(),
  auto_print_receipt: z.boolean(),
  receipt_email_prompt: z.boolean(),
  receipt_sms_prompt: z.boolean(),
  show_calorie_info: z.boolean(),
  show_allergens: z.boolean(),
  loyalty_enrollment_enabled: z.boolean(),
  tip_screen_enabled: z.boolean(),
  tip_presets: z.array(z.coerce.number().int().min(0).max(100)).min(1).max(4),
  is_active: z.boolean(),
  payment_terminal_id: uuidSchema.nullable(),
});

export type KioskProfileInput = z.infer<typeof profileInputSchema>;

function asError(error: unknown, fallback = "Something went wrong") {
  return error instanceof Error ? error.message : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((url): url is string => typeof url === "string") : [];
}

function normalizeProfile(row: unknown): KioskProfile {
  const record = row as Record<string, unknown>;
  const tipPresets = Array.isArray(record.tip_presets)
    ? record.tip_presets.filter((value): value is number => typeof value === "number")
    : [15, 18, 20, 25];

  return {
    id: String(record.id),
    merchant_id: String(record.merchant_id),
    location_id: String(record.location_id),
    profile_name: String(record.profile_name ?? "Default Kiosk"),
    template_id: templateSchema.parse(record.template_id ?? "template_a"),
    primary_color: String(record.primary_color ?? "#0C4FD1"),
    secondary_color: typeof record.secondary_color === "string" ? record.secondary_color : null,
    accent_color: typeof record.accent_color === "string" ? record.accent_color : null,
    background_color: String(record.background_color ?? "#FFFFFF"),
    text_color: String(record.text_color ?? "#0A0A0A"),
    header_text_color: typeof record.header_text_color === "string" ? record.header_text_color : null,
    font_family: typeof record.font_family === "string" ? record.font_family : "Inter",
    logo_url: typeof record.logo_url === "string" ? record.logo_url : null,
    idle_images_vertical: asStringArray(record.idle_images_vertical),
    idle_images_horizontal: asStringArray(record.idle_images_horizontal),
    idle_video_vertical: typeof record.idle_video_vertical === "string" ? record.idle_video_vertical : null,
    idle_video_horizontal: typeof record.idle_video_horizontal === "string" ? record.idle_video_horizontal : null,
    order_banner_images_vertical: asStringArray(record.order_banner_images_vertical),
    order_banner_images_horizontal: asStringArray(record.order_banner_images_horizontal),
    orientation: orientationSchema.parse(record.orientation ?? "vertical"),
    idle_timeout_seconds: Number(record.idle_timeout_seconds ?? 60),
    cart_reset_timeout_seconds: Number(record.cart_reset_timeout_seconds ?? 30),
    welcome_message: typeof record.welcome_message === "string" ? record.welcome_message : "Tap to order",
    pickup_number_prefix: typeof record.pickup_number_prefix === "string" ? record.pickup_number_prefix : "",
    auto_print_receipt: Boolean(record.auto_print_receipt),
    receipt_email_prompt: Boolean(record.receipt_email_prompt ?? true),
    receipt_sms_prompt: Boolean(record.receipt_sms_prompt ?? true),
    show_calorie_info: Boolean(record.show_calorie_info),
    show_allergens: Boolean(record.show_allergens ?? true),
    loyalty_enrollment_enabled: Boolean(record.loyalty_enrollment_enabled ?? true),
    tip_screen_enabled: Boolean(record.tip_screen_enabled ?? true),
    tip_presets: tipPresets,
    is_active: Boolean(record.is_active),
    payment_terminal_id: typeof record.payment_terminal_id === "string" ? record.payment_terminal_id : null,
    admin_pin_hash: typeof record.admin_pin_hash === "string" ? record.admin_pin_hash : null,
    published_at: typeof record.published_at === "string" ? record.published_at : null,
    created_at: String(record.created_at ?? ""),
    updated_at: String(record.updated_at ?? ""),
  };
}

function auditRecord(profile: KioskProfile): Record<string, unknown> {
  return { ...profile };
}

function formatLocationAddress(location: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}) {
  const street = [location.address_line1, location.address_line2].filter(Boolean).join(" ");
  const cityState = [location.city, location.state].filter(Boolean).join(", ");
  return [street, cityState, location.postal_code].filter(Boolean).join(" ") || null;
}

async function assertLocationAccess(locationId: string, write = false) {
  const role = await getCurrentUserMerchantRole();
  if (!role) throw new Error("Unauthorized");
  if (write && !role.isOwnerOrAdmin && !role.isManager) {
    throw new Error("You do not have permission to change kiosk settings.");
  }
  if (!role.isOwnerOrAdmin && !role.assignedLocationIds.includes(locationId)) {
    throw new Error("You do not have access to this location.");
  }

  const supabase = createServerSupabaseClient();
  const { data: location, error } = await supabase
    .from("locations")
    .select("id, name, merchant_id")
    .eq("id", locationId)
    .eq("merchant_id", role.merchantId)
    .single();

  if (error || !location) throw new Error("Location not found");
  return { role, location: location as { id: string; name: string; merchant_id: string } };
}

async function getProfileForAudit(profileId: string) {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("kiosk_profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();
  return data ? normalizeProfile(data) : null;
}

export async function listKioskLocations(): Promise<ActionResult<KioskLocationSummary[]>> {
  try {
    const role = await getCurrentUserMerchantRole();
    if (!role) return { success: false, error: "Unauthorized" };

    const supabase = createServerSupabaseClient();
    let locationsQuery = supabase
      .from("locations")
      .select("id, name, address_line1, address_line2, city, state, postal_code")
      .eq("merchant_id", role.merchantId)
      .order("created_at", { ascending: false });

    if (!role.isOwnerOrAdmin) {
      locationsQuery = locationsQuery.in("id", role.assignedLocationIds);
    }

    const [{ data: locations, error: locationsError }, { data: profiles, error: profilesError }] =
      await Promise.all([
        locationsQuery,
        supabase
          .from("kiosk_profiles")
          .select("id, location_id, is_active")
          .eq("merchant_id", role.merchantId),
      ]);

    if (locationsError) return { success: false, error: locationsError.message };
    if (profilesError) return { success: false, error: profilesError.message };

    const summaries = (locations ?? []).map((location) => {
      const locationProfiles = (profiles ?? []).filter((profile) => profile.location_id === location.id);
      return {
        id: location.id,
        name: location.name,
        address: formatLocationAddress(location),
        activeProfileCount: locationProfiles.filter((profile) => Boolean(profile.is_active)).length,
        totalProfileCount: locationProfiles.length,
      };
    });

    return { success: true, data: summaries };
  } catch (error) {
    return { success: false, error: asError(error) };
  }
}

export async function getKioskProfile(profileId: string): Promise<ActionResult<KioskProfile>> {
  try {
    const id = uuidSchema.parse(profileId);
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.from("kiosk_profiles").select("*").eq("id", id).single();
    if (error || !data) return { success: false, error: error?.message ?? "Profile not found" };
    const profile = normalizeProfile(data);
    await assertLocationAccess(profile.location_id);
    return { success: true, data: profile };
  } catch (error) {
    return { success: false, error: asError(error) };
  }
}

export async function listKioskProfiles(locationId: string): Promise<ActionResult<KioskEditorData>> {
  try {
    const parsedLocationId = uuidSchema.parse(locationId);
    const { location } = await assertLocationAccess(parsedLocationId);
    const supabase = createServerSupabaseClient();

    const [profilesResult, stationsResult, terminalsResult] = await Promise.all([
      supabase
        .from("kiosk_profiles")
        .select("*")
        .eq("location_id", parsedLocationId)
        .order("created_at", { ascending: true }),
      supabase
        .from("stations")
        .select("id, station_name, station_code, station_number, is_online, kiosk_profile_id")
        .eq("location_id", parsedLocationId)
        .eq("station_type", "kiosk")
        .order("station_number", { ascending: true, nullsFirst: false }),
      supabase
        .from("payment_terminals")
        .select("id, terminal_name, terminal_type, terminal_model, is_active")
        .eq("location_id", parsedLocationId)
        .order("terminal_name", { ascending: true }),
    ]);

    if (profilesResult.error) return { success: false, error: profilesResult.error.message };
    if (stationsResult.error) return { success: false, error: stationsResult.error.message };
    if (terminalsResult.error) return { success: false, error: terminalsResult.error.message };

    return {
      success: true,
      data: {
        location,
        profiles: (profilesResult.data ?? []).map(normalizeProfile),
        stations: (stationsResult.data ?? []) as KioskStationBinding[],
        paymentTerminals: (terminalsResult.data ?? []) as KioskPaymentTerminal[],
      },
    };
  } catch (error) {
    return { success: false, error: asError(error) };
  }
}

export async function upsertKioskProfile(input: KioskProfileInput): Promise<ActionResult<KioskProfile>> {
  try {
    const parsed = profileInputSchema.parse(input);
    const { role, location } = await assertLocationAccess(parsed.location_id, true);
    const supabase = createServerSupabaseClient();
    const before = parsed.id ? await getProfileForAudit(parsed.id) : null;

    const payload = {
      ...parsed,
      merchant_id: role.merchantId,
      location_id: location.id,
      secondary_color: parsed.secondary_color || null,
      accent_color: parsed.accent_color || null,
      header_text_color: parsed.header_text_color || null,
      font_family: parsed.font_family || "Inter",
      welcome_message: parsed.welcome_message || "Tap to order",
      pickup_number_prefix: parsed.pickup_number_prefix || "",
      payment_terminal_id: parsed.payment_terminal_id || null,
    };

    const query = parsed.id
      ? supabase.from("kiosk_profiles").update(payload).eq("id", parsed.id).select("*").single()
      : supabase.from("kiosk_profiles").insert(payload).select("*").single();

    const { data, error } = await query;
    if (error || !data) return { success: false, error: error?.message ?? "Profile save failed" };

    const profile = normalizeProfile(data);
    await LogAuditEvent({
      merchantId: role.merchantId,
      locationId: location.id,
      action: before ? `Updated kiosk profile: ${profile.profile_name}` : `Created kiosk profile: ${profile.profile_name}`,
      actionCategory: "settings",
      resourceType: "kiosk_profile",
      resourceId: profile.id,
      resourceName: profile.profile_name,
      changes: { before: before ? auditRecord(before) : undefined, after: auditRecord(profile) },
    });

    revalidatePath("/dashboard/kiosk");
    revalidatePath(`/dashboard/kiosk/${location.id}`);
    return { success: true, data: profile };
  } catch (error) {
    return { success: false, error: asError(error) };
  }
}

export async function publishKioskProfile(profileId: string): Promise<ActionResult<KioskProfile>> {
  try {
    const impersonation = await resolveImpersonationFromCookies().catch(() => null);
    if (impersonation) {
      return { success: false, error: "Carrier impersonation sessions can review kiosk profiles but cannot publish them." };
    }

    const id = uuidSchema.parse(profileId);
    const before = await getProfileForAudit(id);
    if (!before) return { success: false, error: "Profile not found" };
    const { role } = await assertLocationAccess(before.location_id, true);
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("kiosk_profiles")
      .update({ is_active: true, published_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) return { success: false, error: error?.message ?? "Publish failed" };
    const profile = normalizeProfile(data);
    await LogAuditEvent({
      merchantId: role.merchantId,
      locationId: profile.location_id,
      action: `Published kiosk profile: ${profile.profile_name}`,
      actionCategory: "settings",
      resourceType: "kiosk_profile",
      resourceId: profile.id,
      resourceName: profile.profile_name,
      changes: { before: auditRecord(before), after: auditRecord(profile) },
    });

    revalidatePath(`/dashboard/kiosk/${profile.location_id}`);
    return { success: true, data: profile };
  } catch (error) {
    return { success: false, error: asError(error) };
  }
}

export async function cloneKioskProfile(profileId: string, profileName: string): Promise<ActionResult<KioskProfile>> {
  try {
    const id = uuidSchema.parse(profileId);
    const nextName = z.string().trim().min(1).max(80).parse(profileName);
    const source = await getProfileForAudit(id);
    if (!source) return { success: false, error: "Profile not found" };
    const { role } = await assertLocationAccess(source.location_id, true);
    const supabase = createServerSupabaseClient();

    const clonePayload = {
      merchant_id: source.merchant_id,
      location_id: source.location_id,
      profile_name: nextName,
      template_id: source.template_id,
      primary_color: source.primary_color,
      secondary_color: source.secondary_color,
      accent_color: source.accent_color,
      background_color: source.background_color,
      text_color: source.text_color,
      header_text_color: source.header_text_color,
      font_family: source.font_family,
      logo_url: source.logo_url,
      idle_images_vertical: source.idle_images_vertical,
      idle_images_horizontal: source.idle_images_horizontal,
      idle_video_vertical: source.idle_video_vertical,
      idle_video_horizontal: source.idle_video_horizontal,
      order_banner_images_vertical: source.order_banner_images_vertical,
      order_banner_images_horizontal: source.order_banner_images_horizontal,
      orientation: source.orientation,
      idle_timeout_seconds: source.idle_timeout_seconds,
      cart_reset_timeout_seconds: source.cart_reset_timeout_seconds,
      welcome_message: source.welcome_message,
      pickup_number_prefix: source.pickup_number_prefix,
      auto_print_receipt: source.auto_print_receipt,
      receipt_email_prompt: source.receipt_email_prompt,
      receipt_sms_prompt: source.receipt_sms_prompt,
      show_calorie_info: source.show_calorie_info,
      show_allergens: source.show_allergens,
      loyalty_enrollment_enabled: source.loyalty_enrollment_enabled,
      tip_screen_enabled: source.tip_screen_enabled,
      tip_presets: source.tip_presets,
      is_active: false,
      payment_terminal_id: source.payment_terminal_id,
    };

    const { data, error } = await supabase
      .from("kiosk_profiles")
      .insert(clonePayload)
      .select("*")
      .single();

    if (error || !data) return { success: false, error: error?.message ?? "Clone failed" };
    const profile = normalizeProfile(data);
    await LogAuditEvent({
      merchantId: role.merchantId,
      locationId: source.location_id,
      action: `Cloned kiosk profile: ${source.profile_name} to ${profile.profile_name}`,
      actionCategory: "settings",
      resourceType: "kiosk_profile",
      resourceId: profile.id,
      resourceName: profile.profile_name,
      changes: { before: auditRecord(source), after: auditRecord(profile) },
    });

    revalidatePath(`/dashboard/kiosk/${source.location_id}`);
    return { success: true, data: profile };
  } catch (error) {
    return { success: false, error: asError(error) };
  }
}

export async function assignProfileToStation(stationId: string, profileId: string | null): Promise<ActionResult<KioskStationBinding>> {
  try {
    const parsedStationId = uuidSchema.parse(stationId);
    const parsedProfileId = profileId ? uuidSchema.parse(profileId) : null;
    const supabase = createServerSupabaseClient();

    const { data: stationBefore, error: stationError } = await supabase
      .from("stations")
      .select("id, merchant_id, location_id, station_name, station_code, station_number, is_online, kiosk_profile_id")
      .eq("id", parsedStationId)
      .single();

    if (stationError || !stationBefore) return { success: false, error: stationError?.message ?? "Station not found" };
    const { role } = await assertLocationAccess(stationBefore.location_id, true);

    if (parsedProfileId) {
      const profile = await getProfileForAudit(parsedProfileId);
      if (!profile || profile.location_id !== stationBefore.location_id) {
        return { success: false, error: "Profile must belong to the same location as the station." };
      }
    }

    const { data, error } = await supabase
      .from("stations")
      .update({ kiosk_profile_id: parsedProfileId })
      .eq("id", parsedStationId)
      .select("id, station_name, station_code, station_number, is_online, kiosk_profile_id")
      .single();

    if (error || !data) return { success: false, error: error?.message ?? "Station assignment failed" };

    await LogAuditEvent({
      merchantId: role.merchantId,
      locationId: stationBefore.location_id,
      action: `Assigned kiosk profile for station: ${stationBefore.station_name}`,
      actionCategory: "settings",
      resourceType: "station",
      resourceId: stationBefore.id,
      resourceName: stationBefore.station_name,
      changes: {
        before: { kiosk_profile_id: stationBefore.kiosk_profile_id },
        after: { kiosk_profile_id: parsedProfileId },
      },
    });

    revalidatePath(`/dashboard/kiosk/${stationBefore.location_id}`);
    return { success: true, data: data as KioskStationBinding };
  } catch (error) {
    return { success: false, error: asError(error) };
  }
}

export async function setAdminPin(profileId: string, pin: string): Promise<ActionResult<{ hasPin: boolean }>> {
  try {
    const id = uuidSchema.parse(profileId);
    const cleanPin = z.string().regex(/^\d{4,8}$/, "PIN must be 4 to 8 digits.").parse(pin);
    const before = await getProfileForAudit(id);
    if (!before) return { success: false, error: "Profile not found" };
    const { role } = await assertLocationAccess(before.location_id, true);
    const hash = await bcrypt.hash(cleanPin, 12);
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("kiosk_profiles").update({ admin_pin_hash: hash }).eq("id", id);
    if (error) return { success: false, error: error.message };

    await LogAuditEvent({
      merchantId: role.merchantId,
      locationId: before.location_id,
      action: `Updated kiosk admin PIN: ${before.profile_name}`,
      actionCategory: "settings",
      resourceType: "kiosk_profile",
      resourceId: before.id,
      resourceName: before.profile_name,
      changes: { before: { admin_pin_set: Boolean(before.admin_pin_hash) }, after: { admin_pin_set: true } },
    });

    return { success: true, data: { hasPin: true } };
  } catch (error) {
    return { success: false, error: asError(error) };
  }
}

export type KioskAssetType =
  | "logo"
  | "idle_image_vertical"
  | "idle_image_horizontal"
  | "idle_video_vertical"
  | "idle_video_horizontal"
  | "order_banner_image_vertical"
  | "order_banner_image_horizontal";

export async function uploadKioskAsset(
  formData: FormData,
  options: { locationId: string; assetType: KioskAssetType },
): Promise<ActionResult<{ url: string }>> {
  try {
    const locationId = uuidSchema.parse(options.locationId);
    const { role } = await assertLocationAccess(locationId, true);
    const file = formData.get("file");
    if (!(file instanceof File)) return { success: false, error: "No file provided" };

    const imageRule = { max: 5 * 1024 * 1024, types: ["image/png", "image/jpeg"], label: "PNG or JPG up to 5MB" };
    const videoRule = { max: 30 * 1024 * 1024, types: ["video/mp4"], label: "MP4 up to 30MB" };
    const rules = {
      logo: { max: 2 * 1024 * 1024, types: ["image/svg+xml", "image/png"], label: "SVG or PNG up to 2MB" },
      idle_image_vertical: imageRule,
      idle_image_horizontal: imageRule,
      idle_video_vertical: videoRule,
      idle_video_horizontal: videoRule,
      order_banner_image_vertical: imageRule,
      order_banner_image_horizontal: imageRule,
    }[options.assetType];

    if (!rules.types.includes(file.type)) {
      return { success: false, error: `Invalid file type. Expected ${rules.label}.` };
    }
    if (file.size > rules.max) {
      return { success: false, error: `File too large. Expected ${rules.label}.` };
    }

    const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
    const fileName = `kiosk-${options.assetType}-${locationId}-${uuidv4()}.${extension}`;
    const fileBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase.functions.invoke("cdn-upload", {
      method: "POST",
      body: {
        scope: "merchant",
        merchantId: role.merchantId,
        category: "kiosk",
        fileName,
        fileBase64,
        contentType: file.type,
      },
    });

    if (error) return { success: false, error: error.message };
    const response = data as { success?: boolean; cdnUrl?: string; error?: string } | null;
    if (!response?.success || !response.cdnUrl) {
      return { success: false, error: response?.error ?? "Upload failed" };
    }

    return { success: true, data: { url: response.cdnUrl } };
  } catch (error) {
    return { success: false, error: asError(error) };
  }
}
