/**
 * codepay-transaction-status — ask CodePay's host what happened to a sale.
 *
 * Called by a CodePay kiosk when the on-device Register result is unknown
 * (watchdog / unreadable) or the payment window lapsed, BEFORE the kiosk locks
 * for staff. Returns approved / failed / pending / not_found / unavailable /
 * unconfigured for one of our own `CP_<ms>_<station4>` merchant_order_nos.
 *
 * Config: function secret CODEPAY_CLOUD_CONFIG, JSON keyed by location_id:
 *   { "<location uuid>": { merchant_no, app_id, gateway_url,
 *                          private_key_pem, gateway_public_key? } }
 * Unset (or no entry for the location) → { status: "unconfigured" } and the
 * kiosk keeps its on-device behaviour — this secret is the kill switch.
 *
 * Auth: Clerk session token; the caller must belong to the location's merchant.
 * Every call is audited in merchant_payment_credential_access_log. The private
 * key and the signing string are never logged.
 */
import { createClient } from "npm:@supabase/supabase-js";
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

function loadConfig(locationId: string): CodePayCloudConfig | null {
  const raw = Deno.env.get("CODEPAY_CLOUD_CONFIG");
  if (!raw) return null;
  try {
    // Raw JSON, or base64 of it (what scripts/codepay-cloud-probe.ts writes, so
    // multi-line PEMs survive the env file).
    const text = raw.trim().startsWith("{")
      ? raw
      : new TextDecoder().decode(Uint8Array.from(atob(raw.trim()), (c) => c.charCodeAt(0)));
    const all = JSON.parse(text) as Record<string, Partial<CodePayCloudConfig>>;
    const c = all[locationId];
    if (
      !c?.merchant_no ||
      !c.app_id ||
      !c.private_key_pem ||
      !c.gateway_url?.startsWith("https://")
    ) {
      return null;
    }
    return c as CodePayCloudConfig;
  } catch {
    console.error(`[${FUNCTION_NAME}] CODEPAY_CLOUD_CONFIG is not valid JSON`);
    return null;
  }
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

  const config = loadConfig(locationId);
  // Canary for "not_found": this location's newest captured CodePay sale
  // (settled for ≥2 min, never the ref being asked about). If the API can't
  // see THAT as approved, a "not found" proves nothing and is downgraded.
  const canaryRef = async (): Promise<string | null> => {
    const { data } = await admin
      .from("order_payments")
      .select("reference_number")
      .eq("location_id", locationId)
      .eq("terminal_type", "codepay")
      .eq("status", "captured")
      .like("reference_number", "CP_%")
      .neq("reference_number", merchantOrderNo)
      .lt("captured_at", new Date(Date.now() - 120_000).toISOString())
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data?.reference_number as string | undefined) ?? null;
  };
  const startedAt = Date.now();
  const result: CodePayLookupResult | { status: "unconfigured" } = config
    ? await lookupCodePaySale(config, merchantOrderNo, {
        canaryRef,
        orderQueryMethod: config.order_query_method,
      })
    : { status: "unconfigured" };
  const latencyMs = Date.now() - startedAt;

  console.log(`[${FUNCTION_NAME}]`, {
    locationId,
    merchantOrderNo,
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
