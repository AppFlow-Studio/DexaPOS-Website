import { headers } from "next/headers";

/**
 * Resolves the public app origin used to build hosted links (receipts, invoices).
 * Prefers NEXT_PUBLIC_APP_URL when set; falls back to the current request's host
 * header (and x-forwarded-proto where present). Without this, deployments that
 * forget to set NEXT_PUBLIC_APP_URL emit relative paths in SMS/email links
 * ("/invoice/..." with no https:// prefix).
 *
 * Extracted from send-receipt.ts so the invoice send pipeline reuses the exact
 * same resolution (the ticket's getReceiptBaseUrl()/RECEIPT_PUBLIC_BASE_URL
 * never existed — this is the real helper).
 */
export async function resolveAppUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (envUrl) return envUrl;
  try {
    const h = await headers();
    const host = h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ??
        (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // headers() is not available in this context — fall through.
  }
  return "";
}
