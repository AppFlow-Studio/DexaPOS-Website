/**
 * [C2] Processor-agnostic payment contract.
 *
 * Every web payment surface (storefront checkout, invoices, SaaS subscription
 * billing) talks to this interface instead of a named processor. NMI and Valor
 * each provide an implementation, which is what makes the per-merchant cutover
 * a data change (`merchant_processor_accounts.is_primary`) rather than a code
 * change, and what makes rollback instant.
 *
 * Ticket: [C2] lib/payments — Valor service module + PaymentProcessor interface
 * Schema: [C1] merchant_processor_accounts
 */

export type ProcessorName = "nmi" | "valor";

/** Mirrors the `purpose` check constraint on `merchant_processor_accounts`. */
export type PaymentPurpose = "online_order" | "subscription" | "invoice";

export type ProcessorIndustry =
  | "retail"
  | "restaurant"
  | "ecommerce"
  | "moto"
  | "lodging";

/**
 * Money is carried as integer minor units (cents for USD), never as a float.
 *
 * Processors disagree on the wire format — NMI's classic endpoint wants
 * "10.00", Valor wants its own shape — so each adapter formats at its own
 * boundary. Keeping the interface itself in integers means no rounding error
 * can accumulate between a cart total and a captured charge.
 */
export interface Money {
  /** Integer minor units. 1000 === $10.00 USD. Must not be fractional. */
  amountMinor: number;
  /** ISO 4217 code. Defaults to USD at the adapter boundary when omitted. */
  currency: string;
}

/**
 * Normalized result of a processor call.
 *
 * `declined` means the processor answered and refused (bad card, insufficient
 * funds) — the customer should try another card. `error` means we never got a
 * clean answer (timeout, 5xx, malformed response) — the customer should retry
 * the same card. Collapsing those two into a single boolean is how you end up
 * telling someone their good card was declined during a gateway outage, so the
 * distinction is drawn here rather than left to each call site.
 */
export type ProcessorOutcome = "approved" | "declined" | "error";

/**
 * Transport-level detail, for operator-facing diagnostics only.
 *
 * Deliberately separate from `responseText`, which is customer-safe. These
 * fields exist because support and reconciliation genuinely need the raw HTTP
 * status and body to explain a failure; never surface them to a payer.
 */
export interface ProcessorDiagnostics {
  httpStatus: number;
  rawText: string;
}

export interface ProcessorTransaction {
  outcome: ProcessorOutcome;
  /** Processor-side transaction identifier. Null when the call never landed. */
  transactionId: string | null;
  authCode: string | null;
  responseCode: string | null;
  /** Customer-safe message. Never contains processor internals or PAN data. */
  responseText: string;
  processor: ProcessorName;
  /** Raw processor payload, retained verbatim for audit and support. */
  raw: unknown;
  diagnostics?: ProcessorDiagnostics;
}

export function isApproved(tx: ProcessorTransaction): boolean {
  return tx.outcome === "approved";
}

/** True when retrying the same card is reasonable (transport/gateway failure). */
export function isRetryable(tx: ProcessorTransaction): boolean {
  return tx.outcome === "error";
}

export interface BillingContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  /** AVS zip. Sandbox test value is 85284. */
  zip?: string;
  /** ISO 3166-1 alpha-2. Defaults to US at the adapter boundary. */
  country?: string;
}

export interface SaleRequest {
  money: Money;
  /**
   * Single-use token from the processor's browser-side tokenizer
   * (NMI CollectJS / Valor Passage.js v2). Raw card data never reaches here.
   */
  paymentToken: string;
  /** Merchant-facing reference echoed back by the processor. */
  orderId?: string;
  industry?: ProcessorIndustry;
  contact?: BillingContact;
}

export interface VaultSaleRequest {
  money: Money;
  /** Stored-credential identifier previously returned by `createCustomer`. */
  customerVaultId: string;
  orderId?: string;
  industry?: ProcessorIndustry;
}

export interface VoidRequest {
  transactionId: string;
  reason?: string;
}

export interface RefundRequest {
  transactionId: string;
  /** Omit for a full refund. Valor requires an explicit amount on every refund. */
  money?: Money;
  /** Original-sale identifiers some processors need to match the refund (e.g. Valor). */
  authCode?: string;
  rrn?: string;
}

export interface CreateCustomerRequest {
  paymentToken: string;
  contact?: BillingContact;
}

export interface ProcessorCustomer {
  /** Stored-credential identifier. Pass to `chargeCustomer` for later charges. */
  customerVaultId: string;
  /** Some processors charge $0 or $1 to validate on create; null if they don't. */
  initialTransactionId: string | null;
  processor: ProcessorName;
  /** False when the processor answered but no credential was stored. */
  success: boolean;
  /** Operator-facing message when `success` is false. */
  responseText: string;
  raw: unknown;
  diagnostics?: ProcessorDiagnostics;
}

/**
 * Declared capabilities, so callers can branch without instanceof checks.
 *
 * The optional methods on `PaymentProcessor` exist because the processors are
 * genuinely not feature-equivalent: hosted pages and native subscriptions are
 * Valor surfaces that the current NMI integration does not implement.
 */
export interface ProcessorCapabilities {
  /** `createCustomer` / `chargeCustomer` are implemented. */
  customerVault: boolean;
  /** Processor can mint a hosted payment URL (Valor Hosted Page Sale). */
  hostedPage: boolean;
  /** Processor has native recurring subscriptions. */
  subscriptions: boolean;
}

export interface PaymentProcessor {
  readonly name: ProcessorName;
  readonly supports: ProcessorCapabilities;

  /** Charge a single-use token. */
  sale(request: SaleRequest): Promise<ProcessorTransaction>;

  /** Cancel an authorization that has not yet settled. */
  voidSale(request: VoidRequest): Promise<ProcessorTransaction>;

  /** Return funds on a settled transaction. */
  refund(request: RefundRequest): Promise<ProcessorTransaction>;

  /** Look up a transaction. Used by reconciliation and webhook projection. */
  getTransaction(transactionId: string): Promise<ProcessorTransaction>;

  /** Store a credential for later charges. Present iff `supports.customerVault`. */
  createCustomer?(request: CreateCustomerRequest): Promise<ProcessorCustomer>;

  /** Charge a stored credential. Present iff `supports.customerVault`. */
  chargeCustomer?(request: VaultSaleRequest): Promise<ProcessorTransaction>;
}

/**
 * One row of `merchant_processor_accounts`, in application shape.
 *
 * Grouped by owner: `valor` and `nmi` are processor-issued identifiers, `fees`
 * is DEXA-owned ISO pricing. Every field is nullable in the database because a
 * single table serves both processors and all three purposes.
 */
export interface ProcessorAccount {
  id: string;
  merchantId: string;
  /** Null identifies a merchant-global account (see C1's NULLS NOT DISTINCT key). */
  locationId: string | null;
  processor: ProcessorName;
  purpose: PaymentPurpose;
  isActive: boolean;
  /**
   * The account actually used for this merchant/location/purpose. C1 enforces
   * at most one active primary per scope via `uq_mpa_primary_scope`, which is
   * what lets NMI and Valor rows coexist during a dual-run window.
   */
  isPrimary: boolean;

  valor: {
    merchantId: string | null;
    storeId: string | null;
    epi: string | null;
    appId: string | null;
    /** Encrypted at rest. Decrypt at point of use; never log. */
    appKeyEncrypted: string | null;
    customerProfileId: string | null;
    paymentProfileId: string | null;
  };

  /**
   * DEXA-owned ISO pricing. C1's `fee_schedule_required_for_merchant_purposes`
   * requires all four to be set on an active Valor online_order/invoice row.
   *
   * UNITS ARE NOT YET CONFIRMED — the columns are numeric(5,4), which caps at
   * 9.9999, so a "percent" here cannot mean 0-100. Treat as unresolved until
   * the fee schedule is locked; see the C2 ticket's pre-work dependency.
   */
  fees: {
    scheduleId: string | null;
    discRatePercent: number | null;
    residualBps: number | null;
    surchargePercent: number | null;
  };

  /** Retained for rollback. Dormant, not deleted, post-cutover. */
  nmi: {
    merchantId: string | null;
    customerVaultId: string | null;
  };

  webhookSecretEncrypted: string | null;
}

/** Credentials required to construct an adapter, resolved by the caller. */
export type ProcessorCredentials =
  | { processor: "nmi"; apiKey: string }
  | {
      processor: "valor";
      appId: string;
      appKey: string;
      epi: string;
    };

export class PaymentProcessorError extends Error {
  readonly code:
    | "no_account"
    | "unsupported_processor"
    | "unsupported_operation"
    | "missing_credentials";

  constructor(code: PaymentProcessorError["code"], message: string) {
    super(message);
    this.name = "PaymentProcessorError";
    this.code = code;
  }
}

/** Dollars (or other major unit) to integer minor units. */
export function toMinorUnits(major: number): number {
  return Math.round(major * 100);
}

/** Integer minor units to a fixed-2 string, e.g. 1000 -> "10.00". */
export function formatMinorUnits(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

/** Integer minor units to a major-unit number, e.g. 1000 -> 10. */
export function toMajorUnits(amountMinor: number): number {
  return amountMinor / 100;
}

export function assertValidMoney(money: Money): void {
  if (!Number.isInteger(money.amountMinor)) {
    throw new RangeError(
      `Money.amountMinor must be an integer in minor units, received ${money.amountMinor}`
    );
  }
  if (money.amountMinor < 0) {
    throw new RangeError(
      `Money.amountMinor must not be negative, received ${money.amountMinor}`
    );
  }
}
