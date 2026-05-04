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
    amount: string;
    tip?: string;
    currency?: string;
    paymentToken: string;
    billingAddress?: JsonRecord;
    shippingAddress?: JsonRecord;
    orderDetails?: JsonRecord;
    merchantDefinedFields?: JsonRecord;
  }
) {
  const result = await callNmi(
    "/api/v5/payments/sale",
    {
      method: "POST",
      body: JSON.stringify({
        amount: params.amount,
        ...(params.tip ? { tip: params.tip } : {}),
        currency: params.currency ?? "USD",
        payment_details: {
          payment_token: params.paymentToken,
        },
        ...(params.billingAddress ? { billing_address: params.billingAddress } : {}),
        ...(params.shippingAddress ? { shipping_address: params.shippingAddress } : {}),
        ...(params.orderDetails ? { order_details: params.orderDetails } : {}),
        ...(params.merchantDefinedFields ? { merchant_defined_fields: params.merchantDefinedFields } : {}),
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
    amount?: string;
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
