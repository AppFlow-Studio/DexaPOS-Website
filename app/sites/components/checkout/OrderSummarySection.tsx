"use client";

interface OrderSummarySectionProps {
  subtotal: number;
  tax: number;
  deliveryFee: number;
  tipAmount: number;
  total: number;
  itemCount: number;
  showDeliveryFee: boolean;
}

export function OrderSummarySection({
  subtotal,
  tax,
  deliveryFee,
  tipAmount,
  total,
  itemCount,
  showDeliveryFee,
}: OrderSummarySectionProps) {
  return (
    <section>
      <div
        className="rounded-lg p-4 space-y-2"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        <div className="flex justify-between text-sm" style={{ color: "var(--text-secondary)" }}>
          <span>Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"})</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm" style={{ color: "var(--text-secondary)" }}>
          <span>Tax</span>
          <span>${tax.toFixed(2)}</span>
        </div>
        {showDeliveryFee && (
          <div className="flex justify-between text-sm" style={{ color: "var(--text-secondary)" }}>
            <span>Delivery Fee</span>
            <span>{deliveryFee > 0 ? `$${deliveryFee.toFixed(2)}` : "Free"}</span>
          </div>
        )}
        {tipAmount > 0 && (
          <div className="flex justify-between text-sm" style={{ color: "var(--text-secondary)" }}>
            <span>Tip</span>
            <span>${tipAmount.toFixed(2)}</span>
          </div>
        )}
        <div
          className="flex justify-between font-bold text-lg pt-2 mt-2"
          style={{ color: "var(--text)", borderTop: "2px solid var(--border)" }}
        >
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>
    </section>
  );
}
