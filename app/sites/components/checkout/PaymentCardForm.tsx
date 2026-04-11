"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Lock, AlertCircle } from "lucide-react";

declare global {
  interface Window {
    postData?: () => Promise<{ paymentTokenId?: string; payment_token_id?: string; error?: string }>;
  }
}

export interface PaymentCardFormHandle {
  validateCardInput: () => { valid: boolean; error?: string };
  tokenize: () => Promise<{
    tokenId: string;
    cardType: string | null;
    cardLastFour: string | null;
  }>;
}

interface PaymentCardFormProps {
  securityKey?: string | null;
  onError: (error: string) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Card brand detection
// ---------------------------------------------------------------------------

type CardBrand = "visa" | "mastercard" | "amex" | "discover" | "unknown";

function toDisplayCardType(brand: CardBrand): string | null {
  switch (brand) {
    case "visa":
      return "Visa";
    case "mastercard":
      return "Mastercard";
    case "amex":
      return "Amex";
    case "discover":
      return "Discover";
    default:
      return null;
  }
}

function detectCardBrand(number: string): CardBrand {
  const digits = number.replace(/\D/g, "");
  if (!digits) return "unknown";
  if (/^4/.test(digits)) return "visa";
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^6(?:011|5)/.test(digits)) return "discover";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatCardNumber(value: string, brand: CardBrand): string {
  const digits = value.replace(/\D/g, "");
  if (brand === "amex") {
    const d = digits.slice(0, 15);
    const parts = [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(
      Boolean
    );
    return parts.join(" ");
  }
  const d = digits.slice(0, 16);
  const parts = d.match(/.{1,4}/g);
  return parts ? parts.join(" ") : "";
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + "/" + digits.slice(2);
}

function isExpiryValid(value: string): boolean {
  const raw = value.replace(/\D/g, "");
  if (raw.length !== 4) return false;
  const month = Number(raw.slice(0, 2));
  const year2 = Number(raw.slice(2, 4));
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const currentYear2 = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;
  if (year2 < currentYear2) return false;
  if (year2 === currentYear2 && month < currentMonth) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Card brand SVG icons
// ---------------------------------------------------------------------------

function VisaIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 48 32"
      className="h-6 w-9 shrink-0 transition-opacity duration-200"
      style={{ opacity: active ? 1 : 0.25 }}
      fill="none"
    >
      <rect width="48" height="32" rx="4" fill="#1A1F71" />
      <path
        d="M19.5 21h-3l1.9-11.5h3L19.5 21zm8.2-11.2c-.6-.2-1.5-.5-2.7-.5-3 0-5 1.5-5 3.7 0 1.6 1.5 2.5 2.6 3 1.2.6 1.6 1 1.6 1.5 0 .8-1 1.2-1.8 1.2-1.2 0-1.9-.2-2.9-.6l-.4-.2-.4 2.6c.7.3 2.1.6 3.5.6 3.2 0 5.2-1.5 5.2-3.8 0-1.3-.8-2.2-2.5-3-1-.5-1.7-.9-1.7-1.4 0-.5.5-1 1.7-1 1 0 1.7.2 2.2.4l.3.1.3-2.6zm7.8-.3h-2.3c-.7 0-1.3.2-1.6 1L28 21h3.2l.6-1.8h3.8l.4 1.8H39l-2.7-11.5h-1zm-2.2 7.4l1.3-3.4.4-1.1.2 1 .7 3.5h-2.6zM16.3 9.5L13.4 17l-.3-1.5c-.5-1.8-2.2-3.7-4-4.7l2.7 10.2h3.2l4.8-11.5h-3.5z"
        fill="white"
      />
      <path
        d="M11.2 9.5H6.1l-.1.3c3.8.9 6.3 3.2 7.3 5.9l-1.1-5.2c-.2-.8-.7-1-1-.1z"
        fill="#F9A533"
      />
    </svg>
  );
}

function MastercardIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 48 32"
      className="h-6 w-9 shrink-0 transition-opacity duration-200"
      style={{ opacity: active ? 1 : 0.25 }}
      fill="none"
    >
      <rect width="48" height="32" rx="4" fill="#252525" />
      <circle cx="19" cy="16" r="8" fill="#EB001B" />
      <circle cx="29" cy="16" r="8" fill="#F79E1B" />
      <path
        d="M24 9.8a8 8 0 0 1 0 12.4 8 8 0 0 1 0-12.4z"
        fill="#FF5F00"
      />
    </svg>
  );
}

function AmexIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 48 32"
      className="h-6 w-9 shrink-0 transition-opacity duration-200"
      style={{ opacity: active ? 1 : 0.25 }}
      fill="none"
    >
      <rect width="48" height="32" rx="4" fill="#2E77BC" />
      <text
        x="24"
        y="18"
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize="8"
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
      >
        AMEX
      </text>
    </svg>
  );
}

function DiscoverIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 48 32"
      className="h-6 w-9 shrink-0 transition-opacity duration-200"
      style={{ opacity: active ? 1 : 0.25 }}
      fill="none"
    >
      <rect width="48" height="32" rx="4" fill="#F3F4F6" />
      <rect
        x="0.5"
        y="0.5"
        width="47"
        height="31"
        rx="3.5"
        stroke="#D1D5DB"
      />
      <circle cx="30" cy="16" r="6" fill="#F26E22" />
      <text
        x="16"
        y="18"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#1A1A1A"
        fontSize="5.5"
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
      >
        DISC
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PaymentCardForm = forwardRef<
  PaymentCardFormHandle,
  PaymentCardFormProps
>(function PaymentCardForm({ securityKey, onError, disabled }, ref) {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [scriptError, setScriptError] = useState(false);
  const [brand, setBrand] = useState<CardBrand>("unknown");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const cardRef = useRef<HTMLInputElement>(null);
  const expiryRef = useRef<HTMLInputElement>(null);
  const cvvRef = useRef<HTMLInputElement>(null);

  // Load FTD script
  useEffect(() => {
    if (!securityKey) return;

    const existing = document.getElementById("ftd");
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.id = "ftd";
    script.src = "https://payment.ipospays.tech/ftd/v1/freedomtodesign.js";
    script.setAttribute("security_key", securityKey);
    script.async = true;

    script.onload = () => {
      setScriptLoaded(true);
      setScriptError(false);
    };

    script.onerror = () => {
      setScriptError(true);
      onError("Failed to load payment form. Please refresh and try again.");
    };

    document.body.appendChild(script);
    scriptRef.current = script;

    return () => {
      if (scriptRef.current) {
        scriptRef.current.remove();
        scriptRef.current = null;
      }
    };
  }, [securityKey, onError]);

  const tokenize = useCallback(async (): Promise<{
    tokenId: string;
    cardType: string | null;
    cardLastFour: string | null;
  }> => {
    if (!window.postData) {
      throw new Error(
        "Payment form not ready. Please wait a moment and try again."
      );
    }

    const result = await window.postData();
    console.log("[FTD] postData result:", result);

    // FTD may return the token as a plain string
    const cardDigits = cardRef.current?.value.replace(/\D/g, "") || "";
    const cardLastFour = cardDigits.slice(-4) || null;
    const cardType = toDisplayCardType(brand);

    if (typeof result === "string" && result.length > 0) {
      return { tokenId: result, cardType, cardLastFour };
    }

    if (result?.error) {
      throw new Error(result.error);
    }

    const tokenId =
      result?.paymentTokenId ||
      result?.payment_token_id ||
      result?.tokenId ||
      result?.token ||
      result?.id;

    if (!tokenId) {
      throw new Error(
        "Card tokenization failed. Please check your card details."
      );
    }

    return {
      tokenId,
      cardType,
      cardLastFour,
    };
  }, [brand]);

  const validateCardInput = useCallback((): { valid: boolean; error?: string } => {
    const cardDigits = cardRef.current?.value.replace(/\D/g, "") || "";
    const expiry = expiryRef.current?.value || "";
    const cvv = cvvRef.current?.value.replace(/\D/g, "") || "";
    const minCardLength = brand === "amex" ? 15 : 16;
    const expectedCvvLength = brand === "amex" ? 4 : 3;

    if (!cardDigits || !expiry || !cvv) {
      return { valid: false, error: "Please enter card number, expiry, and CVV." };
    }
    if (cardDigits.length < minCardLength) {
      return { valid: false, error: "Please enter a valid card number." };
    }
    if (!isExpiryValid(expiry)) {
      return { valid: false, error: "Please enter a valid expiry date." };
    }
    if (cvv.length !== expectedCvvLength) {
      return { valid: false, error: "Please enter a valid CVV." };
    }

    return { valid: true };
  }, [brand]);

  useImperativeHandle(ref, () => ({ tokenize, validateCardInput }), [tokenize, validateCardInput]);

  // --- Uncontrolled input handlers (format via DOM, update brand via state) ---

  const handleCardNumberInput = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    const raw = el.value;
    const currentBrand = detectCardBrand(raw);
    const formatted = formatCardNumber(raw, currentBrand);

    // Preserve cursor position relative to digits typed
    const cursorBefore = el.selectionStart ?? formatted.length;
    const digitsBefore = raw.slice(0, cursorBefore).replace(/\D/g, "").length;

    // Write formatted value directly to DOM
    el.value = formatted;

    // Restore cursor: count digits in formatted string until we hit digitsBefore
    let newCursor = 0;
    let counted = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted[i])) counted++;
      newCursor = i + 1;
      if (counted >= digitsBefore) break;
    }
    el.setSelectionRange(newCursor, newCursor);

    setBrand(currentBrand);
  }, []);

  const handleExpiryInput = useCallback(() => {
    const el = expiryRef.current;
    if (!el) return;
    const formatted = formatExpiry(el.value);
    el.value = formatted;
  }, []);

  const handleCvvInput = useCallback(() => {
    const el = cvvRef.current;
    if (!el) return;
    const maxLen = brand === "amex" ? 4 : 3;
    el.value = el.value.replace(/\D/g, "").slice(0, maxLen);
  }, [brand]);

  // When no securityKey, inputs are usable (no FTD tokenization — test/bypass mode)
  const inputDisabled = disabled || (!!securityKey && !scriptLoaded);

  const maxCardLen = brand === "amex" ? 17 : 19;
  const maxCvv = brand === "amex" ? 4 : 3;

  const inputStyle = (field: string) => ({
    backgroundColor: "var(--bg)",
    border: `1.5px solid ${focusedField === field ? "var(--primary)" : "var(--border)"}`,
    borderRadius: "var(--radius)",
    color: "var(--text)",
    outline: "none",
    transition: "border-color 0.15s ease",
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 shrink-0"
          style={{ color: "var(--text)" }}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="1" y="4" width="22" height="16" rx="3" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
        <h3
          className="text-base font-semibold"
          style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}
        >
          Payment
        </h3>
        <div className="flex items-center gap-1 ml-auto">
          <Lock
            className="h-3.5 w-3.5"
            style={{ color: "var(--text-secondary)" }}
          />
          <span
            className="text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            Secure
          </span>
        </div>
      </div>

      {scriptError && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg text-sm"
          style={{
            backgroundColor: "color-mix(in srgb, #ef4444 10%, var(--bg))",
            color: "#ef4444",
            borderRadius: "var(--radius)",
          }}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          Failed to load payment form. Please refresh the page.
        </div>
      )}

      <div
        className="space-y-3 p-4 rounded-lg"
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          opacity: disabled ? 0.5 : 1,
          pointerEvents: disabled ? "none" : "auto",
        }}
      >
        {/* Card brands row */}
        <div className="flex items-center gap-1.5 mb-1">
          <VisaIcon active={brand === "visa" || brand === "unknown"} />
          <MastercardIcon
            active={brand === "mastercard" || brand === "unknown"}
          />
          <AmexIcon active={brand === "amex" || brand === "unknown"} />
          <DiscoverIcon
            active={brand === "discover" || brand === "unknown"}
          />
        </div>

        {/* Card Number — UNCONTROLLED so FTD script can read it */}
        <div className="space-y-1.5">
          <label
            htmlFor="ccnumber"
            className="text-xs font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Card Number
          </label>
          <input
            ref={cardRef}
            id="ccnumber"
            type="text"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder={
              brand === "amex"
                ? "3456 789012 34567"
                : "1234 5678 9012 3456"
            }
            disabled={inputDisabled}
            maxLength={maxCardLen}
            onInput={handleCardNumberInput}
            onFocus={() => setFocusedField("ccnumber")}
            onBlur={() => setFocusedField(null)}
            className="w-full px-3 py-2.5 text-sm tracking-wider font-mono"
            style={inputStyle("ccnumber")}
          />
        </div>

        {/* Security trust line */}
        <div className="flex items-center gap-1.5">
          <Lock className="h-3 w-3 shrink-0" style={{ color: "var(--text-secondary)" }} />
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            256-bit SSL encrypted · PCI DSS compliant
          </span>
        </div>

        {/* Expiry + CVV row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="ccexpiry"
              className="text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Expiry
            </label>
            <input
              ref={expiryRef}
              id="ccexpiry"
              type="text"
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM/YY"
              disabled={inputDisabled}
              maxLength={5}
              onInput={handleExpiryInput}
              onFocus={() => setFocusedField("ccexpiry")}
              onBlur={() => setFocusedField(null)}
              className="w-full px-3 py-2.5 text-sm tracking-wider font-mono"
              style={inputStyle("ccexpiry")}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="cccvv"
              className="text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              CVV
            </label>
            <input
              ref={cvvRef}
              id="cccvv"
              type="text"
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder={brand === "amex" ? "1234" : "123"}
              disabled={inputDisabled}
              maxLength={maxCvv}
              onInput={handleCvvInput}
              onFocus={() => setFocusedField("cccvv")}
              onBlur={() => setFocusedField(null)}
              className="w-full px-3 py-2.5 text-sm tracking-wider font-mono"
              style={inputStyle("cccvv")}
            />
          </div>
        </div>

        {securityKey && !scriptLoaded && !scriptError && (
          <div className="flex items-center justify-center py-2">
            <div
              className="h-4 w-4 border-2 rounded-full animate-spin"
              style={{
                borderColor: "var(--border)",
                borderTopColor: "var(--primary)",
              }}
            />
            <span
              className="ml-2 text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              Loading secure payment...
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
