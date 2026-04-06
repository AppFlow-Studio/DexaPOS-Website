"use client";

import { Check, Hourglass, Clock } from "lucide-react";
import Link from "next/link";
import { useStorefrontPath } from "../../lib/use-storefront-path";

interface OrderConfirmationProps {
  displayNumber?: string;
  estimatedTime?: number;
  orderId?: string;
  slug: string;
  isPending?: boolean;
}

export function OrderConfirmation({ displayNumber, estimatedTime, orderId, slug, isPending }: OrderConfirmationProps) {
  const storePath = useStorefrontPath(slug);
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] text-center px-6 space-y-6">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ backgroundColor: isPending ? "color-mix(in srgb, #f59e0b 20%, var(--bg))" : "var(--primary)", border: isPending ? "2px solid #f59e0b" : "none" }}
      >
        {isPending
          ? <Hourglass className="h-10 w-10" style={{ color: "#f59e0b" }} />
          : <Check className="h-10 w-10 text-white" />
        }
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

      {isPending ? (
        <div
          className="px-6 py-4 rounded-xl space-y-2 w-full max-w-xs"
          style={{ backgroundColor: "color-mix(in srgb, #f59e0b 10%, var(--bg))", border: "1px solid #f59e0b" }}
        >
          <div className="flex items-center gap-3">
            <Hourglass className="h-5 w-5 flex-shrink-0 animate-pulse" style={{ color: "#f59e0b" }} />
            <p className="text-sm font-semibold text-left" style={{ color: "#f59e0b" }}>
              Awaiting restaurant acceptance
            </p>
          </div>
          <div className="flex items-start gap-2 pl-8">
            <Clock className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: "var(--text-secondary)" }} />
            <p className="text-xs text-left" style={{ color: "var(--text-secondary)" }}>
              Restaurant has up to 1 minute to respond
            </p>
          </div>
        </div>
      ) : estimatedTime ? (
        <div
          className="px-6 py-4 rounded-xl"
          style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Estimated ready in
          </p>
          <p className="text-2xl font-bold" style={{ color: "var(--text)" }}>
            {estimatedTime} min
          </p>
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-3 w-full max-w-xs">
        {orderId ? (
          <>
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
              View Order Status
            </Link>
            <Link
              href={storePath()}
              className="text-sm font-medium mt-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Back to Menu
            </Link>
          </>
        ) : (
          <Link
            href={storePath()}
            className="w-full px-8 py-3 font-bold text-base transition-all inline-block text-center"
            style={{
              backgroundColor: "var(--primary)",
              color: "#FFFFFF",
              borderRadius: "var(--radius)",
              boxShadow: "0 4px 16px color-mix(in srgb, var(--primary) 40%, transparent)",
            }}
          >
            Back to Menu
          </Link>
        )}
      </div>
    </div>
  );
}
