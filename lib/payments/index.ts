/**
 * [C2] Payment processor entry point.
 *
 * Call sites ask for a processor by merchant and purpose and get back something
 * that satisfies `PaymentProcessor`. They should not import `nmi-adapter` or
 * (once it lands) `valor/` directly — routing through here is what keeps the
 * cutover a data change.
 *
 * Usage:
 *
 *   const { processor, account } = await getProcessorFor(merchantId, "invoice", {
 *     credentials: { processor: "nmi", apiKey: rail.apiKey },
 *   });
 *   const tx = await processor.sale({ money, paymentToken, orderId });
 */

import { createNmiProcessor } from "./nmi-adapter";
import { resolveProcessorAccount, type ResolveAccountOptions } from "./resolver";
import {
  PaymentProcessorError,
  type PaymentProcessor,
  type PaymentPurpose,
  type ProcessorAccount,
  type ProcessorCredentials,
} from "./types";

export * from "./types";
export {
  isNmiForced,
  mapAccountRow,
  resolveProcessorAccount,
  selectAccount,
} from "./resolver";
export { classifyNmiResult, createNmiProcessor } from "./nmi-adapter";

/**
 * Build an adapter for an already-resolved account.
 *
 * Credentials are passed in rather than read from the account row because
 * today's secrets still live where each purpose already keeps them (invoice
 * rail config, platform credential table, per-location credentials). Moving
 * them onto `merchant_processor_accounts` is C4's data migration, and this
 * signature does not change when it happens.
 */
export function createProcessor(
  account: ProcessorAccount,
  credentials: ProcessorCredentials
): PaymentProcessor {
  if (credentials.processor !== account.processor) {
    throw new PaymentProcessorError(
      "missing_credentials",
      `Credentials are for ${credentials.processor} but account ${account.id} is ${account.processor}`
    );
  }

  switch (credentials.processor) {
    case "nmi":
      return createNmiProcessor({ apiKey: credentials.apiKey });
    case "valor":
      // Landing with lib/payments/valor/ — see C2 phase 2.
      throw new PaymentProcessorError(
        "unsupported_processor",
        "Valor processor is not implemented yet"
      );
  }
}

export interface GetProcessorOptions extends ResolveAccountOptions {
  credentials: ProcessorCredentials;
}

export interface ResolvedProcessor {
  processor: PaymentProcessor;
  account: ProcessorAccount;
}

/**
 * Resolve the processor to charge through for a merchant and purpose.
 *
 * Throws `PaymentProcessorError("no_account")` when the merchant has no active
 * primary account — that is the pre-cutover state for every existing merchant,
 * so callers migrating off the direct NMI imports should catch it and fall back
 * to their current path until C4 populates the table.
 */
export async function getProcessorFor(
  merchantId: string,
  purpose: PaymentPurpose,
  options: GetProcessorOptions
): Promise<ResolvedProcessor> {
  const account = await resolveProcessorAccount(merchantId, purpose, {
    locationId: options.locationId,
    forceNmi: options.forceNmi,
  });

  if (!account) {
    throw new PaymentProcessorError(
      "no_account",
      `No active primary processor account for merchant ${merchantId} / ${purpose}`
    );
  }

  return { processor: createProcessor(account, options.credentials), account };
}

export interface ResolvedProcessorOrDefault {
  processor: PaymentProcessor;
  /** Null when no account row exists yet and the NMI default was used. */
  account: ProcessorAccount | null;
}

/**
 * Resolve a processor, defaulting to NMI when the merchant has no account row.
 *
 * This is the migration seam for existing call sites. Until C4 populates
 * `merchant_processor_accounts`, every merchant resolves to null and this
 * returns an NMI adapter built from the credentials the call site already
 * holds — so behavior is byte-identical to calling `nmi.ts` directly. Once a
 * row exists, the same call site starts routing through it with no code change.
 *
 * `merchantId` is nullable because some call sites (platform-level billing)
 * operate outside a merchant context and can only ever be NMI today.
 */
export async function getProcessorWithNmiFallback(
  merchantId: string | null,
  purpose: PaymentPurpose,
  nmiApiKey: string,
  options: ResolveAccountOptions = {}
): Promise<ResolvedProcessorOrDefault> {
  const fallback: ResolvedProcessorOrDefault = {
    processor: createNmiProcessor({ apiKey: nmiApiKey }),
    account: null,
  };

  if (!merchantId) return fallback;

  const account = await resolveProcessorAccount(merchantId, purpose, options);
  if (!account) return fallback;

  // A resolved Valor account cannot be driven by an NMI API key. Until the
  // credential migration lands (C4), fall back rather than fail a live payment.
  if (account.processor !== "nmi") {
    return fallback;
  }

  return { processor: createNmiProcessor({ apiKey: nmiApiKey }), account };
}

/**
 * Same as `getProcessorFor` but returns null instead of throwing when the
 * merchant has no account yet. Preferred at call sites that still have a
 * working legacy path to fall back to.
 */
export async function tryGetProcessorFor(
  merchantId: string,
  purpose: PaymentPurpose,
  options: GetProcessorOptions
): Promise<ResolvedProcessor | null> {
  try {
    return await getProcessorFor(merchantId, purpose, options);
  } catch (error) {
    if (
      error instanceof PaymentProcessorError &&
      error.code === "no_account"
    ) {
      return null;
    }
    throw error;
  }
}
