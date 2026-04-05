// ============================================================================
// OrderOut Test Payload Builder
// ============================================================================
// Pure function (no IO) that constructs a complete OrderOut webhook payload
// matching the shape expected by supabase/functions/orderout-orders-webhook.
//
// Kept dependency-free so it's trivially unit-testable and shared between the
// server action and the optional CLI script.
// ============================================================================

export type OrderOutTestOrderType = "PICKUP" | "DELIVERY";

export type OrderOutTestDeliveryCompany =
  | "UBEREATS"
  | "grubhub"
  | "DOORDASH"
  | "OrderOut";

export interface BuildTestPayloadInput {
  restaurantPosUuid: string;
  restaurantName: string;
  locationId: string;
  items: { id: string; name: string; price: number }[];
  quantities: number[]; // parallel to items
  orderType: OrderOutTestOrderType;
  deliveryCompany: OrderOutTestDeliveryCompany;
  orderNumber: string;
}

export interface OrderOutTestItem {
  id: string;
  external_id: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
  note: string | null;
  modifiers: unknown[];
}

export interface OrderOutTestCustomer {
  customerName: string | null;
  phoneNumber: string | null;
  city: string | null;
  state: string | null;
  streetName: string | null;
  unit: string | null;
  zipCode: string | null;
  deliveryNotes: string | null;
}

export interface OrderOutTestPayload {
  event: "received";
  source: {
    ods: { name: string };
    leadTime: string | null;
    placedOn: string;
    orderNumber: string;
    additionalInfo: string;
    timeOfDelivery: string | null;
    deliveryCompany: { name: string };
    externalReferenceId: string;
  };
  payload: {
    order: {
      tax: number;
      items: OrderOutTestItem[];
      total: number;
      payment: { status: string; ccNumber: string | null; ccExpirationDate: string | null };
      discount: number | null;
      gratuity: number | null;
      ready_by: string | null;
      subtotal: number;
      orderType: OrderOutTestOrderType;
      surcharge: number | null;
      driverComp: number | null;
      orderNotes: string | null;
      deliveryCharge: number | null;
    };
    customer: OrderOutTestCustomer;
  };
  destination: {
    restaurantId: string;
    restaurantName: string;
    externalRestaurantId: number;
  };
}

const TAX_RATE = 0.0825;

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function randomDigits(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += Math.floor(Math.random() * 10).toString();
  return out;
}

function randomUuid(): string {
  // Prefer crypto.randomUUID when available (Node 18+, modern browsers, Deno).
  const c =
    typeof globalThis !== "undefined" ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Fallback RFC4122 v4 generator.
  const hex = (n: number) =>
    Math.floor(Math.random() * Math.pow(16, n))
      .toString(16)
      .padStart(n, "0");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${((8 + Math.floor(Math.random() * 4)) | 0).toString(16)}${hex(3)}-${hex(12)}`;
}

function buildCustomer(orderType: OrderOutTestOrderType): OrderOutTestCustomer {
  if (orderType === "DELIVERY") {
    return {
      customerName: "Test Customer",
      phoneNumber: "9175551234",
      streetName: "123 Test Street",
      unit: null,
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      deliveryNotes: "Leave at door",
    };
  }
  // PICKUP: phone-only, mimics the real GrubHub-style payload the user provided
  return {
    customerName: "Test Customer",
    phoneNumber: "9175551234",
    city: null,
    state: null,
    streetName: null,
    unit: null,
    zipCode: null,
    deliveryNotes: null,
  };
}

/**
 * Build a complete OrderOut webhook payload from the given real menu items.
 * Pure — no IO, no randomness beyond identifiers.
 */
export function buildOrderOutTestPayload(input: BuildTestPayloadInput): OrderOutTestPayload {
  const { restaurantPosUuid, restaurantName, items, quantities, orderType, deliveryCompany, orderNumber } =
    input;

  if (items.length === 0) {
    throw new Error("Cannot build test payload with zero items");
  }
  if (items.length !== quantities.length) {
    throw new Error("items and quantities must have the same length");
  }

  const lineItems: OrderOutTestItem[] = items.map((item, i) => {
    const qty = quantities[i];
    const lineTotal = roundCurrency(item.price * qty);
    return {
      id: randomUuid(),
      external_id: item.id,
      name: item.name,
      price: item.price,
      quantity: qty,
      total: lineTotal,
      note: null,
      modifiers: [],
    };
  });

  const subtotal = roundCurrency(lineItems.reduce((sum, li) => sum + li.total, 0));
  const tax = roundCurrency(subtotal * TAX_RATE);
  const total = roundCurrency(subtotal + tax);

  const placedOn = new Date().toISOString();

  return {
    event: "received",
    source: {
      ods: { name: "OrderOut" },
      leadTime: null,
      placedOn,
      orderNumber,
      additionalInfo: "Test order sent from merchant dashboard",
      timeOfDelivery: null,
      deliveryCompany: { name: deliveryCompany },
      externalReferenceId: randomDigits(16),
    },
    payload: {
      order: {
        tax,
        items: lineItems,
        total,
        payment: { status: "PAID", ccNumber: null, ccExpirationDate: null },
        discount: null,
        gratuity: null,
        ready_by: null,
        subtotal,
        orderType,
        surcharge: null,
        driverComp: null,
        orderNotes: "TEST ORDER — synthetic payload for webhook verification",
        deliveryCharge: null,
      },
      customer: buildCustomer(orderType),
    },
    destination: {
      restaurantId: restaurantPosUuid,
      restaurantName,
      externalRestaurantId: 0,
    },
  };
}

/**
 * Generates a TEST-prefixed orderNumber that's unique per invocation.
 * Format: TEST-<ISO>-<4 random chars>
 */
export function generateTestOrderNumber(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TEST-${iso}-${suffix}`;
}
