/**
 * [C5] Valor refund + void (Direct API).
 *
 * Web sales are card-not-present, so a POS terminal cannot reverse them — refunds
 * and voids for online Valor orders have to run through this rail. `createRefund`
 * returns funds on a settled sale; `voidSale` cancels one that has not yet
 * settled. Both are keyed by the original sale's Valor transaction id.
 *
 * [V-REFUND] UNVERIFIED — the team validated boarding + sale live, NOT refund or
 * void. The endpoint PATHS and `txn_type` VALUES below are inferred from the
 * Direct Sale Token API shape ([V-DST]) and MUST be confirmed against Valor's
 * refund/void reference (and whether partial amounts + rrn keying are supported)
 * before any production use. Everything processor-specific is isolated in THIS
 * file, so a correction never touches valor-adapter.ts or the server action.
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
  VALOR_MAX_AMOUNT_MINOR,
  type ValorMerchantCredentials,
} from "./config";

// [V-REFUND] UNVERIFIED — single point of correction for the transaction :443 host.
const REFUND_PATH = "/?refund";
const VOID_PATH = "/?void";
const REFUND_TXN_TYPE = "refund" as const;
const VOID_TXN_TYPE = "void" as const;

export interface ValorRefundParams {
  /** The original sale's Valor transaction id (`txn_id` from the sale response). */
  transactionId: string;
  /** Omit for a full refund; present for a partial. */
  money?: Money;
  /** Original retrieval reference number, if Valor keys refunds on it as well. */
  rrn?: string;
}

export interface ValorVoidParams {
  /** The original sale's Valor transaction id. */
  transactionId: string;
  reason?: string;
}

export interface ValorReversalRequestBody {
  appid: string;
  appkey: string;
  epi: string;
  txn_type: typeof REFUND_TXN_TYPE | typeof VOID_TXN_TYPE;
  transaction_id: string;
  amount?: string;
  rrn?: string;
  reason?: string;
}

/** Valor's reversal response schema is unspecified; every field is read defensively. */
export interface ValorReversalResponseBody {
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

/** Build the refund request body. Pure — exported for tests. */
export function buildRefundRequestBody(
  credentials: ValorMerchantCredentials,
  params: ValorRefundParams
): ValorReversalRequestBody {
  if (params.money) {
    assertValidMoney(params.money);
    if (params.money.amountMinor === 0) {
      throw new RangeError("Valor will not process a zero-amount refund");
    }
    if (params.money.amountMinor > VALOR_MAX_AMOUNT_MINOR) {
      throw new RangeError(
        `Refund exceeds Valor's $99,999.99 per-transaction cap (received ${formatMinorUnits(
          params.money.amountMinor
        )})`
      );
    }
  }

  return {
    appid: credentials.appId,
    appkey: credentials.appKey,
    epi: credentials.epi,
    txn_type: REFUND_TXN_TYPE,
    transaction_id: params.transactionId,
    ...(params.money ? { amount: formatMinorUnits(params.money.amountMinor) } : {}),
    ...(params.rrn ? { rrn: params.rrn } : {}),
  };
}

/** Build the void request body. Pure — exported for tests. */
export function buildVoidRequestBody(
  credentials: ValorMerchantCredentials,
  params: ValorVoidParams
): ValorReversalRequestBody {
  return {
    appid: credentials.appId,
    appkey: credentials.appKey,
    epi: credentials.epi,
    txn_type: VOID_TXN_TYPE,
    transaction_id: params.transactionId,
    ...(params.reason ? { reason: params.reason } : {}),
  };
}

/**
 * Map a Valor reversal response onto the processor-agnostic result.
 *
 * Same success/declined/error split as a sale: `error` (transport/5xx) means the
 * reversal state is UNKNOWN and the caller must reconcile rather than assume the
 * money moved; `declined` means Valor refused (e.g. already reversed, or a void
 * on a settled txn) and the caller may adapt (void -> refund).
 */
export function toReversalProcessorTransaction(result: {
  status: number;
  body: ValorReversalResponseBody;
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
      extractValorError(result.body) ??
      (transportFailed
        ? "The refund could not be completed right now. Please try again."
        : "The refund was not accepted. Please review and try again."),
    processor: "valor",
    raw: result.body,
  };
}

/** Refund a settled Valor sale (full when `money` is omitted, else partial). */
export async function createRefund(
  options: ValorRequestOptions,
  params: ValorRefundParams
): Promise<ProcessorTransaction> {
  const body = buildRefundRequestBody(options.credentials, params);
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
  const body = buildVoidRequestBody(options.credentials, params);
  const result = await postWithBodyCredentials<ValorReversalResponseBody>(
    VOID_PATH,
    body,
    options
  );
  return toReversalProcessorTransaction(result);
}
