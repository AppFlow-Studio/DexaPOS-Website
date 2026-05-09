type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function firstString(source: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function firstNumber(source: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export type NmiRequestConfig = {
  apiKey: string;
  timeoutMs?: number;
};

export type NmiTransactionDetails = {
  id: string;
  response: string;
  responseCode: string;
  responseText: string;
  authCode: string;
  transactionId: string;
  transactionType: string;
  referenceNumber: string;
  orderId: string;
  condition: string;
  gatewayFee: number | null;
  raw: JsonRecord;
};

export type NmiVaultCustomerDetails = {
  customerVaultId: string;
  initialTransactionId: string;
  raw: JsonRecord;
};

function parseTransactionDetails(raw: JsonRecord): NmiTransactionDetails {
  return {
    id: firstString(raw, ["id", "transaction_id", "transactionid"]),
    response: firstString(raw, ["response"]),
    responseCode: firstString(raw, ["response_code", "responseCode"]),
    responseText: firstString(raw, ["response_text", "responseText", "message"]),
    authCode: firstString(raw, ["authcode", "authorization_code", "authorizationCode"]),
    transactionId: firstString(raw, ["transactionid", "transaction_id", "id"]),
    transactionType: firstString(raw, ["type", "transaction_type", "transactionType"]),
    referenceNumber: firstString(raw, ["orderid", "order_id", "merchant_defined_field_1", "customer_receipt"]),
    orderId: firstString(raw, ["orderid", "order_id"]),
    condition: firstString(raw, ["condition", "status"]),
    gatewayFee: firstNumber(raw, ["fee_amount", "gateway_fee"]),
    raw,
  };
}

function isApproved(details: NmiTransactionDetails): boolean {
  return details.response === "1" || details.responseCode === "100";
}

async function callNmi(
  path: string,
  init: RequestInit,
  config: NmiRequestConfig
): Promise<{
  ok: boolean;
  status: number;
  body: JsonRecord;
  text: string;
  details: NmiTransactionDetails;
}> {
  const baseUrl = (process.env.NMI_API_BASE_URL ?? "https://secure.nmi.com").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: config.apiKey,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(config.timeoutMs ?? 15000),
    cache: "no-store",
  });

  const text = await response.text();
  let body: JsonRecord = {};
  try {
    body = text ? asRecord(JSON.parse(text)) : {};
  } catch {
    body = {};
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
    text,
    details: parseTransactionDetails(body),
  };
}

export async function createNmiSale(
  config: NmiRequestConfig,
  params: {
    amount: number;
    currency?: string;
    paymentToken: string;
    industry?: "retail" | "restaurant" | "ecommerce" | "moto" | "lodging";
  }
) {
  const result = await callNmi(
    "/api/v5/payments/sale",
    {
      method: "POST",
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency ?? "USD",
        industry: params.industry ?? "ecommerce",
        payment_details: {
          payment_token: params.paymentToken,
        },
      }),
    },
    config
  );

  return {
    success: result.ok && isApproved(result.details),
    ...result,
  };
}

export async function voidNmiSale(
  config: NmiRequestConfig,
  transactionId: string,
  voidReason?: string
) {
  const result = await callNmi(
    `/api/v5/payments/${transactionId}/void`,
    {
      method: "POST",
      body: JSON.stringify(voidReason ? { void_reason: voidReason } : {}),
    },
    config
  );

  return {
    success: result.ok && isApproved(result.details),
    ...result,
  };
}

export async function refundNmiSale(
  config: NmiRequestConfig,
  transactionId: string,
  params: {
    amount?: number;
    payment?: "creditcard" | "check";
  } = {}
) {
  const payload: JsonRecord = {};
  if (params.amount !== undefined) payload.amount = params.amount;
  if (params.payment) payload.payment = params.payment;

  const result = await callNmi(
    `/api/v5/payments/${transactionId}/refund`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    config
  );

  return {
    success: result.ok && isApproved(result.details),
    ...result,
  };
}

export async function getNmiTransaction(
  config: NmiRequestConfig,
  transactionId: string
) {
  const result = await callNmi(
    `/api/v5/payments/${transactionId}`,
    { method: "GET" },
    config
  );

  return {
    success: result.ok,
    ...result,
  };
}

function parseVaultCustomerDetails(raw: JsonRecord): NmiVaultCustomerDetails {
  const customerRecord = asRecord(raw.customer);
  const customerVaultId =
    firstString(customerRecord, ["id", "customer_vault_id"]) ||
    firstString(raw, ["customer_vault_id", "customer_id"]);

  const initialTransactionId =
    firstString(raw, ["transaction_id", "transactionid"]) ||
    (customerVaultId && firstString(raw, ["id"]) === customerVaultId
      ? ""
      : firstString(raw, ["id"]));

  return {
    customerVaultId: customerVaultId || firstString(raw, ["id"]),
    initialTransactionId,
    raw,
  };
}

export async function createNmiVaultCustomer(
  config: NmiRequestConfig,
  params: {
    paymentToken: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    phone?: string;
  }
) {
  const result = await callNmi(
    "/api/v5/customers",
    {
      method: "POST",
      body: JSON.stringify({
        payment_details: {
          payment_token: params.paymentToken,
        },
        cit_mit: {
          stored_credential_indicator: "stored",
          initiated_by: "customer",
        },
        billing_address: {
          first_name: params.firstName,
          last_name: params.lastName,
          email: params.email,
          address1: params.address1,
          address2: params.address2,
          city: params.city,
          state: params.state,
          zip: params.zip,
          country: params.country ?? "US",
          phone: params.phone,
        },
      }),
    },
    config
  );

  const vault = parseVaultCustomerDetails(result.body);

  return {
    success: result.ok && Boolean(vault.customerVaultId),
    vault,
    ...result,
  };
}

export async function createNmiVaultSale(
  config: NmiRequestConfig,
  params: {
    amount: number;
    customerVaultId: string;
    currency?: string;
    industry?: "retail" | "restaurant" | "ecommerce" | "moto" | "lodging";
    initiatedBy?: "customer" | "merchant";
    initialTransactionId?: string;
  }
) {
  const citMit: JsonRecord = {
    stored_credential_indicator: "used",
    initiated_by: params.initiatedBy ?? "merchant",
  };

  if (params.initialTransactionId?.trim()) {
    citMit.initial_transaction_id = params.initialTransactionId.trim();
  }

  const result = await callNmi(
    "/api/v5/payments/sale",
    {
      method: "POST",
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency ?? "USD",
        industry: params.industry ?? "ecommerce",
        payment_details: {
          customer_vault_id: params.customerVaultId,
        },
        cit_mit: citMit,
      }),
    },
    config
  );

  return {
    success: result.ok && isApproved(result.details),
    ...result,
  };
}
