/**
 * [C2] Valor Direct Sale Token + GetClientToken.
 *
 * Two calls, both server-side:
 *
 *  - `getClientToken` mints the short-lived token Passage.js needs to render
 *    the card form. It is the only value of the three credentials that may
 *    reach the browser — the APP key must never leave the server.
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
  VALOR_MAX_AMOUNT_MINOR,
  ValorConfigError,
  type ValorMerchantCredentials,
} from "./config";

export { isValorSuccess } from "./client";

/** @deprecated Prefer `ValorRequestOptions` from `./client`. */
export type ValorApiOptions = ValorRequestOptions;

/**
 * Web checkout is card-only, so every sale runs on the traditional MID with no
 * added fee — `"0"` per [V-DST]:
 *
 *   "The value '0' represents a transaction being ran on the traditional MID
 *    with no custom fee added, while '1' represents a transaction being ran on
 *    the cash discounting MID with the custom fee added"
 *
 * Merchants are boarded surcharge-enabled, so the boarding config and this
 * value deliberately disagree. Sending "1" here would add an unauthorized
 * surcharge to a customer's card. It is a constant, not a parameter, so no
 * call site can pass the wrong one.
 *
 * Note it is the *string* "0" — the arch parent's excerpt shows a numeric 0.
 */
const SURCHARGE_INDICATOR_CARD_ONLY = "0" as const;

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
  surchargeIndicator: typeof SURCHARGE_INDICATOR_CARD_ONLY;
  shipping_country: string;
  productIds: ValorProductLine[];
  tax_amount?: string;
  cardholdername?: string;
  orderdescription?: string;
  phone?: string;
  address1?: string;
  zip?: string;
  email?: string;
  customer_name?: string;
  duplicate_transaction_check?: string;
  avs?: string;
  tip?: string;
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
  transaction_id?: string;
  approval_code?: string;
  auth_code?: string;
  response_text?: string;
  error_message?: string;
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
  tipMinor?: number;
  cardholderName?: string;
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

/**
 * Mint a client token for Passage.js.
 *
 * The returned token is short-lived (`validity` is an absolute timestamp) and
 * is safe to pass to the browser. The APP key used to obtain it is not.
 */
export async function getClientToken(
  options: ValorRequestOptions,
  txnType: "sale" | "auth" = "sale"
): Promise<ValorClientTokenResponse> {
  if (!isValidEpi(options.credentials.epi)) {
    throw new ValorConfigError(
      `EPI must be 10 digits beginning with 2, received "${options.credentials.epi}"`
    );
  }

  const result = await postWithBodyCredentials<
    ValorEnvelopeWithClientToken
  >("/?saleapi=", { txn_type: txnType }, options, "clientToken");

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

/** Build the Direct Sale Token request body. Pure — exported for testing. */
export function buildSaleRequestBody(
  credentials: ValorMerchantCredentials,
  params: ValorSaleParams
): ValorSaleRequestBody {
  assertChargeable(params.money);

  return {
    appid: credentials.appId,
    appkey: credentials.appKey,
    epi: credentials.epi,
    txn_type: "sale",
    amount: formatMinorUnits(params.money.amountMinor),
    token: params.token,
    invoicenumber: params.invoiceNumber,
    surchargeIndicator: SURCHARGE_INDICATOR_CARD_ONLY,
    shipping_country: params.shippingCountry ?? "US",
    productIds: params.productLines,
    ...(params.taxMinor !== undefined
      ? { tax_amount: formatMinorUnits(params.taxMinor) }
      : {}),
    ...(params.tipMinor !== undefined
      ? { tip: formatMinorUnits(params.tipMinor) }
      : {}),
    ...(params.cardholderName ? { cardholdername: params.cardholderName } : {}),
    ...(params.orderDescription
      ? { orderdescription: params.orderDescription }
      : {}),
    ...(params.email ? { email: params.email } : {}),
    ...(params.phone ? { phone: params.phone } : {}),
    ...(params.address1 ? { address1: params.address1 } : {}),
    ...(params.zip ? { zip: params.zip } : {}),
  };
}

/** Map a Valor sale response onto the processor-agnostic result. */
export function toProcessorTransaction(result: {
  status: number;
  body: ValorSaleResponseBody;
}): ProcessorTransaction {
  const approved = isValorSuccess(result.body);
  const transportFailed = result.status >= 500 || result.status === 0;

  return {
    outcome: approved ? "approved" : transportFailed ? "error" : "declined",
    transactionId: result.body.txn_id ?? result.body.transaction_id ?? null,
    authCode: result.body.approval_code ?? result.body.auth_code ?? null,
    responseCode: result.body.error_code ?? null,
    responseText:
      result.body.response_text ??
      result.body.error_message ??
      (transportFailed
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
  const body = buildSaleRequestBody(options.credentials, params);

  const result = await postWithBodyCredentials<ValorSaleResponseBody>(
    "/?saleToken",
    body,
    options
  );

  return toProcessorTransaction(result);
}
