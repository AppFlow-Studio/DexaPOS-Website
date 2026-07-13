import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SyncWhitelistRequest {
  locationId?: string;
  origins?: string[];
}

interface LocationPaymentDeviceRow {
  id: string;
  provider: string;
  whitelist_origins: string[] | null;
  provider_merchant_id: string | null;
  provider_gateway_id: string | null;
  supports_apple_pay: boolean | null;
  use_for_online_ordering: boolean;
  metadata: Record<string, unknown> | null;
  updated_at: string;
  created_at: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function normalizeOrigin(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  try {
    const prefixed = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(prefixed);
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

function readOriginListFromEnv(name: string): string[] {
  const raw = Deno.env.get(name)?.trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((value) => normalizeOrigin(value))
    .filter((value): value is string => Boolean(value));
}

function mergeOrigins(...groups: Array<(string | null | undefined)[] | undefined>) {
  const origins = new Set<string>();

  for (const group of groups) {
    if (!group) continue;
    for (const value of group) {
      const normalized = normalizeOrigin(value);
      if (normalized) {
        origins.add(normalized);
      }
    }
  }

  return Array.from(origins).sort();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        domainWhitelisted: false,
        domainWhitelistSkipped: true,
        domainWhitelistError: "Method not allowed",
      },
      405,
    );
  }

  let body: SyncWhitelistRequest;
  try {
    body = (await req.json()) as SyncWhitelistRequest;
  } catch {
    return jsonResponse(
      {
        success: false,
        domainWhitelisted: false,
        domainWhitelistSkipped: true,
        domainWhitelistError: "Invalid JSON body",
      },
      400,
    );
  }

  const locationId = body.locationId?.trim();
  if (!locationId) {
    return jsonResponse(
      {
        success: false,
        domainWhitelisted: false,
        domainWhitelistSkipped: true,
        domainWhitelistError: "locationId is required",
      },
      400,
    );
  }

  const requestedOrigins = (body.origins ?? [])
    .map((value) => normalizeOrigin(value))
    .filter((value): value is string => Boolean(value));

  if (requestedOrigins.length === 0) {
    return jsonResponse(
      {
        success: false,
        origins: [],
        domainWhitelisted: false,
        domainWhitelistSkipped: true,
        domainWhitelistError: "No valid storefront origins were provided.",
      },
      400,
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: devices, error: devicesError } = await supabase
    .from("location_payment_devices")
    .select(
      "id, provider, whitelist_origins, provider_merchant_id, provider_gateway_id, supports_apple_pay, use_for_online_ordering, metadata, updated_at, created_at",
    )
    .eq("location_id", locationId)
    .eq("is_active", true)
    .order("use_for_online_ordering", { ascending: false })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);

  if (devicesError) {
    return jsonResponse(
      {
        success: false,
        origins: requestedOrigins,
        domainWhitelisted: false,
        domainWhitelistSkipped: false,
        domainWhitelistError: devicesError.message,
      },
      500,
    );
  }

  const device = ((devices as LocationPaymentDeviceRow[] | null) ?? [])[0] ?? null;
  if (!device) {
    return jsonResponse({
      success: true,
      origins: requestedOrigins,
      domainWhitelisted: false,
      domainWhitelistSkipped: true,
      domainWhitelistError:
        "No active online-ordering payment device exists for this location yet.",
      externalSyncPerformed: false,
      externalSyncReason: "no_active_payment_device",
    });
  }

  const defaultOrigins = mergeOrigins(
    readOriginListFromEnv("STOREFRONT_PAYMENT_DEFAULT_ALLOWED_ORIGINS"),
    readOriginListFromEnv("PAYMENT_DEFAULT_ALLOWED_ORIGINS"),
    readOriginListFromEnv("NMI_DEFAULT_ALLOWED_ORIGINS"),
  );
  const mergedOrigins = mergeOrigins(
    requestedOrigins,
    device.whitelist_origins ?? [],
    defaultOrigins,
  );

  const metadataUpdate = {
    ...((device.metadata as Record<string, unknown> | null) ?? {}),
    last_domain_whitelist_sync: {
      synced_at: new Date().toISOString(),
      provider: device.provider,
      requested_origins: requestedOrigins,
      merged_origin_count: mergedOrigins.length,
      external_sync_performed: false,
      external_sync_reason:
        device.provider === "nmi"
          ? "local_device_origin_sync_only"
          : "legacy_provider_portal_sync_not_implemented",
    },
  };

  const { error: updateError } = await supabase
    .from("location_payment_devices")
    .update({
      whitelist_origins: mergedOrigins,
      whitelist_synced_at: new Date().toISOString(),
      metadata: metadataUpdate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", device.id);

  if (updateError) {
    return jsonResponse(
      {
        success: false,
        origins: requestedOrigins,
        paymentDeviceId: device.id,
        provider: device.provider,
        domainWhitelisted: false,
        domainWhitelistSkipped: false,
        domainWhitelistError: updateError.message,
      },
      500,
    );
  }

  return jsonResponse({
    success: true,
    origins: mergedOrigins,
    paymentDeviceId: device.id,
    provider: device.provider,
    domainWhitelisted: true,
    domainWhitelistSkipped: false,
    domainWhitelistError: undefined,
    externalSyncPerformed: false,
    externalSyncReason:
      device.provider === "nmi"
        ? "local_device_origin_sync_only"
        : "legacy_provider_portal_sync_not_implemented",
  });
});
