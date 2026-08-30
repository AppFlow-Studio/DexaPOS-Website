/**
 * [C2] Valor subscriptions — the SaaS billing rail.
 *
 * This is DEXA charging merchants monthly, not merchants charging customers.
 * Subscriptions run under `VALOR_DEXA_HQ_EPI` (DEXA boarded as a merchant under
 * our own umbrella), against a customer profile + tokenized payment profile
 * created by `customerProfileApi`.
 *
 * Source re-fetched 2026-08-09: [V-SUB] add-subscriptions.
 */

import { assertValidMoney, formatMinorUnits, type Money } from "../types";
import {
  extractValorError,
  isValorSuccess,
  postWithBodyCredentials,
  type ValorEnvelope,
  type ValorRequestOptions,
} from "./client";
import { VALOR_MAX_AMOUNT_MINOR } from "./config";

/** Valor's `recurring_type` enum ([V-SUB]). */
export const RECURRING_TYPE = {
  weekly: "0",
  biWeekly: "1",
  monthly: "2",
  quarterly: "3",
  annually: "4",
  daily: "5",
  runAt: "6",
} as const;

export type RecurringInterval = keyof typeof RECURRING_TYPE;

/** See `saleApi.ts` — web is card-only, so never the cash-discount MID. */
const SURCHARGE_INDICATOR_CARD_ONLY = "0" as const;

/** `is_validate_card`: "0" charges immediately, "1" validates only. */
export const VALIDATE_ONLY = "1" as const;
export const CHARGE_IMMEDIATELY = "0" as const;

export interface ValorSubscriptionPaymentInfo {
  /** Vault references, preferred over raw card details. */
  vault_id?: string;
  payment_id?: string;
  token?: string;
}

export interface ValorAddSubscriptionBody {
  amount: string;
  surchargeAmount: string;
  txn_type: "add_subscription";
  payment_info: ValorSubscriptionPaymentInfo;
  surchargeIndicator: typeof SURCHARGE_INDICATOR_CARD_ONLY;
  recurring_type: string;
  is_validate_card: string;
  shipping_customer_name: string;
  shipping_zip: string;
  billing_customer_name: string;
  billing_zip: string;
  /** YYYYMMDD. */
  subscription_starts_from: string;
  /** A duration, or the literal "never_expired". */
  charge_until: string;
  /** Day-of-week (0–6) or day-of-month (1–30), per `recurring_type`. */
  charge_on: string;
  additional_prompts: Array<{ name: string; value: string }>;
  tax?: string;
  card_holder_name?: string;
  descriptor?: string;
  product_description?: string;
  invoice_no?: string;
  email?: string;
  phone?: string;
  retry_count?: string;
}

export interface ValorSubscriptionResponse extends ValorEnvelope {
  subscription_id?: string | number;
  txn_id?: string | number;
  [key: string]: unknown;
}

export const NEVER_EXPIRES = "never_expired" as const;

/** Format a date as Valor's YYYYMMDD, in UTC. */
export function formatSubscriptionDate(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("subscription start date is invalid");
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Validate `charge_on` against the chosen interval.
 *
 * Valor overloads one field with two meanings — day-of-week for weekly
 * intervals, day-of-month otherwise — so an out-of-range value is easy to send
 * and produces an opaque gateway rejection.
 */
export function assertValidChargeOn(
  interval: RecurringInterval,
  chargeOn: number
): void {
  const isWeekly = interval === "weekly" || interval === "biWeekly";

  if (isWeekly) {
    if (!Number.isInteger(chargeOn) || chargeOn < 0 || chargeOn > 6) {
      throw new RangeError(
        `charge_on must be a day of week 0–6 for a ${interval} subscription, received ${chargeOn}`
      );
    }
    return;
  }

  if (!Number.isInteger(chargeOn) || chargeOn < 1 || chargeOn > 30) {
    throw new RangeError(
      `charge_on must be a day of month 1–30 for a ${interval} subscription, received ${chargeOn}`
    );
  }
}

export interface CreateSubscriptionParams {
  money: Money;
  interval: RecurringInterval;
  /** Day of week (0–6) or day of month (1–30), per interval. */
  chargeOn: number;
  startsOn: Date;
  /** Vault customer id from `createCustomerProfile`. */
  vaultCustomerId: string;
  /** Payment profile id from `attachPaymentProfile`, when Valor returns one. */
  paymentProfileId?: string;
  billingCustomerName: string;
  billingZip: string;
  shippingCustomerName?: string;
  shippingZip?: string;
  chargeUntil?: string;
  taxMinor?: number;
  cardHolderName?: string;
  descriptor?: string;
  productDescription?: string;
  invoiceNo?: string;
  email?: string;
  phone?: string;
  retryCount?: number;
  /** Validate the card without charging. Used for parity dry-runs. */
  validateOnly?: boolean;
}

export interface UpdateSubscriptionParams extends CreateSubscriptionParams {
  subscriptionId: string;
}

/** Build the Add Subscription body. Pure — exported for testing. */
export function buildAddSubscriptionBody(
  params: CreateSubscriptionParams
): ValorAddSubscriptionBody {
  assertValidMoney(params.money);
  if (params.money.amountMinor === 0) {
    throw new RangeError("Valor will not create a zero-amount subscription");
  }
  if (params.money.amountMinor > VALOR_MAX_AMOUNT_MINOR) {
    throw new RangeError(
      `Subscription amount exceeds Valor's $99,999.99 cap (received ${formatMinorUnits(
        params.money.amountMinor
      )})`
    );
  }
  assertValidChargeOn(params.interval, params.chargeOn);

  return {
    amount: formatMinorUnits(params.money.amountMinor),
    // Card-only web: no surcharge is ever added, so the amount is always zero.
    surchargeAmount: "0.00",
    txn_type: "add_subscription",
    payment_info: {
      vault_id: params.vaultCustomerId,
      ...(params.paymentProfileId
        ? { payment_id: params.paymentProfileId }
        : {}),
    },
    surchargeIndicator: SURCHARGE_INDICATOR_CARD_ONLY,
    recurring_type: RECURRING_TYPE[params.interval],
    is_validate_card: params.validateOnly ? VALIDATE_ONLY : CHARGE_IMMEDIATELY,
    shipping_customer_name:
      params.shippingCustomerName ?? params.billingCustomerName,
    shipping_zip: params.shippingZip ?? params.billingZip,
    billing_customer_name: params.billingCustomerName,
    billing_zip: params.billingZip,
    subscription_starts_from: formatSubscriptionDate(params.startsOn),
    charge_until: params.chargeUntil ?? NEVER_EXPIRES,
    charge_on: String(params.chargeOn),
    additional_prompts: [],
    ...(params.taxMinor !== undefined
      ? { tax: formatMinorUnits(params.taxMinor) }
      : {}),
    ...(params.cardHolderName ? { card_holder_name: params.cardHolderName } : {}),
    ...(params.descriptor ? { descriptor: params.descriptor } : {}),
    ...(params.productDescription
      ? { product_description: params.productDescription }
      : {}),
    ...(params.invoiceNo ? { invoice_no: params.invoiceNo } : {}),
    ...(params.email ? { email: params.email } : {}),
    ...(params.phone ? { phone: params.phone } : {}),
    ...(params.retryCount !== undefined
      ? { retry_count: String(params.retryCount) }
      : {}),
  };
}

export interface ValorUpdateSubscriptionBody {
  txn_type: "updateSubscription";
  subscription_id: string;
  amount: string;
  custom_fee: string;
  payment_info: ValorSubscriptionPaymentInfo;
  surchargeIndicator: typeof SURCHARGE_INDICATOR_CARD_ONLY;
  recurring_type: string;
  is_validate_card: string;
  shipping_customer_name: string;
  shipping_zip: string;
  billing_customer_name: string;
  billing_zip: string;
  subscription_starts_from: string;
  charge_until: string;
  charge_on: string;
  failure_notification: "1";
  additional_prompts: Array<{ name: string; value: string }>;
  invoice_no?: string;
  email?: string;
  phone?: string;
}

export type ValorSubscriptionLifecycleAction =
  | "activate"
  | "deactivate"
  | "delete";

const SUBSCRIPTION_LIFECYCLE_CONTRACT = {
  activate: {
    path: "/?activateSub",
    txnType: "activateSubscription",
  },
  deactivate: {
    path: "/?de-Activate",
    txnType: "deactivateSubscription",
  },
  delete: {
    path: "/?deleteSub",
    txnType: "deleteSubscription",
  },
} as const;

export interface ValorSubscriptionLifecycleRequest {
  path: string;
  body: {
    txn_type:
      | "activateSubscription"
      | "deactivateSubscription"
      | "deleteSubscription";
    subscription_id: string;
  };
}

/** Build the documented Valor lifecycle endpoint and payload. */
export function buildSubscriptionLifecycleRequest(
  subscriptionId: string,
  action: ValorSubscriptionLifecycleAction
): ValorSubscriptionLifecycleRequest {
  const normalizedSubscriptionId = subscriptionId.trim();
  if (!normalizedSubscriptionId) {
    throw new RangeError("subscriptionId is required");
  }

  const contract = SUBSCRIPTION_LIFECYCLE_CONTRACT[action];
  return {
    path: contract.path,
    body: {
      txn_type: contract.txnType,
      subscription_id: normalizedSubscriptionId,
    },
  };
}

/** Build Valor's updateSub body for card replacement or past-due recovery. */
export function buildUpdateSubscriptionBody(
  params: UpdateSubscriptionParams
): ValorUpdateSubscriptionBody {
  const addBody = buildAddSubscriptionBody(params);

  if (!params.subscriptionId.trim()) {
    throw new RangeError("subscriptionId is required");
  }

  return {
    txn_type: "updateSubscription",
    subscription_id: params.subscriptionId.trim(),
    amount: addBody.amount,
    custom_fee: "0.00",
    payment_info: addBody.payment_info,
    surchargeIndicator: addBody.surchargeIndicator,
    recurring_type: addBody.recurring_type,
    is_validate_card: addBody.is_validate_card,
    shipping_customer_name: addBody.shipping_customer_name,
    shipping_zip: addBody.shipping_zip,
    billing_customer_name: addBody.billing_customer_name,
    billing_zip: addBody.billing_zip,
    subscription_starts_from: addBody.subscription_starts_from,
    charge_until: addBody.charge_until,
    charge_on: addBody.charge_on,
    failure_notification: "1",
    additional_prompts: addBody.additional_prompts,
    ...(addBody.invoice_no ? { invoice_no: addBody.invoice_no } : {}),
    ...(addBody.email ? { email: addBody.email } : {}),
    ...(addBody.phone ? { phone: addBody.phone } : {}),
  };
}

export class ValorSubscriptionError extends Error {
  readonly status: number;
  readonly body: ValorEnvelope;

  constructor(message: string, status: number, body: ValorEnvelope) {
    super(message);
    this.name = "ValorSubscriptionError";
    this.status = status;
    this.body = body;
  }
}

export async function createSubscription(
  options: ValorRequestOptions,
  params: CreateSubscriptionParams
): Promise<{ subscriptionId: string | null; raw: ValorSubscriptionResponse }> {
  const body = buildAddSubscriptionBody(params);

  const result = await postWithBodyCredentials<ValorSubscriptionResponse>(
    "/?addSub",
    body,
    options
  );

  if (result.status >= 400 || !isValorSuccess(result.body)) {
    throw new ValorSubscriptionError(
      extractValorError(result.body) ??
        `Valor addSub failed (HTTP ${result.status})`,
      result.status,
      result.body
    );
  }

  const id = result.body.subscription_id;
  return {
    subscriptionId: id == null ? null : String(id),
    raw: result.body,
  };
}

/** Replace a subscription payment method; optionally charge the current cycle. */
export async function updateSubscription(
  options: ValorRequestOptions,
  params: UpdateSubscriptionParams
): Promise<{ transactionId: string | null; raw: ValorSubscriptionResponse }> {
  const body = buildUpdateSubscriptionBody(params);
  const result = await postWithBodyCredentials<ValorSubscriptionResponse>(
    "/?updateSub",
    body,
    options
  );

  if (result.status >= 400 || !isValorSuccess(result.body)) {
    throw new ValorSubscriptionError(
      extractValorError(result.body) ??
        `Valor updateSub failed (HTTP ${result.status})`,
      result.status,
      result.body
    );
  }

  const transactionId = result.body.txn_id;
  return {
    transactionId:
      transactionId == null ? null : String(transactionId),
    raw: result.body,
  };
}

/** Pause, resume, or permanently cancel a native Valor subscription. */
export async function changeSubscriptionLifecycle(
  options: ValorRequestOptions,
  subscriptionId: string,
  action: ValorSubscriptionLifecycleAction
): Promise<{ raw: ValorSubscriptionResponse }> {
  const request = buildSubscriptionLifecycleRequest(subscriptionId, action);
  const result = await postWithBodyCredentials<ValorSubscriptionResponse>(
    request.path,
    request.body,
    options
  );

  if (result.status >= 400 || !isValorSuccess(result.body)) {
    throw new ValorSubscriptionError(
      extractValorError(result.body) ??
        `Valor ${action} subscription failed (HTTP ${result.status})`,
      result.status,
      result.body
    );
  }

  return { raw: result.body };
}

export function activateSubscription(
  options: ValorRequestOptions,
  subscriptionId: string
) {
  return changeSubscriptionLifecycle(options, subscriptionId, "activate");
}

export function deactivateSubscription(
  options: ValorRequestOptions,
  subscriptionId: string
) {
  return changeSubscriptionLifecycle(options, subscriptionId, "deactivate");
}

export function deleteSubscription(
  options: ValorRequestOptions,
  subscriptionId: string
) {
  return changeSubscriptionLifecycle(options, subscriptionId, "delete");
}
