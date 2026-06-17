"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Lock } from "lucide-react";
import {
  PaymentCardForm,
  type PaymentCardFormHandle,
} from "@/app/sites/components/checkout/PaymentCardForm";
import { chargeInvoice } from "@/app/actions/invoices/charge-invoice";

interface PayPanelProps {
  publicToken: string;
  amountDue: number;
  tokenizationKey: string | null;
}

type PayPhase = "idle" | "working" | "paid" | "declined" | "error";

function fmt(amount: number): string {
  return `$${Number(amount).toFixed(2)}`;
}

export function PayPanel({ publicToken, amountDue, tokenizationKey }: PayPanelProps) {
  const router = useRouter();
  const cardRef = useRef<PaymentCardFormHandle>(null);

  const [phase, setPhase] = useState<PayPhase>("idle");
  const [message, setMessage] = useState<string>("");
  // Surfaces tokenization/field errors raised by Collect.js itself.
  const [cardError, setCardError] = useState<string>("");
  // PaymentCardForm derives field IDs at runtime and injects Collect.js iframes,
  // so it must render client-side only — SSR-ing it causes a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isWorking = phase === "working";

  const handlePay = useCallback(async () => {
    if (isWorking) return; // double-submit guard
    setMessage("");
    setCardError("");

    const form = cardRef.current;
    if (!form) return;

    // 1. Validate card fields are complete before doing anything.
    const validation = form.validateCardInput();
    if (!validation.valid) {
      setPhase("error");
      setMessage(validation.error ?? "Please complete your card details.");
      return;
    }

    setPhase("working");

    try {
      // 2. Tokenize the card via Collect.js (PAN/CVV never touch our server).
      const { tokenId, cardType, cardLastFour } = await form.tokenize();

      // 3. Charge through the server boundary. A FRESH idempotency key per
      //    attempt so a retry after a decline is never blocked, while a
      //    double-click within one attempt is de-duped server-side.
      const result = await chargeInvoice({
        publicToken,
        paymentToken: tokenId,
        idempotencyKey: crypto.randomUUID(),
        cardType,
        cardLastFour,
      });

      if (result.success && result.status === "paid") {
        setPhase("paid");
        setMessage(result.message || "Payment received. Thank you!");
        // Re-pull the RPC so the page flips to its read-only Paid view.
        router.refresh();
        return;
      }

      if (result.status === "declined") {
        setPhase("declined");
        setMessage(result.message || "Your card was declined. Please try another card.");
        return;
      }

      setPhase("error");
      setMessage(result.message || "We couldn't process this payment. Please try again.");
    } catch (err) {
      setPhase("error");
      setMessage(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
    }
  }, [isWorking, publicToken, router]);

  if (phase === "paid") {
    return (
      <div className="mt-5 flex items-center gap-2 rounded-md bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {message || "Payment received. Thank you!"}
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      {mounted ? (
        <PaymentCardForm
          ref={cardRef}
          tokenizationKey={tokenizationKey}
          onError={setCardError}
          disabled={isWorking}
          price={amountDue.toFixed(2)}
        />
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 text-[13px] text-neutral-500">
          Loading secure card fields…
        </div>
      )}

      {(cardError || message) && phase !== "idle" && (
        <p className="text-[13px] text-red-600" role="alert">
          {message || cardError}
        </p>
      )}
      {cardError && phase === "idle" && (
        <p className="text-[13px] text-red-600" role="alert">
          {cardError}
        </p>
      )}

      <button
        type="button"
        onClick={handlePay}
        disabled={isWorking || !tokenizationKey}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0C4FD1] py-3 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isWorking ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing…
          </>
        ) : (
          <>
            <Lock className="h-4 w-4" />
            Pay {fmt(amountDue)}
          </>
        )}
      </button>
    </div>
  );
}
