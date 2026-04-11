// ============================================================================
// dejavoo-whitelist-domain Edge Function
// ============================================================================
// Calls Dejavoo Management API to whitelist/update a storefront domain for a
// TPN. This function intentionally does not require JWT auth and should be
// invoked from trusted backend flows.
// ============================================================================

const DEJAVOO_MANAGEMENT_API_KEY = Deno.env.get("DEJAVOO_MANAGEMENT_API_KEY") ?? "";
const DEJAVOO_MANAGEMENT_API_URL =
  Deno.env.get("DEJAVOO_MANAGEMENT_API_URL") || "https://externalapi.ipospays.com";
const ROOT_DOMAIN = Deno.env.get("NEXT_PUBLIC_ROOT_DOMAIN") || "dexaposai.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    let body: { tpn?: string; storeSlug?: string; storeDomain?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    const tpn = body.tpn?.trim();
    const storeSlug = body.storeSlug?.trim();

    if (!tpn) {
      return jsonResponse({ success: false, error: "tpn is required" }, 400);
    }

    let storeDomain = body.storeDomain?.trim();
    if (!storeDomain) {
      if (!storeSlug) {
        return jsonResponse(
          { success: false, error: "storeDomain or storeSlug is required" },
          400,
        );
      }
      const isDev = ROOT_DOMAIN.includes("localhost");
      storeDomain = isDev
        ? `http://${storeSlug}.localhost:3000`
        : `https://${storeSlug}.${ROOT_DOMAIN}`;
    }

    if (!DEJAVOO_MANAGEMENT_API_KEY) {
      console.warn("[DEJAVOO_WHITELIST_FN] Missing DEJAVOO_MANAGEMENT_API_KEY - skipping");
      return jsonResponse({ success: true, skipped: true });
    }

    const response = await fetch(`${DEJAVOO_MANAGEMENT_API_URL}/v3/tpn/parameters`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: DEJAVOO_MANAGEMENT_API_KEY,
      },
      body: JSON.stringify({
        tpn,
        allowedDomains: [storeDomain],
      }),
    });

    const responseText = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      // ignore non-json payloads
    }

    if (!response.ok) {
      console.error("[DEJAVOO_WHITELIST_FN] Failed:", response.status, responseText);
      return jsonResponse(
        {
          success: false,
          error: `Dejavoo domain whitelist failed (${response.status}): ${
            (data as { message?: string }).message || responseText || "Unknown error"
          }`,
        },
        502,
      );
    }

    return jsonResponse({
      success: true,
      domain: storeDomain,
      response: data,
    });
  } catch (error) {
    console.error("[DEJAVOO_WHITELIST_FN] Unhandled error:", error);
    return jsonResponse(
      {
        success: false,
        error: `Domain whitelist network error: ${String(error)}`,
      },
      500,
    );
  }
});
