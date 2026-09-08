/**
 * [C5] Valor refund + void (securelink transaction API).
 *
 * Web sales are card-not-present, so a POS terminal cannot reverse them — refunds
 * and voids for online Valor orders run through this rail. `createRefund` returns
 * funds on a settled sale (full or partial); `voidSale` cancels one that has not
 * yet settled. Both are keyed by the original sale's Valor transaction id
 * (`ref_txn_id`), on the same :443 transaction host + body credentials as the sale.
 *
 * Schema confirmed against Valor docs 2026-08-24:
 *   refund → POST /?refund  txn_type "refund"  { amount, ref_txn_id, sale_refund,
 *            surchargeIndicator, auth_code?, rrn?, invoicenumber? }  (amount REQUIRED,
 *            must be <= the sale amount; a smaller amount is a partial refund)
 *   void   → POST /?void    txn_type "void"    { ref_txn_id, surchargeindicator,
 *            amount? }
 *   success = error_no "S00" + error_code "00"; ids come back as txnid/txn_id.
 *
 * [V-REFUND] Two micro-details remain sandbox-UNVERIFIED and are isolated here for
 * a one-line fix: (a) surcharge-indicator key casing differs between the two docs
 * (surchargeIndicator on refund, surchargeindicator on void); (b) sale_refund is
 * documented as "value 1" (sent as string "1"). Confirm both on first sandbox run.
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
  resolveValorSurchargeIndicator,
  VALOR_MAX_AMOUNT_MINOR,
  type ValorMerchantCredentials,
  type ValorSurchargeIndicator,
} from "./config";

const REFUND_PATH = "/?refund";
const VOID_PATH = "/?void";
/** Card-only, traditional MID — same rationale as the sale's "0". */
export interface ValorRefundParams {
  /** The original sale's Valor transaction id (`ref_txn_id`). Required. */
  transactionId: string;
  /** Refund amount. Valor requires it on every refund (partial = a smaller amount). */
  money: Money;
  /** Optional supporting identifiers from the original sale response. */
  authCode?: string;
  rrn?: string;
  invoiceNumber?: string;
}

export interface ValorVoidParams {
  /** The original sale's Valor transaction id (`ref_txn_id`). Required. */
  transactionId: string;
  /** Optional — Valor lets a void identified by ref_txn_id omit the amount. */
  money?: Money;
}

export interface ValorReversalRequestBody {
  appid: string;
  appkey: string;
  epi: string;
  txn_type: "refund" | "void";
  ref_txn_id: string;
  amount?: string;
  sale_refund?: string;
  surchargeIndicator?: string;
  surchargeindicator?: string;
  auth_code?: string;
  rrn?: string;
  invoicenumber?: string;
}

/** Valor's reversal response schema is unspecified beyond 200/400; read defensively. */
export interface ValorReversalResponseBody {
  error_no?: string;
  error_code?: string;
  txn_id?: string;
  txnid?: string;
  transaction_id?: string;
  approval_code?: string;
  auth_code?: string;
  response_text?: string;
  msg?: string;
  error_message?: string;
  rrn?: string;
  [key: string]: unknown;
}

function assertRefundable(money: Money): void {
  assertValidMoney(money);
  if (money.amountMinor === 0) {
    throw new RangeError("Valor will not process a zero-amount refund");
  }
  if (money.amountMinor > VALOR_MAX_AMOUNT_MINOR) {
    throw new RangeError(
      `Refund exceeds Valor's $99,999.99 per-transaction cap (received ${formatMinorUnits(
        money.amountMinor
      )})`
    );
  }
}

/** Build the refund request body. Pure — exported for tests. */
export function buildRefundRequestBody(
  credentials: ValorMerchantCredentials,
  params: ValorRefundParams,
  surchargeIndicator: ValorSurchargeIndicator = "0"
): ValorReversalRequestBody {
  assertRefundable(params.money);

  return {
    appid: credentials.appId,
    appkey: credentials.appKey,
    epi: credentials.epi,
    txn_type: "refund",
    amount: formatMinorUnits(params.money.amountMinor),
    ref_txn_id: params.transactionId,
    sale_refund: "1",
    surchargeIndicator,
    ...(params.authCode ? { auth_code: params.authCode } : {}),
    ...(params.rrn ? { rrn: params.rrn } : {}),
    ...(params.invoiceNumber ? { invoicenumber: params.invoiceNumber } : {}),
  };
}

/** Build the void request body. Pure — exported for tests. */
export function buildVoidRequestBody(
  credentials: ValorMerchantCredentials,
  params: ValorVoidParams,
  surchargeIndicator: ValorSurchargeIndicator = "0"
): ValorReversalRequestBody {
  if (params.money) assertRefundable(params.money);

  return {
    appid: credentials.appId,
    appkey: credentials.appKey,
    epi: credentials.epi,
    txn_type: "void",
    ref_txn_id: params.transactionId,
    surchargeindicator: surchargeIndicator,
    ...(params.money ? { amount: formatMinorUnits(params.money.amountMinor) } : {}),
  };
}

/**
 * Map a Valor reversal response onto the processor-agnostic result.
 *
 * `error` (transport/5xx) means the reversal state is UNKNOWN — the caller must
 * reconcile, not assume the money moved. `declined` means Valor refused (already
 * reversed, or a void on a settled txn) and the caller may adapt.
 */
export function toReversalProcessorTransaction(result: {
  status: number;
  body: ValorReversalResponseBody;
}): ProcessorTransaction {
  const approved = isValorSuccess(result.body);
  const transportFailed = result.status >= 500 || result.status === 0;

  return {
    outcome: approved ? "approved" : transportFailed ? "error" : "declined",
    transactionId:
      result.body.txn_id ?? result.body.txnid ?? result.body.transaction_id ?? null,
    authCode: result.body.approval_code ?? result.body.auth_code ?? null,
    responseCode: result.body.error_code ?? null,
    responseText:
      result.body.response_text ??
      result.body.msg ??
      result.body.error_message ??
      extractValorError(result.body) ??
      (transportFailed
        ? "The refund could not be completed right now. Please try again."
        : "The refund was not accepted. Please review and try again."),
    processor: "valor",
    raw: result.body,
  };
}

/** Refund a Valor sale (full or partial). `money` is always required by Valor. */
export async function createRefund(
  options: ValorRequestOptions,
  params: ValorRefundParams
): Promise<ProcessorTransaction> {
  const body = buildRefundRequestBody(
    options.credentials,
    params,
    resolveValorSurchargeIndicator(options.credentials.epi)
  );
  const result = await postWithBodyCredentials<ValorReversalResponseBody>(
    REFUND_PATH,
    body,
    options
  );
  return toReversalProcessorTransaction(result);
}

/** Void a Valor sale that has not yet settled. */
export async function voidSale(
  options: ValorRequestOptions,
  params: ValorVoidParams
): Promise<ProcessorTransaction> {
  const body = buildVoidRequestBody(
    options.credentials,
    params,
    resolveValorSurchargeIndicator(options.credentials.epi)
  );
  const result = await postWithBodyCredentials<ValorReversalResponseBody>(
    VOID_PATH,
    body,
    options
  );
  return toReversalProcessorTransaction(result);
}
