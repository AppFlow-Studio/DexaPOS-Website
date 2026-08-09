"use client";

/**
 * [C2] Passage.js v2 loader and card-form host.
 *
 * Consumed by C3 (storefront checkout). Raw card data never reaches DEXA — the
 * SDK collects it in Valor's own fields and returns a token, which the server
 * then charges via `saleApi.createSale`. That is what keeps PCI scope small,
 * and it is why this component never accepts or exposes a card number.
 *
 * The client token must be minted server-side (`getClientToken`) and passed in.
 * The APP key that produced it must never be handed to this component.
 *
 * Source re-fetched 2026-08-09: [V-PASS2] documentation-v20.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PASSAGE_JS_V2_URL } from "./config";

/** DEXA brand blue, per the arch parent's storefront requirement. */
export const DEXA_BRAND_BLUE = "#0C4FD1";

export type PassageVariant = "inline" | "lightbox";

export interface PassageTokenResult {
  token: string;
  method?: string;
}

export interface PassageErrorResult {
  message?: string;
  code?: string;
  [key: string]: unknown;
}

/** Options accepted by the Passage.js v2 constructor. */
interface PassageOptions {
  clientToken: string;
  epi: string;
  formAction: string;
  variant?: PassageVariant;
  isDemo?: boolean;
  enableACH?: boolean;
  submitText?: string;
  sessionExpiryMinutes?: number;
  customData?: Record<string, string>;
  onSuccess?: (result: unknown) => void;
  onError?: (error: PassageErrorResult) => void;
  onValidationChange?: (isValid: boolean, validation: unknown) => void;
  onTokenReceived?: (token: string, method?: string) => void;
  onFormSubmit?: (formData: unknown, action: string) => void;
}

interface PassageInstance {
  mount?: (selector: string | HTMLElement) => void;
  destroy?: () => void;
  setCustomData?: (data: Record<string, string>) => void;
}

type PassageConstructor = new (options: PassageOptions) => PassageInstance;

declare global {
  interface Window {
    PassageJS?: PassageConstructor;
  }
}

/**
 * Load the SDK once per page.
 *
 * Resolves against an existing tag if one is already present, so multiple
 * checkout surfaces on one page do not race each other into duplicate loads.
 */
function loadPassageScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Passage.js can only load in the browser"));
  }
  if (window.PassageJS) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${PASSAGE_JS_V2_URL}"]`
  );

  if (existing) {
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Passage.js failed to load")),
        { once: true }
      );
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PASSAGE_JS_V2_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Passage.js failed to load"));
    document.head.appendChild(script);
  });
}

export interface PassageCheckoutProps {
  /** Short-lived token from the server's `getClientToken` call. */
  clientToken: string;
  epi: string;
  /** Server endpoint Passage.js posts the tokenized payload to. */
  formAction: string;
  /** Must match the server's resolved environment. See `resolveValorEndpoints`. */
  isDemo: boolean;
  variant?: PassageVariant;
  submitText?: string;
  /** ACH is feature-flagged off for this ticket. */
  enableACH?: boolean;
  sessionExpiryMinutes?: number;
  customData?: Record<string, string>;
  onTokenReceived?: (result: PassageTokenResult) => void;
  onSuccess?: (result: unknown) => void;
  onError?: (error: PassageErrorResult) => void;
  onValidationChange?: (isValid: boolean) => void;
  /** Rendered when the SDK cannot load. */
  unavailableFallback?: React.ReactNode;
  className?: string;
}

/**
 * Renders the Valor card form.
 *
 * When the SDK fails to load the component renders `unavailableFallback`
 * instead of an empty container — the QA matrix requires a network failure to
 * surface as "Payment temporarily unavailable" rather than a silent dead form
 * that a customer could mistake for a submitted order.
 */
export function PassageCheckout({
  clientToken,
  epi,
  formAction,
  isDemo,
  variant = "inline",
  submitText = "Pay Now",
  enableACH = false,
  sessionExpiryMinutes,
  customData,
  onTokenReceived,
  onSuccess,
  onError,
  onValidationChange,
  unavailableFallback,
  className,
}: PassageCheckoutProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<PassageInstance | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading"
  );

  // Callbacks are held in a ref so that a parent re-render with new closures
  // does not tear down and re-mount the card form mid-entry.
  const handlersRef = useRef({
    onTokenReceived,
    onSuccess,
    onError,
    onValidationChange,
  });
  handlersRef.current = {
    onTokenReceived,
    onSuccess,
    onError,
    onValidationChange,
  };

  const teardown = useCallback(() => {
    instanceRef.current?.destroy?.();
    instanceRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadPassageScript()
      .then(() => {
        if (cancelled) return;

        const Passage = window.PassageJS;
        if (!Passage || !containerRef.current) {
          setStatus("unavailable");
          return;
        }

        const instance = new Passage({
          clientToken,
          epi,
          formAction,
          variant,
          isDemo,
          enableACH,
          submitText,
          ...(sessionExpiryMinutes !== undefined ? { sessionExpiryMinutes } : {}),
          ...(customData ? { customData } : {}),
          onTokenReceived: (token, method) =>
            handlersRef.current.onTokenReceived?.({ token, method }),
          onSuccess: (result) => handlersRef.current.onSuccess?.(result),
          onError: (error) => handlersRef.current.onError?.(error),
          onValidationChange: (isValid) =>
            handlersRef.current.onValidationChange?.(isValid),
        });

        instance.mount?.(containerRef.current);
        instanceRef.current = instance;
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });

    return () => {
      cancelled = true;
      teardown();
    };
  }, [
    clientToken,
    epi,
    formAction,
    variant,
    isDemo,
    enableACH,
    submitText,
    sessionExpiryMinutes,
    customData,
    teardown,
  ]);

  if (status === "unavailable") {
    return (
      <>
        {unavailableFallback ?? (
          <p role="alert">
            Payment is temporarily unavailable. Please try again in a moment.
          </p>
        )}
      </>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      data-passage-status={status}
      style={{ ["--passage-submit-color" as string]: DEXA_BRAND_BLUE }}
    />
  );
}

export default PassageCheckout;
