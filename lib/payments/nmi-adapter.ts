/**
 * [C2] NMI implementation of `PaymentProcessor`.
 *
 * This is a pure adapter over the existing `lib/payments/nmi.ts` client — it
 * translates shapes and classifies outcomes, and issues no requests of its own.
 * Behavior is deliberately identical to the current call sites so that adopting
 * the interface is a no-op on the wire.
 *
 * Note on file placement: this lives beside `nmi.ts` rather than in a `nmi/`
 * directory because a directory of that name next to `nmi.ts` would make
 * `@/lib/payments/nmi` resolve ambiguously. The move to `nmi/` happens when the
 * existing call sites migrate onto the interface.
 */

import {
  createNmiSale,
  createNmiVaultCustomer,
  createNmiVaultSale,
  getNmiTransaction,
  refundNmiSale,
  voidNmiSale,
  type NmiTransactionDetails,
} from "./nmi";
import {
  assertValidMoney,
  type BillingContact,
  type CreateCustomerRequest,
  type PaymentProcessor,
  type ProcessorCapabilities,
  type ProcessorCustomer,
  type ProcessorIndustry,
  type ProcessorTransaction,
  type RefundRequest,
  type SaleRequest,
  type VaultSaleRequest,
  type VoidRequest,
  toMajorUnits,
} from "./types";

const DEFAULT_INDUSTRY: ProcessorIndustry = "ecommerce";

const NMI_CAPABILITIES: ProcessorCapabilities = {
  customerVault: true,
  hostedPage: false,
  subscriptions: false,
};

const GATEWAY_UNAVAILABLE_MESSAGE =
  "Payment service is temporarily unavailable. Please try again.";
const CARD_DECLINED_MESSAGE = "Your card was declined. Please try another card.";

/** The shape every function in `nmi.ts` returns. */
interface NmiCallResult {
  success: boolean;
  status: number;
  body: Record<string, unknown>;
  text: string;
  details: NmiTransactionDetails;
}

/**
 * Classify an NMI response into the normalized outcome.
 *
 * A 5xx is treated as `error` rather than `declined` — this mirrors the
 * existing logic in `charge-invoice.ts`, which maps `status >= 500` to a
 * `failed` payment and anything else to `declined`. Pulling it in here means
 * every call site inherits the distinction instead of re-deriving it.
 */
export function classifyNmiResult(result: {
  success: boolean;
  status: number;
}): ProcessorTransaction["outcome"] {
  if (result.success) return "approved";
  if (result.status >= 500 || result.status === 0) return "error";
  return "declined";
}

function toProcessorTransaction(result: NmiCallResult): ProcessorTransaction {
  const outcome = classifyNmiResult(result);

  return {
    outcome,
    transactionId: result.details.transactionId || result.details.id || null,
    authCode: result.details.authCode || null,
    responseCode: result.details.responseCode || result.details.response || null,
    responseText:
      result.details.responseText ||
      (outcome === "error" ? GATEWAY_UNAVAILABLE_MESSAGE : CARD_DECLINED_MESSAGE),
    processor: "nmi",
    raw: result.body,
    diagnostics: { httpStatus: result.status, rawText: result.text },
  };
}

/** Flattens the grouped contact into the flat argument list `nmi.ts` expects. */
function spreadContact(contact: BillingContact | undefined) {
  return {
    firstName: contact?.firstName,
    lastName: contact?.lastName,
    email: contact?.email,
    phone: contact?.phone,
    address1: contact?.address1,
    address2: contact?.address2,
    city: contact?.city,
    state: contact?.state,
    zip: contact?.zip,
    country: contact?.country,
  };
}

export interface NmiProcessorConfig {
  apiKey: string;
  timeoutMs?: number;
}

export function createNmiProcessor(config: NmiProcessorConfig): PaymentProcessor {
  const requestConfig = { apiKey: config.apiKey, timeoutMs: config.timeoutMs };

  return {
    name: "nmi",
    supports: NMI_CAPABILITIES,

    async sale(request: SaleRequest): Promise<ProcessorTransaction> {
      assertValidMoney(request.money);

      const result = await createNmiSale(requestConfig, {
        amount: toMajorUnits(request.money.amountMinor),
        currency: request.money.currency,
        paymentToken: request.paymentToken,
        industry: request.industry ?? DEFAULT_INDUSTRY,
        orderId: request.orderId,
        ...spreadContact(request.contact),
      });

      return toProcessorTransaction(result);
    },

    async voidSale(request: VoidRequest): Promise<ProcessorTransaction> {
      const result = await voidNmiSale(
        requestConfig,
        request.transactionId,
        request.reason
      );
      return toProcessorTransaction(result);
    },

    async refund(request: RefundRequest): Promise<ProcessorTransaction> {
      if (request.money) assertValidMoney(request.money);

      const result = await refundNmiSale(requestConfig, request.transactionId, {
        amount: request.money
          ? toMajorUnits(request.money.amountMinor)
          : undefined,
      });
      return toProcessorTransaction(result);
    },

    async getTransaction(transactionId: string): Promise<ProcessorTransaction> {
      const result = await getNmiTransaction(requestConfig, transactionId);
      return toProcessorTransaction(result);
    },

    async createCustomer(
      request: CreateCustomerRequest
    ): Promise<ProcessorCustomer> {
      const result = await createNmiVaultCustomer(requestConfig, {
        paymentToken: request.paymentToken,
        ...spreadContact(request.contact),
      });

      return {
        customerVaultId: result.vault.customerVaultId,
        initialTransactionId: result.vault.initialTransactionId || null,
        processor: "nmi",
        success: result.success && Boolean(result.vault.customerVaultId),
        responseText: result.details.responseText,
        raw: result.body,
        diagnostics: { httpStatus: result.status, rawText: result.text },
      };
    },

    async chargeCustomer(
      request: VaultSaleRequest
    ): Promise<ProcessorTransaction> {
      assertValidMoney(request.money);

      const result = await createNmiVaultSale(requestConfig, {
        amount: toMajorUnits(request.money.amountMinor),
        currency: request.money.currency,
        customerVaultId: request.customerVaultId,
        industry: request.industry ?? DEFAULT_INDUSTRY,
      });

      return toProcessorTransaction(result);
    },
  };
}
