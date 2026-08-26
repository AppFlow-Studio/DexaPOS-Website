"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Lock } from "lucide-react";

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

// customCss is handed to NMI as plain declarations and injected into a
// cross-origin iframe, so CSS variables can't resolve there. Read the storefront
// theme values on this side and pass concrete colors through.
function resolveThemeColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

// NMI accepts only plain hex/rgb here — color-mix() and var() would be sent as
// literal text into the iframe and dropped. Build the focus ring manually.
function withAlpha(color: string, alpha: number): string {
  const hex = color.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return color;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    timeoutId: ReturnType<typeof setTimeout>;
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

    const primaryColor = resolveThemeColor("--primary", "#6366f1");
    // Matches the "Pay cash in store" card and the other checkout sections,
    // which all use `1px solid var(--border)`. Fallback is the theme default.
    const borderColor = resolveThemeColor("--border", "#E5E7EB");

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
          // The <input> inside NMI's secure iframe IS the visible field — the
          // outer wrapper draws no chrome. CollectJS exposes only these five
          // *Css options and they all target the input; there's no hook for the
          // iframe body, and it ignores border-radius (corners stay square).
          customCss: {
            border: `1px solid ${borderColor} !important`,
            "border-color": `${borderColor} !important`,
            outline: "none !important",
            "box-shadow": "none !important",
            background: "#ffffff !important",
            color: "#0f172a",
            "font-size": "14px",
            "font-family":
              "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
            width: "100%",
            height: "44px",
            "line-height": "normal",
            padding: "0 14px",
            margin: "0",
            "box-sizing": "border-box",
          },
          invalidCss: {
            color: "#0f172a",
            "border-color": "#ef4444 !important",
          },
          validCss: {
            color: "#0f172a",
            "border-color": `${primaryColor} !important`,
          },
          focusCss: {
            color: "#0f172a",
            "border-color": `${primaryColor} !important`,
            "box-shadow": `0 0 0 3px ${withAlpha(primaryColor, 0.18)} !important`,
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
              if (pendingTokenizeRef.current) {
                clearTimeout(pendingTokenizeRef.current.timeoutId);
                pendingTokenizeRef.current.reject(new Error(message));
                pendingTokenizeRef.current = null;
              }
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
            if (pendingTokenizeRef.current) {
              clearTimeout(pendingTokenizeRef.current.timeoutId);
              pendingTokenizeRef.current.resolve(tokenized);
              pendingTokenizeRef.current = null;
            }
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
      // NMI's callback never fires when the tokenization key is rejected (e.g.
      // a 401 from Collect.js), which would leave this promise — and the
      // place-order flow — hanging forever. Bound the wait so a bad key surfaces
      // a clear error instead of freezing checkout.
      const timeoutId = setTimeout(() => {
        if (pendingTokenizeRef.current) {
          pendingTokenizeRef.current = null;
          const message =
            "We couldn't process this card right now. Please try again or use a different payment method.";
          onError(message);
          reject(new Error(message));
        }
      }, 20000);

      pendingTokenizeRef.current = { resolve, reject, timeoutId };

      try {
        window.CollectJS?.startPaymentRequest();
      } catch (error) {
        clearTimeout(timeoutId);
        pendingTokenizeRef.current = null;
        reject(
          error instanceof Error
            ? error
            : new Error("Failed to start NMI tokenization.")
        );
      }
    });
  }, [collectReady, onError]);

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
        className="flex items-center gap-3 px-4 py-3 text-sm rounded-xl"
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

  // Bare layout slots — no border, no padding, no background. The visible field
  // chrome is the <input> inside NMI's iframe, styled via customCss above; a
  // wrapper border would double it up.
  const fieldClass = "nmi-field h-11";

  return (
    <div className={disabled ? "pointer-events-none opacity-60" : ""}>
      <style>{`
        /* Layout only — the visible border is on the input inside the iframe
           (see customCss). Do NOT add overflow:hidden here to round the corners:
           the iframe body has its own margin, so clipping slices the input's top
           and bottom borders off entirely. */
        .nmi-field {
          border: 0;
          padding: 0;
          background: transparent;
        }
        .nmi-field iframe {
          display: block;
          width: 100% !important;
          border: 0;
        }
      `}</style>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted, #64748b)" }}>
          <Lock className="h-3.5 w-3.5" style={{ color: "var(--primary, #10b981)" }} />
          Payments are secure and encrypted
        </div>
        {paymentState.complete && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: "color-mix(in srgb, var(--primary,#10b981) 12%, transparent)", color: "var(--primary,#059669)" }}
          >
            Card ready
          </span>
        )}
      </div>

      {/* Card number — full width */}
      <div id={ccNumberId} className={fieldClass} />

      {/* Expiration + CVV row */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div id={ccExpId} className={fieldClass} />
        <div id={cvvId} className={fieldClass} />
      </div>

      {!collectReady && (
        <p className="mt-2 text-xs" style={{ color: "var(--text-muted, #94a3b8)" }}>
          Loading secure card fields…
        </p>
      )}

      <button
        id={paymentButtonId}
        type="button"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
});
