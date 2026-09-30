/**
 * Canonical "recognized order" predicate — the single definition of a
 * reportable order across every reporting surface (merchant + HQ admin).
 *
 * Mirrors the SQL helper `public.is_order_reportable`:
 *
 *   payment_status IN ('paid','captured')
 *   AND status NOT IN ('draft','cancelled','void','refunded')
 *
 * Recognizes an order on its economic reality — payment collected — NOT the
 * manual `completed` tap. Volume AND revenue share this one gate so all screens
 * agree. `captured` is the retired legacy payment value, kept only so pre-2026
 * orders still count.
 *
 * Refunds are netted via the dedicated refunds source (order_payments), NOT via
 * this gate (which excludes `refunded` orders).
 *
 * Operational / live-order views (KDS, active-orders lists) must NOT use this —
 * they intentionally surface unpaid in-progress orders.
 */

export const RECOGNIZED_PAYMENT_STATUSES = ["paid", "captured"] as const;

/** PostgREST `in` filter value for the excluded order statuses. */
export const NON_REPORTABLE_ORDER_STATUSES = "(draft,cancelled,void,refunded)";

/**
 * Apply the recognized-order predicate to a Supabase query builder.
 *
 * Pass `prefix` (e.g. "orders.") when filtering an embedded relation in a join,
 * e.g. `applyReportablePredicate(query, "orders.")`.
 *
 * The query builder is typed loosely (`any`) on purpose: PostgREST's builder
 * type is deep enough that a precise generic constraint trips TS2589
 * ("type instantiation is excessively deep") on longer chains. The return is
 * cast back to the caller's type so call sites keep full type inference.
 */
export function applyReportablePredicate<T>(query: T, prefix = ""): T {
  return (query as any)
    .in(`${prefix}payment_status`, [...RECOGNIZED_PAYMENT_STATUSES])
    .not(`${prefix}status`, "in", NON_REPORTABLE_ORDER_STATUSES) as T;
}

/**
 * Sale-order predicate used by the report pages — mirrors SQL
 * `public.is_order_sale` (supabase/migrations/20260930150000_report_number_consistency.sql):
 *
 *   status NOT IN ('draft','cancelled','void','declined')
 *   AND payment_status IN ('paid','captured','partially_refunded','refunded')
 *
 * Unlike the recognized-order predicate above, refunded orders stay IN: a
 * refunded sale is still a sale, and its refund is subtracted on its own line
 * (Gross − Discounts − Refunds = Net). Prefer the `get_sales_report` RPC for
 * money; use this only to pick the same order set for row-level lists.
 */
export const SALE_PAYMENT_STATUSES = [
  "paid",
  "captured",
  "partially_refunded",
  "refunded",
] as const;

export const NON_SALE_ORDER_STATUSES = "(draft,cancelled,void,declined)";

export function applySalePredicate<T>(query: T, prefix = ""): T {
  return (query as any)
    .in(`${prefix}payment_status`, [...SALE_PAYMENT_STATUSES])
    .not(`${prefix}status`, "in", NON_SALE_ORDER_STATUSES) as T;
}

export function isOrderSale(o: {
  status?: string | null;
  payment_status?: string | null;
}): boolean {
  return (
    (SALE_PAYMENT_STATUSES as readonly string[]).includes(o.payment_status ?? "") &&
    !["draft", "cancelled", "void", "declined"].includes(o.status ?? "")
  );
}

/**
 * In-memory equivalent for filtering already-fetched rows. Use only when a row
 * set was fetched without the DB-level gate (prefer the query builder version).
 */
export function isOrderReportable(o: {
  status?: string | null;
  payment_status?: string | null;
}): boolean {
  return (
    (o.payment_status === "paid" || o.payment_status === "captured") &&
    o.status !== "draft" &&
    o.status !== "cancelled" &&
    o.status !== "void" &&
    o.status !== "refunded"
  );
}
