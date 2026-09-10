"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Lock } from "lucide-react";
import {
  PaymentCardForm,
  type PaymentCardFormHandle,
} from "@/app/sites/components/checkout/PaymentCardForm";
import { chargeInvoice } from "@/app/actions/invoices/charge-invoice";
import type { InvoicePaymentBootstrap } from "@/app/actions/invoices/invoice-payment-bootstrap";
import { PassageCheckout } from "@/lib/payments/valor/passageClient";

interface PayPanelProps {
  publicToken: string;
  amountDue: number;
  bootstrap: InvoicePaymentBootstrap;
}

type PayPhase = "idle" | "working" | "paid" | "declined" | "error";

function fmt(amount: number): string {
  return `$${Number(amount).toFixed(2)}`;
}

export function PayPanel({ publicToken, amountDue, bootstrap }: PayPanelProps) {
  const router = useRouter();
  const cardRef = useRef<PaymentCardFormHandle>(null);
  const submissionStartedRef = useRef(false);

  const [phase, setPhase] = useState<PayPhase>("idle");
  const [message, setMessage] = useState("");
  const [cardError, setCardError] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const isWorking = phase === "working";

  const submitPayment = useCallback(
    async (
      paymentToken: string,
      cardType?: string | null,
      cardLastFour?: string | null,
    ) => {
      if (submissionStartedRef.current) return;
      submissionStartedRef.current = true;
      setMessage("");
      setCardError("");
      setPhase("working");

      try {
        const result = await chargeInvoice({
          publicToken,
          paymentToken,
          idempotencyKey: crypto.randomUUID(),
          cardType,
          cardLastFour,
        });

        if (result.success && result.status === "paid") {
          setPhase("paid");
          setMessage(result.message || "Payment received. Thank you!");
          router.refresh();
          return;
        }

        submissionStartedRef.current = false;
        if (result.status === "declined") {
          setPhase("declined");
          setMessage(
            result.message || "Your card was declined. Please try another card.",
          );
          return;
        }

        setPhase("error");
        setMessage(
          result.message || "We couldn't process this payment. Please try again.",
        );
      } catch (error) {
        submissionStartedRef.current = false;
        setPhase("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
        );
      }
    },
    [publicToken, router],
  );

  const handleNmiPay = useCallback(async () => {
    const form = cardRef.current;
    if (!form || isWorking) return;

    setMessage("");
    setCardError("");
    const validation = form.validateCardInput();
    if (!validation.valid) {
      setPhase("error");
      setMessage(validation.error ?? "Please complete your card details.");
      return;
    }

    try {
      const { tokenId, cardType, cardLastFour } = await form.tokenize();
      await submitPayment(tokenId, cardType, cardLastFour);
    } catch (error) {
      submissionStartedRef.current = false;
      setPhase("error");
      setMessage(
        error instanceof Error ? error.message : "Card tokenization failed.",
      );
    }
  }, [isWorking, submitPayment]);

  if (phase === "paid") {
    return (
      <div className="mt-5 flex items-center gap-2 rounded-md bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {message || "Payment received. Thank you!"}
      </div>
    );
  }

  const valorReady = Boolean(
    bootstrap.provider === "valor" &&
      bootstrap.valorClientToken &&
      bootstrap.valorEpi,
  );

  return (
    <div className="mt-5 space-y-3">
      {valorReady ? (
        <PassageCheckout
          clientToken={bootstrap.valorClientToken!}
          epi={bootstrap.valorEpi!}
          formAction="/api/valor/passage-callback"
          isDemo={bootstrap.valorIsDemo}
          submitText={`Pay ${fmt(amountDue)}`}
          customData={{ publicToken }}
          onTokenReceived={({ token }) => void submitPayment(token)}
          onError={(error) => {
            submissionStartedRef.current = false;
            setPhase("error");
            setMessage(error.message || "Card tokenization failed.");
          }}
          unavailableFallback={
            <p className="text-[13px] text-red-600" role="alert">
              Payment is temporarily unavailable. Please try again in a moment.
            </p>
          }
        />
      ) : bootstrap.provider === "nmi" && mounted ? (
        <PaymentCardForm
          ref={cardRef}
          tokenizationKey={bootstrap.tokenizationKey}
          onError={setCardError}
          disabled={isWorking}
          price={amountDue.toFixed(2)}
        />
      ) : bootstrap.provider === "nmi" ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 text-[13px] text-neutral-500">
          Loading secure card fields...
        </div>
      ) : (
        <p className="text-[13px] text-red-600" role="alert">
          Card payments are not configured for this invoice.
        </p>
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

      {bootstrap.provider === "valor" && isWorking && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-neutral-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Processing...
        </div>
      )}

      {bootstrap.provider === "nmi" && (
        <button
          type="button"
          onClick={handleNmiPay}
          disabled={isWorking || !bootstrap.tokenizationKey}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0C4FD1] py-3 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isWorking ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Lock className="h-4 w-4" />
              Pay {fmt(amountDue)}
            </>
          )}
        </button>
      )}
    </div>
  );
}
