/**
 * [C2] Valor Direct Sale Token + GetClientToken.
 *
 * Two calls, both server-side:
 *
 *  - `getClientToken` mints the short-lived token Passage.js needs to render
 *    the card form. It is the only value of the three credentials that may
 *    reach the browser - the APP key must never leave the server.
 *  - `createSale` charges the card token Passage.js hands back.
 *
 * Sources re-fetched 2026-08-09: [V-DST] direct-sale-token-api,
 * [V-PASS2] documentation-v20.
 */

import {
  assertValidMoney,
  formatMinorUnits,
  type Money,
  type ProcessorTransaction,
} from "../types";
import {
  extractValorError,
  isValorSuccess,
  postWithBodyCredentials,
  type ValorRequestOptions,
} from "./client";
import {
  isValidEpi,
  resolveValorSurchargeIndicator,
  VALOR_MAX_AMOUNT_MINOR,
  ValorConfigError,
  type ValorMerchantCredentials,
  type ValorSurchargeIndicator,
} from "./config";

export { isValorSuccess } from "./client";

/** @deprecated Prefer `ValorRequestOptions` from `./client`. */
export type ValorApiOptions = ValorRequestOptions;

/**
 * Valor uses "0" for a traditional MID and "1" for a surcharge MID. Builders
 * default to "0"; only the sandbox QA EPI resolver may select "1" at runtime.
 */
export interface ValorClientTokenResponse {
  error_no: string;
  error_code: string;
  clientToken: string;
  /** Absolute expiry timestamp, e.g. "2023-01-05 12:44:01". */
  validity: string;
}

/** Response envelope before the clientToken field is known to be present. */
interface ValorEnvelopeWithClientToken extends ValorSaleResponseBody {
  clientToken?: string;
  validity?: string;
}

/** Product line required by [V-DST] when order details are included. */
export interface ValorProductLine {
  product_id: string;
  qty: number;
  modifierIds?: string[];
}

export interface ValorSaleRequestBody {
  appid: string;
  appkey: string;
  epi: string;
  txn_type: "sale" | "auth";
  /** Major units as a string, e.g. "25.50". */
  amount: string;
  token: string;
  invoicenumber: string;
  ecomm_channel: "passagejs";
  surchargeIndicator: ValorSurchargeIndicator;
  shipping_country: string;
  productIds?: ValorProductLine[];
  tax_amount?: string;
  orderdescription?: string;
  phone?: string;
  address1?: string;
  zip?: string;
  email?: string;
  customer_name?: string;
  duplicate_transaction_check?: string;
  avs?: string;
  shouldVaultCard?: string;
}

/**
 * Valor's documented response schema is unspecified beyond HTTP 200/400, so
 * every field is optional and read defensively.
 */
export interface ValorSaleResponseBody {
  error_no?: string;
  error_code?: string;
  txn_id?: string;
  txnid?: string;
  transaction_id?: string;
  approval_code?: string;
  auth_code?: string;
  response_text?: string;
  error_message?: string;
  msg?: string;
  mesg?: string;
  desc?: string;
  rrn?: string;
  [key: string]: unknown;
}

export interface ValorSaleParams {
  money: Money;
  /** Card token from Passage.js `onTokenReceived`. */
  token: string;
  /** Merchant-facing reference. Required by [V-DST] with order details. */
  invoiceNumber: string;
  productLines: ValorProductLine[];
  taxMinor?: number;
  /** Included in `money.amountMinor`; Valor's Passage.js Sale API has no tip field. */
  tipMinor?: number;
  orderDescription?: string;
  email?: string;
  phone?: string;
  address1?: string;
  zip?: string;
  shippingCountry?: string;
}

function assertChargeable(money: Money): void {
  assertValidMoney(money);
  if (money.amountMinor === 0) {
    throw new RangeError("Valor will not process a zero-amount sale");
  }
  if (money.amountMinor > VALOR_MAX_AMOUNT_MINOR) {
    throw new RangeError(
      `Amount exceeds Valor's $99,999.99 per-transaction cap (received ${formatMinorUnits(
        money.amountMinor
      )})`
    );
  }
}

function normalizeOptionalText(
  value: string | undefined,
  maxLength: number
): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return normalized || undefined;
}

function normalizeAlphanumericText(
  value: string | undefined,
  maxLength: number
): string | undefined {
  return normalizeOptionalText(value?.replace(/[^A-Za-z0-9 ]/g, " "), maxLength);
}

function normalizePhone(value: string | undefined): string | undefined {
  const digits = value?.replace(/\D/g, "") ?? "";
  const domestic =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return domestic.length === 10 ? domestic : undefined;
}

function normalizeZip(value: string | undefined): string | undefined {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 5 ? digits.slice(0, 5) : undefined;
}

function normalizeEmail(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length <= 50 ? normalized : undefined;
}

/** Valor accepts a maximum of 12 alphanumeric characters for invoice IDs. */
export function normalizeValorInvoiceNumber(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9]/g, "");
  if (!normalized) {
    throw new RangeError(
      "Valor invoice number must contain an alphanumeric character"
    );
  }
  return normalized.slice(-12);
}

/**
 * Mint a client token for Passage.js.
 *
 * The returned token is short-lived (`validity` is an absolute timestamp) and
 * is safe to pass to the browser. The APP key used to obtain it is not.
 */
export async function getClientToken(
  options: ValorRequestOptions
): Promise<ValorClientTokenResponse> {
  if (!isValidEpi(options.credentials.epi)) {
    throw new ValorConfigError(
      `EPI must be 10 digits beginning with 2, received "${options.credentials.epi}"`
    );
  }

  // GetClientToken is POST /?gptoken on the :443 transaction host with
  // txn_type "clientToken" ([V-create-page-token]). Confirmed live against
  // sandbox - the prior /?saleapi= + txn_type "sale" guess on the :4430 host
  // was rejected with error_no D07.
  const result = await postWithBodyCredentials<
    ValorEnvelopeWithClientToken
  >("/?gptoken", { txn_type: "clientToken" }, options, "transaction");

  if (!isValorSuccess(result.body) || !result.body.clientToken) {
    throw new Error(
      extractValorError(result.body) ??
        `Valor GetClientToken failed (HTTP ${result.status}, error_no ${
          result.body.error_no ?? "none"
        })`
    );
  }

  return result.body as ValorClientTokenResponse;
}

/** Build the Direct Sale Token request body. Pure - exported for testing. */
export function buildSaleRequestBody(
  credentials: ValorMerchantCredentials,
  params: ValorSaleParams,
  surchargeIndicator: ValorSurchargeIndicator = "0"
): ValorSaleRequestBody {
  assertChargeable(params.money);

  const orderDescription = normalizeAlphanumericText(
    params.orderDescription,
    50
  );
  const email = normalizeEmail(params.email);
  const phone = normalizePhone(params.phone);
  const address1 = normalizeAlphanumericText(params.address1, 100);
  const zip = normalizeZip(params.zip);

  return {
    appid: credentials.appId,
    appkey: credentials.appKey,
    epi: credentials.epi,
    txn_type: "sale",
    amount: formatMinorUnits(params.money.amountMinor),
    token: params.token,
    invoicenumber: normalizeValorInvoiceNumber(params.invoiceNumber),
    ecomm_channel: "passagejs",
    surchargeIndicator,
    shipping_country: params.shippingCountry ?? "US",
    ...(params.productLines.length > 0 ? { productIds: params.productLines } : {}),
    ...(params.taxMinor !== undefined
      ? { tax_amount: formatMinorUnits(params.taxMinor) }
      : {}),
    ...(orderDescription ? { orderdescription: orderDescription } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(address1 ? { address1 } : {}),
    ...(zip ? { zip } : {}),
  };
}

/** Map a Valor sale response onto the processor-agnostic result. */
export function toProcessorTransaction(result: {
  status: number;
  body: ValorSaleResponseBody;
}): ProcessorTransaction {
  const approved = isValorSuccess(result.body);
  const declined =
    result.body.error_no === "E98" || result.body.error_code === "E98";
  const gatewayFailed = !approved && !declined;
  const responseText = gatewayFailed
    ? result.body.desc ??
      result.body.error_message ??
      result.body.response_text ??
      result.body.msg ??
      result.body.mesg
    : result.body.msg ??
      result.body.mesg ??
      result.body.response_text ??
      result.body.error_message ??
      result.body.desc;

  return {
    outcome: approved ? "approved" : gatewayFailed ? "error" : "declined",
    transactionId:
      result.body.txn_id ?? result.body.txnid ?? result.body.transaction_id ?? null,
    authCode: result.body.approval_code ?? result.body.auth_code ?? null,
    responseCode: result.body.error_code ?? result.body.error_no ?? null,
    responseText:
      responseText ??
      (gatewayFailed
        ? "Payment service is temporarily unavailable. Please try again."
        : "Your card was declined. Please try another card."),
    processor: "valor",
    raw: result.body,
  };
}

/** Charge a Passage.js card token. */
export async function createSale(
  options: ValorRequestOptions,
  params: ValorSaleParams
): Promise<ProcessorTransaction> {
  const body = buildSaleRequestBody(
    options.credentials,
    params,
    resolveValorSurchargeIndicator(options.credentials.epi)
  );

  const result = await postWithBodyCredentials<ValorSaleResponseBody>(
    "/?sale",
    body,
    options
  );

  return toProcessorTransaction(result);
}
