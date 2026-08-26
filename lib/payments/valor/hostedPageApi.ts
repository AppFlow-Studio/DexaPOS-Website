/**
 * [C2] Valor Hosted Page Sale — the invoice payment rail.
 *
 * Generates a Valor-hosted payment URL that gets emailed or texted to a payer.
 * Because the page is served by Valor, card data never touches DEXA at all —
 * this is the lowest-PCI-scope surface in the system, and the replacement for
 * the current NMI invoice payment page.
 *
 * Source re-fetched 2026-08-09: [V-HPS] hosted-page-sale-api.
 */

import { assertValidMoney, toMajorUnits, type Money } from "../types";
import {
  extractValorError,
  isValorSuccess,
  postWithBodyCredentials,
  type ValorEnvelope,
  type ValorRequestOptions,
} from "./client";
import { VALOR_MAX_AMOUNT_MINOR } from "./config";

/** Per [V-HPS]: "Should be set always 1". */
const EPAGE_ALWAYS = 1 as const;

export interface ValorHostedPageLineItem {
  name?: string;
  qty?: number;
  price?: number;
  modifierItems?: Array<{ name?: string; price?: number }>;
}

export interface ValorHostedPageBody {
  txn_type: string;
  /**
   * Note this is a NUMBER here, unlike Direct Sale Token where the same
   * concept is a string. Valor is inconsistent across endpoints; the type is
   * matched per-endpoint rather than normalized, so the wire format is right.
   */
  amount: number;
  epage: typeof EPAGE_ALWAYS;
  shipping_country: string;
  customer_name: string;
  invoicenumber?: string;
  orderdescription?: string;
  phone?: string;
  email?: string;
  tax?: number;
  redirect_url?: string;
  success_url?: string;
  failure_url?: string;
  never_expire?: string;
  po_number?: string;
  lineItems?: ValorHostedPageLineItem[];
}

export interface ValorHostedPageResponse extends ValorEnvelope {
  [key: string]: unknown;
}

export class ValorHostedPageError extends Error {
  readonly status: number;
  readonly body: ValorEnvelope;

  constructor(message: string, status: number, body: ValorEnvelope) {
    super(message);
    this.name = "ValorHostedPageError";
    this.status = status;
    this.body = body;
  }
}

export interface CreateHostedPageParams {
  money: Money;
  customerName: string;
  invoiceNumber?: string;
  orderDescription?: string;
  email?: string;
  phone?: string;
  taxMinor?: number;
  /** Where Valor sends the payer after a completed payment. */
  successUrl?: string;
  failureUrl?: string;
  redirectUrl?: string;
  shippingCountry?: string;
  neverExpire?: boolean;
  poNumber?: string;
  lineItems?: ValorHostedPageLineItem[];
}

/** Build the Hosted Page Sale body. Pure — exported for testing. */
export function buildHostedPageBody(
  params: CreateHostedPageParams
): ValorHostedPageBody {
  assertValidMoney(params.money);
  if (params.money.amountMinor === 0) {
    throw new RangeError("Valor will not generate a hosted page for $0.00");
  }
  if (params.money.amountMinor > VALOR_MAX_AMOUNT_MINOR) {
    throw new RangeError(
      "Hosted page amount exceeds Valor's $99,999.99 cap"
    );
  }
  if (!params.customerName.trim()) {
    throw new RangeError("customer_name is required by Hosted Page Sale");
  }

  return {
    txn_type: "sale",
    amount: toMajorUnits(params.money.amountMinor),
    epage: EPAGE_ALWAYS,
    shipping_country: params.shippingCountry ?? "US",
    customer_name: params.customerName.trim(),
    ...(params.invoiceNumber ? { invoicenumber: params.invoiceNumber } : {}),
    ...(params.orderDescription
      ? { orderdescription: params.orderDescription }
      : {}),
    ...(params.email ? { email: params.email } : {}),
    ...(params.phone ? { phone: params.phone } : {}),
    ...(params.taxMinor !== undefined
      ? { tax: toMajorUnits(params.taxMinor) }
      : {}),
    ...(params.successUrl ? { success_url: params.successUrl } : {}),
    ...(params.failureUrl ? { failure_url: params.failureUrl } : {}),
    ...(params.redirectUrl ? { redirect_url: params.redirectUrl } : {}),
    ...(params.neverExpire ? { never_expire: "1" } : {}),
    ...(params.poNumber ? { po_number: params.poNumber } : {}),
    ...(params.lineItems ? { lineItems: params.lineItems } : {}),
  };
}

/**
 * Find the generated payment URL in an undocumented response.
 *
 * [V-HPS]'s OpenAPI definition omits the response schema entirely, so the field
 * name is unknown. Known key names are probed first, then any string value that
 * looks like a URL — and if nothing matches, the caller gets a clear error
 * rather than an invoice email containing "undefined".
 */
export function readHostedPageUrl(body: ValorEnvelope): string | null {
  const candidates = [
    "hosted_page_url",
    "hostedPageUrl",
    "payment_url",
    "paymentUrl",
    "url",
    "link",
    "epage_url",
  ];

  for (const key of candidates) {
    const value = body[key];
    if (typeof value === "string" && value.startsWith("http")) return value;
  }

  for (const value of Object.values(body)) {
    if (typeof value === "string" && /^https?:\/\/\S+$/.test(value)) {
      return value;
    }
  }

  return null;
}

/** Generate a hosted payment URL for an invoice. */
export async function createHostedPage(
  options: ValorRequestOptions,
  params: CreateHostedPageParams
): Promise<{ paymentUrl: string; raw: ValorHostedPageResponse }> {
  const body = buildHostedPageBody(params);

  const result = await postWithBodyCredentials<ValorHostedPageResponse>(
    "/?hostedpage",
    body,
    options
  );

  if (result.status >= 400 || !isValorSuccess(result.body)) {
    throw new ValorHostedPageError(
      extractValorError(result.body) ??
        `Valor hostedpage failed (HTTP ${result.status})`,
      result.status,
      result.body
    );
  }

  const paymentUrl = readHostedPageUrl(result.body);
  if (!paymentUrl) {
    throw new ValorHostedPageError(
      "Valor hostedpage returned success but no payment URL could be found in the response. " +
        "The response shape is undocumented — inspect `body` and add the field to readHostedPageUrl.",
      result.status,
      result.body
    );
  }

  return { paymentUrl, raw: result.body };
}
