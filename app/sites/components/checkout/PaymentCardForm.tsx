"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { AlertCircle, Lock } from "lucide-react";

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
  country?: string;
  currency?: string;
  price?: string;
}

interface CollectJsFieldState {
  ccnumber: boolean;
  ccexp: boolean;
  cvv: boolean;
}

interface CollectJsLookupCard {
  type?: string | null;
  number?: string | null;
}

interface CollectJsResponse {
  token?: string;
  error?: string;
  card?: CollectJsLookupCard | null;
}

interface CollectJsGlobal {
  configure: (config: Record<string, unknown>) => void;
  startPaymentRequest: (event?: Event) => void;
  clearInputs?: () => void;
}

declare global {
  interface Window {
    CollectJS?: CollectJsGlobal;
  }
}

const COLLECT_JS_SCRIPT_ID = "nmi-collect-js";
const COLLECT_JS_SCRIPT_SRC = "https://secure.nmi.com/token/Collect.js";

let collectJsLoader: Promise<void> | null = null;

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

function loadCollectJs(tokenizationKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Collect.js can only load in the browser."));
  }

  const existingScript = document.getElementById(
    COLLECT_JS_SCRIPT_ID
  ) as HTMLScriptElement | null;

  const existingKey = existingScript?.dataset.tokenizationKey;
  if (existingScript && existingKey && existingKey !== tokenizationKey) {
    existingScript.remove();
    collectJsLoader = null;
    delete window.CollectJS;
  }

  if (window.CollectJS && collectJsLoader) {
    return collectJsLoader;
  }

  if (!collectJsLoader) {
    collectJsLoader = new Promise<void>((resolve, reject) => {
      const script =
        (document.getElementById(COLLECT_JS_SCRIPT_ID) as HTMLScriptElement | null) ??
        document.createElement("script");

      script.id = COLLECT_JS_SCRIPT_ID;
      script.src = COLLECT_JS_SCRIPT_SRC;
      script.async = true;
      script.dataset.tokenizationKey = tokenizationKey;

      script.onload = () => resolve();
      script.onerror = () => {
        collectJsLoader = null;
        reject(new Error("Failed to load NMI Collect.js."));
      };

      if (!script.parentNode) {
        document.head.appendChild(script);
      }
    });
  }

  return collectJsLoader;
}

export const PaymentCardForm = forwardRef<
  PaymentCardFormHandle,
  PaymentCardFormProps
>(function PaymentCardForm(
  {
    tokenizationKey,
    onError,
    disabled,
    country,
    currency,
    price,
  },
  ref
) {
  const collectIdRef = useRef(`collect-${Math.random().toString(36).slice(2, 10)}`);
  const pendingTokenizeRef = useRef<{
    resolve: (value: {
      tokenId: string;
      cardType: string | null;
      cardLastFour: string | null;
    }) => void;
    reject: (reason?: unknown) => void;
  } | null>(null);

  const [collectReady, setCollectReady] = useState(false);
  const [fieldState, setFieldState] = useState<CollectJsFieldState>({
    ccnumber: false,
    ccexp: false,
    cvv: false,
  });
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

  const ccNumberId = `${collectIdRef.current}-ccnumber`;
  const ccExpId = `${collectIdRef.current}-ccexp`;
  const cvvId = `${collectIdRef.current}-cvv`;
  const paymentButtonId = `${collectIdRef.current}-pay`;

  useEffect(() => {
    if (!tokenizationKey) {
      setCollectReady(false);
      return;
    }

    let cancelled = false;

    loadCollectJs(tokenizationKey)
      .then(() => {
        if (cancelled || !window.CollectJS) return;

        window.CollectJS.configure({
          variant: "inline",
          paymentSelector: `#${paymentButtonId}`,
          ...(country ? { country } : {}),
          ...(currency ? { currency } : {}),
          ...(price ? { price } : {}),
          fields: {
            ccnumber: {
              selector: `#${ccNumberId}`,
              title: "Card Number",
              placeholder: "0000 0000 0000 0000",
            },
            ccexp: {
              selector: `#${ccExpId}`,
              title: "Card Expiration",
              placeholder: "MM / YY",
            },
            cvv: {
              selector: `#${cvvId}`,
              title: "CVV",
              placeholder: "CVV",
            },
          },
          styleSniffer: false,
          invalidCss: {
            color: "#0f172a",
            "border-color": "#ef4444",
          },
          validCss: {
            color: "#0f172a",
            "border-color": "#10b981",
          },
          focusCss: {
            color: "#0f172a",
            "border-color": "#6366f1",
          },
          placeholderCss: {
            color: "#94a3b8",
          },
          fieldsAvailableCallback: () => {
            if (cancelled) return;
            setCollectReady(true);
            onError("");
          },
          validationCallback: (
            field: keyof CollectJsFieldState,
            status: boolean,
            _message: string
          ) => {
            if (cancelled) return;

            if (field === "ccnumber" || field === "ccexp" || field === "cvv") {
              setFieldState((current) => ({ ...current, [field]: status }));
            }

            if (!status) {
              setPaymentState((current) => ({
                ...current,
                complete: false,
                token: null,
              }));
              onError("");
            }
          },
          callback: (response: CollectJsResponse) => {
            if (cancelled) return;

            if (!response?.token) {
              const message =
                response?.error || "Card tokenization failed. Please try again.";
              setPaymentState((current) => ({
                ...current,
                complete: false,
                token: null,
              }));
              onError(message);
              pendingTokenizeRef.current?.reject(new Error(message));
              pendingTokenizeRef.current = null;
              return;
            }

            const tokenized = {
              tokenId: response.token,
              cardType: toDisplayCardType(response.card?.type),
              cardLastFour: getLastFour(response.card?.number),
            };

            setPaymentState({
              complete: true,
              token: response.token,
              cardType: tokenized.cardType,
              cardLastFour: tokenized.cardLastFour,
            });
            onError("");
            pendingTokenizeRef.current?.resolve(tokenized);
            pendingTokenizeRef.current = null;
          },
        });
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setCollectReady(false);
        onError(error.message || "Failed to load NMI card fields.");
      });

    return () => {
      cancelled = true;
    };
  }, [ccExpId, ccNumberId, cvvId, onError, paymentButtonId, tokenizationKey]);

  const validateCardInput = useCallback((): { valid: boolean; error?: string } => {
    if (!tokenizationKey) {
      return {
        valid: false,
        error: "Online card payments are not configured for this store.",
      };
    }

    if (!collectReady) {
      return {
        valid: false,
        error: "Secure card fields are still loading.",
      };
    }

    if (fieldState.ccnumber && fieldState.ccexp && fieldState.cvv) {
      return { valid: true };
    }

    return {
      valid: false,
      error: "Please complete your card details.",
    };
  }, [collectReady, fieldState, tokenizationKey]);

  const tokenize = useCallback(async () => {
    if (!window.CollectJS) {
      throw new Error("NMI Collect.js is not available.");
    }

    if (!collectReady) {
      throw new Error("Secure card fields are still loading.");
    }

    return new Promise<{
      tokenId: string;
      cardType: string | null;
      cardLastFour: string | null;
    }>((resolve, reject) => {
      pendingTokenizeRef.current = { resolve, reject };

      try {
        window.CollectJS?.startPaymentRequest();
      } catch (error) {
        pendingTokenizeRef.current = null;
        reject(
          error instanceof Error
            ? error
            : new Error("Failed to start NMI tokenization.")
        );
      }
    });
  }, [collectReady]);

  useImperativeHandle(
    ref,
    () => ({
      validateCardInput,
      tokenize,
    }),
    [tokenize, validateCardInput]
  );

  if (!tokenizationKey) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 text-sm"
        style={{
          backgroundColor: "#fffbeb",
          borderLeft: "4px solid #f59e0b",
          color: "#78350f",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
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
            Card entry and tokenization are handled directly by NMI Collect.js.
          </p>
        </div>
        {paymentState.complete ? (
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-700">
            Card ready
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
            {collectReady ? "Enter card details" : "Loading fields"}
          </span>
        )}
      </div>

      <div className={disabled ? "pointer-events-none opacity-60" : ""}>
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Card Number
            </label>
            <div
              id={ccNumberId}
              className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 py-3"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Expiration
            </label>
            <div
              id={ccExpId}
              className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 py-3"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              CVV
            </label>
            <div
              id={cvvId}
              className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 py-3"
            />
          </div>
        </div>

        <button
          id={paymentButtonId}
          type="button"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
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
