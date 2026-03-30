"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useStorefrontPath } from "../../lib/use-storefront-path";

interface OrderConfirmationProps {
  displayNumber?: string;
  estimatedTime?: number;
  orderId?: string;
  slug: string;
}

export function OrderConfirmation({ displayNumber, estimatedTime, orderId, slug }: OrderConfirmationProps) {
  const storePath = useStorefrontPath(slug);
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] text-center px-6 space-y-6">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ backgroundColor: "var(--primary)" }}
      >
        <Check className="h-10 w-10 text-white" />
      </div>

      <div className="space-y-2">
        <h1
          className="text-3xl font-bold"
          style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
        >
          Order Placed!
        </h1>
        {displayNumber && (
          <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
            Order {displayNumber}
          </p>
        )}
      </div>

      {estimatedTime && (
        <div
          className="px-6 py-4 rounded-xl !bg-white"
          style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb" }}
        >
          <p className="text-sm" style={{ color: "#6b7280" }}>
            Estimated ready in
          </p>
          <p className="text-2xl font-bold" style={{ color: "#111827" }}>
            {estimatedTime} min
          </p>
        </div>
      )}

      <div className="flex flex-col items-center gap-3 w-full max-w-xs">
        {orderId && (
          <Link
            href={storePath(`/order/${orderId}`)}
            className="w-full px-8 py-3 font-bold text-base transition-all inline-block text-center"
            style={{
              backgroundColor: "var(--primary)",
              color: "#FFFFFF",
              borderRadius: "var(--radius)",
              boxShadow: "0 4px 16px color-mix(in srgb, var(--primary) 40%, transparent)",
            }}
          >
            Track Your Order
          </Link>
        )}
        <Link
          href={storePath()}
          className="px-8 py-3 font-bold text-base transition-all inline-block text-center"
          style={{
            backgroundColor: orderId ? "transparent" : "var(--primary)",
            color: orderId ? "var(--primary)" : "#FFFFFF",
            borderRadius: "var(--radius)",
            border: orderId ? "2px solid var(--primary)" : "none",
            ...(orderId ? {} : { boxShadow: "0 4px 16px color-mix(in srgb, var(--primary) 40%, transparent)" }),
          }}
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
