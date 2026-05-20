"use client";

interface OrderSummarySectionProps {
  subtotal: number;
  tax: number;
  deliveryFee: number;
  tipAmount: number;
  total: number;
  itemCount: number;
  showDeliveryFee: boolean;
  taxRate?: number;
  discountAmount?: number;
  promoCode?: string;
  pricingDisclosureText?: string | null;
}

export function OrderSummarySection({
  subtotal,
  tax,
  deliveryFee,
  tipAmount,
  total,
  itemCount,
  showDeliveryFee,
  taxRate,
  discountAmount,
  promoCode,
  pricingDisclosureText,
}: OrderSummarySectionProps) {
  return (
    <section>
      <div className="space-y-1.5">
        {/* Sub-rows — 14px, secondary color */}
        <div className="flex justify-between" style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          <span>Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"})</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between" style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          <span>Tax{taxRate ? ` (${parseFloat((taxRate * 100).toFixed(2))}%)` : ""}</span>
          <span>${tax.toFixed(2)}</span>
        </div>
        {showDeliveryFee && (
          <div className="flex justify-between" style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
            <span>Delivery</span>
            <span>{deliveryFee > 0 ? `$${deliveryFee.toFixed(2)}` : "Free"}</span>
          </div>
        )}
        {discountAmount && discountAmount > 0 ? (
          <div className="flex justify-between font-medium" style={{ fontSize: "14px", color: "#16a34a" }}>
            <span>Promo{promoCode ? ` (${promoCode})` : ""}</span>
            <span>−${discountAmount.toFixed(2)}</span>
          </div>
        ) : null}
        {tipAmount > 0 && (
          <div className="flex justify-between" style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
            <span>Tip</span>
            <span>${tipAmount.toFixed(2)}</span>
          </div>
        )}

        {/* Total row — 18px bold, full contrast */}
        <div
          className="flex justify-between font-bold pt-2 mt-1"
          style={{
            fontSize: "18px",
            color: "var(--text)",
            borderTop: "1.5px solid var(--border)",
          }}
        >
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>

        {/* Pricing disclosure — de-emphasized */}
        {pricingDisclosureText && (
          <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: "1.4", paddingTop: "4px", opacity: 0.75 }}>
            {pricingDisclosureText}
          </p>
        )}
      </div>
    </section>
  );
}
