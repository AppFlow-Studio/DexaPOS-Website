"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
} from "react";
import { AlertCircle, Lock } from "lucide-react";
import { NmiPayments, type PaymentChangeEvent } from "@nmipayments/nmi-pay-react";

export interface PaymentCardFormHandle {
  validateCardInput: () => { valid: boolean; error?: string };
  tokenize: () => Promise<{
    tokenId: string;
    cardType: string | null;
    cardLastFour: string | null;
  }>;
}

interface PaymentCardFormProps {
  tokenizationKey?: string | null;
  onError: (error: string) => void;
  disabled?: boolean;
}

function toDisplayCardType(cardType: string | null | undefined): string | null {
  if (!cardType) return null;

  switch (cardType.toLowerCase()) {
    case "visa":
      return "Visa";
    case "mastercard":
      return "Mastercard";
    case "amex":
    case "american express":
      return "Amex";
    case "discover":
      return "Discover";
    default:
      return cardType;
  }
}

function getLastFour(maskedNumber: string | null | undefined): string | null {
  if (!maskedNumber) return null;
  const digits = maskedNumber.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export const PaymentCardForm = forwardRef<
  PaymentCardFormHandle,
  PaymentCardFormProps
>(function PaymentCardForm({ tokenizationKey, onError, disabled }, ref) {
  const [paymentState, setPaymentState] = useState<{
    complete: boolean;
    token: string | null;
    cardType: string | null;
    cardLastFour: string | null;
  }>({
    complete: false,
    token: null,
    cardType: null,
    cardLastFour: null,
  });

  const validateCardInput = useCallback((): { valid: boolean; error?: string } => {
    if (!tokenizationKey) {
      return {
        valid: false,
        error: "Online card payments are not configured for this store.",
      };
    }

    if (!paymentState.complete || !paymentState.token) {
      return {
        valid: false,
        error: "Please complete your card details.",
      };
    }

    return { valid: true };
  }, [paymentState.complete, paymentState.token, tokenizationKey]);

  const tokenize = useCallback(async () => {
    const validation = validateCardInput();
    if (!validation.valid || !paymentState.token) {
      throw new Error(validation.error || "Card tokenization failed.");
    }

    return {
      tokenId: paymentState.token,
      cardType: paymentState.cardType,
      cardLastFour: paymentState.cardLastFour,
    };
  }, [paymentState, validateCardInput]);

  useImperativeHandle(
    ref,
    () => ({
      validateCardInput,
      tokenize,
    }),
    [tokenize, validateCardInput]
  );

  const handleChange = useCallback(
    (event: PaymentChangeEvent) => {
      const nextState = {
        complete: Boolean(event.complete && event.token),
        token: event.token || null,
        cardType: toDisplayCardType(event.lookupData?.card?.type),
        cardLastFour: getLastFour(event.lookupData?.card?.number),
      };

      setPaymentState(nextState);

      if (!event.complete) {
        onError("");
      }
    },
    [onError]
  );

  if (!tokenizationKey) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Online card payments are not configured for this store.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Lock className="h-4 w-4 text-emerald-600" />
            Secure card payment
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Card entry and tokenization are handled directly by NMI.
          </p>
        </div>
        {paymentState.complete ? (
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-700">
            Card ready
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
            Awaiting details
          </span>
        )}
      </div>

      <div className={disabled ? "pointer-events-none opacity-60" : ""}>
        <NmiPayments
          tokenizationKey={tokenizationKey}
          onChange={handleChange}
          onFieldsAvailable={() => onError("")}
          showDivider={false}
        />
      </div>

      {!paymentState.complete && (
        <div className="mt-3 flex items-start gap-2 text-xs text-slate-500">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Complete the card form above before placing the order.
        </div>
      )}
    </div>
  );
});
