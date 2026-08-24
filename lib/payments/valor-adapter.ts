/**
 * [C2] Valor implementation of `PaymentProcessor`.
 *
 * Thin adapter over `lib/payments/valor/*` — it translates the processor-agnostic
 * interface into Valor's request shapes and back, and issues no HTTP of its own.
 * `createProcessor()` in `index.ts` returns this for a resolved Valor account.
 *
 * WHAT IS AND ISN'T IMPLEMENTED
 *   sale + createCustomer map onto real Valor calls (Direct Sale Token, and the
 *   customer/payment-profile vault). refund + voidSale reverse a card-not-present
 *   online sale (see `valor/refundApi`) — the web dashboard owns these because a
 *   POS terminal cannot reverse a web charge. getTransaction still throws
 *   `unsupported_operation`: Valor reconciliation arrives via webhook projection
 *   (C6), not a synchronous transaction lookup. chargeCustomer is intentionally
 *   omitted — Valor bills stored credentials through the subscription rail
 *   (`valor/subscriptionApi`), not a one-off vault charge.
 *
 * CREDENTIALS
 *   Constructed from a resolved account's { epi, appId, appKey }. The appKey is
 *   decrypted by the caller before it reaches here; this module never logs it.
 */

import {
  createSale,
  type ValorProductLine,
  type ValorSaleParams,
} from "./valor/saleApi";
import { createRefund, voidSale as valorVoidSale } from "./valor/refundApi";
import {
  attachPaymentProfile,
  createCustomerProfile,
  ValorVaultError,
} from "./valor/customerProfileApi";
import {
  isValidEpi,
  ValorConfigError,
  type ValorEndpoints,
} from "./valor/config";
import type { ValorRequestOptions } from "./valor/client";
import {
  PaymentProcessorError,
  type BillingContact,
  type CreateCustomerRequest,
  type PaymentProcessor,
  type ProcessorCapabilities,
  type ProcessorCustomer,
  type ProcessorTransaction,
  type RefundRequest,
  type SaleRequest,
  type VoidRequest,
} from "./types";

/**
 * Valor exposes native hosted pages and subscriptions in addition to the vault,
 * so all three capability flags are set. The hosted-page and subscription
 * surfaces are reached through their own modules, not the shared interface.
 */
const VALOR_CAPABILITIES: ProcessorCapabilities = {
  customerVault: true,
  hostedPage: true,
  subscriptions: true,
};

export interface ValorProcessorConfig {
  /** 10-digit EPI beginning with 2, from the resolved account. */
  epi: string;
  appId: string;
  /** Decrypted at the call site; never persisted or logged from here. */
  appKey: string;
  timeoutMs?: number;
  /** Injectable for tests; defaults to the env-resolved hosts in `config.ts`. */
  endpoints?: ValorEndpoints;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** Join a contact's names into Valor's single cardholder/customer name field. */
function contactName(contact: BillingContact | undefined): string | undefined {
  const joined = [contact?.firstName, contact?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return joined || undefined;
}

/**
 * Map the interface's `SaleRequest` onto Valor's `ValorSaleParams`.
 *
 * `productLines` is empty here: the shared interface carries no line items.
 * The storefront migration (C3) passes real lines through its own call path;
 * invoice/subscription sales legitimately have none. `invoiceNumber` comes from
 * the caller's `orderId` — call sites always supply one.
 */
function toSaleParams(request: SaleRequest): ValorSaleParams {
  const productLines: ValorProductLine[] = [];
  return {
    money: request.money,
    token: request.paymentToken,
    invoiceNumber: request.orderId ?? "",
    productLines,
    cardholderName: contactName(request.contact),
    email: request.contact?.email,
    phone: request.contact?.phone,
    address1: request.contact?.address1,
    zip: request.contact?.zip,
    shippingCountry: request.contact?.country,
  };
}

export function createValorProcessor(
  config: ValorProcessorConfig
): PaymentProcessor {
  if (!isValidEpi(config.epi)) {
    throw new ValorConfigError(
      `EPI must be 10 digits beginning with 2, received "${config.epi}"`
    );
  }

  const options: ValorRequestOptions = {
    credentials: { appId: config.appId, appKey: config.appKey, epi: config.epi },
    ...(config.endpoints ? { endpoints: config.endpoints } : {}),
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
  };

  function unsupported(op: string): never {
    throw new PaymentProcessorError(
      "unsupported_operation",
      `Valor ${op} is not available on the web rail. ` +
        "Voids/refunds are POS-only; reconciliation is via the Valor webhook (C6)."
    );
  }

  return {
    name: "valor",
    supports: VALOR_CAPABILITIES,

    async sale(request: SaleRequest): Promise<ProcessorTransaction> {
      return createSale(options, toSaleParams(request));
    },

    async voidSale(request: VoidRequest): Promise<ProcessorTransaction> {
      return valorVoidSale(options, {
        transactionId: request.transactionId,
        reason: request.reason,
      });
    },

    async refund(request: RefundRequest): Promise<ProcessorTransaction> {
      return createRefund(options, {
        transactionId: request.transactionId,
        money: request.money,
      });
    },

    async getTransaction(_transactionId: string): Promise<ProcessorTransaction> {
      unsupported("getTransaction");
    },

    /**
     * Create a customer profile and attach the tokenized card to it — Valor's
     * two-call analogue of an NMI vault. `customerVaultId` returns the customer
     * profile id; the payment-profile id is carried in `raw` for the C4
     * subscription migration to persist to `valor_payment_profile_id`.
     */
    async createCustomer(
      request: CreateCustomerRequest
    ): Promise<ProcessorCustomer> {
      try {
        const { vaultCustomerId, raw: customerRaw } = await createCustomerProfile(
          options,
          {
            customerName: contactName(request.contact) ?? request.contact?.email ?? "Customer",
            email: request.contact?.email,
            phone: request.contact?.phone,
          }
        );

        const { paymentProfileId, raw: profileRaw } = await attachPaymentProfile(
          options,
          {
            vaultCustomerId,
            token: request.paymentToken,
            cardholderName: contactName(request.contact),
          }
        );

        return {
          customerVaultId: vaultCustomerId,
          // Valor's vault-create does not run a validation charge.
          initialTransactionId: null,
          processor: "valor",
          success: true,
          responseText: "Customer profile created",
          raw: { customer: customerRaw, paymentProfile: { paymentProfileId, raw: profileRaw } },
        };
      } catch (error) {
        if (error instanceof ValorVaultError) {
          return {
            customerVaultId: "",
            initialTransactionId: null,
            processor: "valor",
            success: false,
            responseText: error.message,
            raw: error.body,
            diagnostics: { httpStatus: error.status, rawText: "" },
          };
        }
        throw error;
      }
    },
  };
}
