/**
 * [C2] Valor customer vault — customer profiles and tokenized payment profiles.
 *
 * Used by the subscription rail: a customer profile holds the payer, a payment
 * profile attaches a tokenized card to it, and a subscription then charges that
 * pair on a schedule.
 *
 * These endpoints differ from the rest of Valor's surface — separate host
 * (`demo.valorpaytech.com` in sandbox), REST-style paths, and credentials in
 * headers rather than the body. `client.ts` absorbs that difference.
 *
 * Source re-fetched 2026-08-09: [V-CUST] add-customer-api,
 * [V-CUSTTOK] add-payment-profile-using-token.
 */

import {
  extractValorError,
  isValorSuccess,
  postWithHeaderCredentials,
  type ValorEnvelope,
  type ValorRequestOptions,
} from "./client";

/**
 * Valor constrains `customer_name` to 25 characters, alphabet only.
 *
 * Real payer names routinely contain hyphens, apostrophes, accents and spaces,
 * so this is a live rejection risk rather than a formality. Callers should
 * sanitize before sending; `sanitizeCustomerName` does the minimum.
 */
export const CUSTOMER_NAME_MAX_LENGTH = 25;

export interface ValorAddress {
  /** Required, and must be unique within the customer. Max 100 chars. */
  address_label: string;
  customer_name?: string;
  street_number?: string;
  street_name?: string;
  unit?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface ValorAddCustomerBody {
  customer_name: string;
  address_details: ValorAddress[];
  company_name?: string;
  customer_phone?: string;
  customer_email?: string;
}

export interface ValorAddCustomerResponse extends ValorEnvelope {
  code?: number;
  status?: string;
  vault_customer_id?: number;
}

export interface ValorAddPaymentProfileResponse extends ValorEnvelope {
  /**
   * Valor's OpenAPI definition documents an empty response body, so the
   * identifier's field name is unknown. Every plausible key is probed by
   * `readPaymentProfileId` rather than guessed at here.
   */
  [key: string]: unknown;
}

export class ValorVaultError extends Error {
  readonly status: number;
  readonly body: ValorEnvelope;

  constructor(message: string, status: number, body: ValorEnvelope) {
    super(message);
    this.name = "ValorVaultError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Strip a payer name down to what Valor's `customer_name` will accept:
 * letters and single spaces, truncated to 25 characters.
 *
 * Deliberately lossy. "O'Brien-Smith" becomes "OBrienSmith" rather than being
 * rejected at the gateway, because a failed vault write blocks the whole
 * subscription setup.
 */
export function sanitizeCustomerName(raw: string): string {
  const lettersOnly = raw
    .normalize("NFD")
    // Drop combining accent marks so "José" survives as "Jose".
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return lettersOnly.slice(0, CUSTOMER_NAME_MAX_LENGTH).trim();
}

export interface CreateCustomerProfileParams {
  customerName: string;
  addressLabel?: string;
  companyName?: string;
  /** 10 digits, numeric only. */
  phone?: string;
  email?: string;
  address?: Omit<ValorAddress, "address_label">;
}

/** Build the Add Customer body. Pure — exported for testing. */
export function buildAddCustomerBody(
  params: CreateCustomerProfileParams
): ValorAddCustomerBody {
  const customerName = sanitizeCustomerName(params.customerName);
  if (!customerName) {
    throw new RangeError(
      `customer_name is empty after sanitizing "${params.customerName}" — Valor accepts letters only`
    );
  }

  return {
    customer_name: customerName,
    address_details: [
      {
        address_label: params.addressLabel ?? "primary",
        ...(params.address ?? {}),
      },
    ],
    ...(params.companyName ? { company_name: params.companyName } : {}),
    ...(params.phone ? { customer_phone: params.phone.replace(/\D/g, "") } : {}),
    ...(params.email ? { customer_email: params.email } : {}),
  };
}

/** Create a customer profile. Returns the vault customer id. */
export async function createCustomerProfile(
  options: ValorRequestOptions,
  params: CreateCustomerProfileParams
): Promise<{ vaultCustomerId: string; raw: ValorAddCustomerResponse }> {
  const body = buildAddCustomerBody(params);

  const result = await postWithHeaderCredentials<ValorAddCustomerResponse>(
    "/api/valor-vault/addcustomer",
    body,
    options
  );

  if (!isValorSuccess(result.body) || result.body.vault_customer_id == null) {
    throw new ValorVaultError(
      extractValorError(result.body) ??
        `Valor addcustomer failed (HTTP ${result.status})`,
      result.status,
      result.body
    );
  }

  return {
    vaultCustomerId: String(result.body.vault_customer_id),
    raw: result.body,
  };
}

/**
 * Pull the payment profile identifier out of an undocumented response.
 *
 * Valor's spec shows an empty object for this endpoint, so the field name is
 * unknown. Rather than guess one, every plausible key is probed and a clear
 * error is raised if none match — which surfaces the real shape the first time
 * this runs against sandbox instead of silently storing `undefined`.
 */
export function readPaymentProfileId(body: ValorEnvelope): string | null {
  const candidates = [
    "vault_payment_id",
    "payment_id",
    "payment_profile_id",
    "vault_payment_profile_id",
    "id",
  ];

  for (const key of candidates) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

export interface AttachPaymentProfileParams {
  vaultCustomerId: string;
  /** Card token from Passage.js. */
  token: string;
  cardholderName?: string;
}

/** Attach a tokenized card to an existing customer profile. */
export async function attachPaymentProfile(
  options: ValorRequestOptions,
  params: AttachPaymentProfileParams
): Promise<{ paymentProfileId: string | null; raw: ValorEnvelope }> {
  const result =
    await postWithHeaderCredentials<ValorAddPaymentProfileResponse>(
      `/api/valor-vault/addpaymentprofiletoken/${encodeURIComponent(
        params.vaultCustomerId
      )}`,
      {
        token: params.token,
        ...(params.cardholderName
          ? { cardholder_name: params.cardholderName }
          : {}),
      },
      options
    );

  if (result.status >= 400) {
    throw new ValorVaultError(
      extractValorError(result.body) ??
        `Valor addpaymentprofiletoken failed (HTTP ${result.status})`,
      result.status,
      result.body
    );
  }

  return {
    paymentProfileId: readPaymentProfileId(result.body),
    raw: result.body,
  };
}
