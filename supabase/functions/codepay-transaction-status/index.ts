/**
 * codepay-transaction-status — ask CodePay's host what happened to a sale.
 *
 * Called by a CodePay kiosk when the on-device Register result is unknown
 * (watchdog / unreadable) or the payment window lapsed, BEFORE the kiosk locks
 * for staff. Returns approved / failed / pending / not_found / unavailable /
 * unconfigured for one of our own `CP_<ms>_<station4>` merchant_order_nos.
 *
 * Config: function secret CODEPAY_CLOUD_CONFIG, JSON keyed by location_id,
 * plus an optional shared "default" entry for every other location:
 *   { "default": { app_id, gateway_url, private_key_pem, gateway_public_key? },
 *     "<location uuid>": { merchant_no, app_id, gateway_url,
 *                          private_key_pem, gateway_public_key? } }
 * A location's own entry wins. Under "default" the merchant number comes from
 * the location's newest CodePay sale (Register returns merchant_no on every
 * sale), so a new merchant needs no config change once it has taken one sale.
 * Unset, no usable entry, or no CodePay sale yet → { status: "unconfigured" }
 * and the kiosk keeps its on-device behaviour — this secret is the kill switch.
 *
 * Auth: Clerk session token; the caller must belong to the location's merchant.
 * Every call is audited in merchant_payment_credential_access_log. The private
 * key and the signing string are never logged.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js";
import {
  lookupCodePaySale,
  type CodePayCloudConfig,
  type CodePayLookupResult,
} from "../_shared/codepayCloud.ts";
import {
  verifyClerkCaller,
  verifyLocationAccess,
} from "../_shared/merchantAccess.ts";

const FUNCTION_NAME = "codepay-transaction-status";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Our own kiosk/POS refs only: CP_<13-digit ms epoch>_<≤4 station chars>. */
const REF_PATTERN = /^CP_\d{13}_[A-Za-z0-9]{0,4}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Per-merchant ceiling; a kiosk makes a handful of lookups per sale at most. */
const RATE_LIMIT_PER_MINUTE = 60;
/** CODEPAY_CLOUD_CONFIG key for the credentials shared by every location. */
const DEFAULT_CONFIG_KEY = "default";
/** Newest CodePay sales read for the merchant number and the canary. */
const RECENT_SALES_LIMIT = 20;
const MERCHANT_NO_PATTERN = /^\d{6,20}$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function runInBackground(task: Promise<unknown>): void {
  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(task);
    return;
  }
  task.catch((error) => console.error(`[${FUNCTION_NAME}] background task failed`, error));
}

type ConfigEntry = Partial<CodePayCloudConfig>;
type ConfigSource = "location" | "default";

/**
 * This location's own entry, else the shared "default" one. A default never
 * carries a merchant number (it would send every location's lookups to one
 * merchant); the caller fills it from the location's own CodePay sales.
 */
function configEntryFor(locationId: string): { entry: ConfigEntry; source: ConfigSource } | null {
  const raw = Deno.env.get("CODEPAY_CLOUD_CONFIG");
  if (!raw) return null;
  let all: Record<string, ConfigEntry>;
  try {
    // Raw JSON, or base64 of it (what scripts/codepay-cloud-probe.ts writes, so
    // multi-line PEMs survive the env file).
    const text = raw.trim().startsWith("{")
      ? raw
      : new TextDecoder().decode(Uint8Array.from(atob(raw.trim()), (c) => c.charCodeAt(0)));
    all = JSON.parse(text) as Record<string, ConfigEntry>;
  } catch {
    console.error(`[${FUNCTION_NAME}] CODEPAY_CLOUD_CONFIG is not valid JSON`);
    return null;
  }
  if (all[locationId]) return { entry: all[locationId], source: "location" };
  const shared = all[DEFAULT_CONFIG_KEY];
  if (!shared) return null;
  const { merchant_no: _ignored, ...credentials } = shared;
  return { entry: credentials, source: "default" };
}

function completeConfig(entry: ConfigEntry): CodePayCloudConfig | null {
  if (
    !entry.merchant_no ||
    !entry.app_id ||
    !entry.private_key_pem ||
    !entry.gateway_url?.startsWith("https://")
  ) {
    return null;
  }
  return entry as CodePayCloudConfig;
}

interface RecentSale {
  reference: string;
  status: string;
  capturedAt: string;
  merchantNo: string | null;
}

/**
 * The location's newest CodePay sales, any status: a refunded or voided sale
 * still names the merchant it ran on. Newest first.
 */
async function loadRecentSales(admin: SupabaseClient, locationId: string): Promise<RecentSale[]> {
  const { data, error } = await admin
    .from("order_payments")
    .select(
      "reference_number, status, captured_at, merchant_no:processor_response->codepay_transaction->>merchantNo",
    )
    .eq("location_id", locationId)
    .eq("terminal_type", "codepay")
    .not("captured_at", "is", null)
    .order("captured_at", { ascending: false })
    .limit(RECENT_SALES_LIMIT);
  if (error) {
    console.error(`[${FUNCTION_NAME}] recent sales query failed`, error.message);
    return [];
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    reference: typeof row.reference_number === "string" ? row.reference_number : "",
    status: String(row.status ?? ""),
    capturedAt: String(row.captured_at ?? ""),
    merchantNo:
      typeof row.merchant_no === "string" && MERCHANT_NO_PATTERN.test(row.merchant_no)
        ? row.merchant_no
        : null,
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);
  const caller = await verifyClerkCaller(token);
  if (!caller.ok) return json({ error: "Unauthorized" }, 401);

  let body: { location_id?: unknown; merchant_order_no?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const locationId = typeof body.location_id === "string" ? body.location_id : "";
  const merchantOrderNo =
    typeof body.merchant_order_no === "string" ? body.merchant_order_no : "";
  if (!UUID_PATTERN.test(locationId) || !REF_PATTERN.test(merchantOrderNo)) {
    return json({ error: "location_id and a CP_ merchant_order_no are required" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const access = await verifyLocationAccess(admin, caller.userId, locationId);
  if (!access.ok) return json({ error: "Forbidden" }, access.status);
  if (access.viaHq) {
    console.warn(`[${FUNCTION_NAME}] HQ bypass`, { userId: caller.userId, locationId });
  }

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("merchant_payment_credential_access_log")
    .select("id", { count: "exact", head: true })
    .eq("function_name", FUNCTION_NAME)
    .eq("merchant_id", access.merchantId)
    .gte("called_at", since);
  if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return json({ status: "unavailable", reason: "rate_limited" }, 429);
  }

  let recentSales: Promise<RecentSale[]> | null = null;
  const recent = () => (recentSales ??= loadRecentSales(admin, locationId));

  const found = configEntryFor(locationId);
  let config: CodePayCloudConfig | null = null;
  let unconfiguredReason = found ? "incomplete_config" : "no_config";
  if (found) {
    let merchantNo = found.entry.merchant_no ?? null;
    if (!merchantNo) {
      // Newest sale's merchant: a terminal re-boarded onto a new MID is
      // followed from its first sale on the new one.
      merchantNo = (await recent()).find((s) => s.merchantNo)?.merchantNo ?? null;
      if (!merchantNo) unconfiguredReason = "no_codepay_sale";
    }
    config = merchantNo ? completeConfig({ ...found.entry, merchant_no: merchantNo }) : null;
  }

  // Canary for "not_found": this location's newest captured CodePay sale on the
  // same merchant (settled for ≥2 min, never the ref being asked about). If the
  // API can't see THAT as approved, a "not found" proves nothing and is
  // downgraded. A sale on another merchant number would always look missing.
  const canaryRef = async (): Promise<string | null> => {
    const settledBefore = Date.now() - 120_000;
    const sale = (await recent()).find(
      (s) =>
        s.status === "captured" &&
        s.merchantNo === config?.merchant_no &&
        s.reference.startsWith("CP_") &&
        s.reference !== merchantOrderNo &&
        Date.parse(s.capturedAt) < settledBefore,
    );
    return sale?.reference ?? null;
  };
  const startedAt = Date.now();
  const result: CodePayLookupResult | { status: "unconfigured"; reason: string } = config
    ? await lookupCodePaySale(config, merchantOrderNo, {
        canaryRef,
        orderQueryMethod: config.order_query_method,
      })
    : { status: "unconfigured", reason: unconfiguredReason };
  const latencyMs = Date.now() - startedAt;
  const configSource = config ? found?.source ?? null : null;

  console.log(`[${FUNCTION_NAME}]`, {
    locationId,
    merchantOrderNo,
    configSource,
    merchantNo: config?.merchant_no,
    status: result.status,
    reason: "reason" in result ? result.reason : undefined,
    source: "source" in result ? result.source : undefined,
    latencyMs,
  });

  runInBackground(
    admin
      .from("merchant_payment_credential_access_log")
      .insert({
        merchant_id: access.merchantId,
        function_name: FUNCTION_NAME,
        actor_user_id: caller.userId,
        metadata: {
          location_id: locationId,
          merchant_order_no: merchantOrderNo,
          config_source: configSource,
          merchant_no: config?.merchant_no ?? null,
          status: result.status,
          reason: "reason" in result ? result.reason ?? null : null,
          source: "source" in result ? result.source ?? null : null,
          code: "code" in result ? result.code ?? null : null,
          via_hq: access.viaHq,
          latency_ms: latencyMs,
        },
      })
      .then(({ error }) => {
        if (error) console.error(`[${FUNCTION_NAME}] audit insert failed`, error.message);
      }),
  );

  return json(result);
});
