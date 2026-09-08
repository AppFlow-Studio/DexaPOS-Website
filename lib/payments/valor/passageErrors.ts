export interface PassageErrorResult {
  message: string;
  code?: string;
}

const FALLBACK_MESSAGE = "Payment error. Please try again.";

function readString(
  value: Record<string, unknown>,
  keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}

/**
 * Passage.js v2 currently invokes onError with a string, while Valor's API
 * responses use msg/mesg/desc and may nest decline details in switch_response.
 * Normalize every documented shape before it reaches checkout UI.
 */
export function normalizePassageError(error: unknown): PassageErrorResult {
  if (typeof error === "string" && error.trim()) {
    const message = error.trim();
    if (/failed to fetch|network\s*error/i.test(message)) {
      return {
        code: "NETWORK",
        message:
          "Unable to reach Valor's secure payment service. Check the network and try again.",
      };
    }

    return { message };
  }

  if (error instanceof Error) {
    return { message: error.message || FALLBACK_MESSAGE };
  }

  if (!error || typeof error !== "object") {
    return { message: FALLBACK_MESSAGE };
  }

  const value = error as Record<string, unknown>;
  if (value.error !== undefined && value.error !== error) {
    const nested = normalizePassageError(value.error);
    if (nested.message !== FALLBACK_MESSAGE) return nested;
  }

  const switchResponse =
    value.switch_response && typeof value.switch_response === "object"
      ? (value.switch_response as Record<string, unknown>)
      : undefined;
  const source = switchResponse ?? value;
  const message =
    readString(source, ["message", "msg", "mesg", "desc", "response"]) ??
    readString(value, ["message", "msg", "mesg", "desc", "response"]) ??
    FALLBACK_MESSAGE;
  const code =
    readString(source, ["code", "error_code", "error_no", "switch_error_code"]) ??
    readString(value, ["code", "error_code", "error_no", "switch_error_code"]);

  return {
    message: code && !message.startsWith(`${code}:`) ? `${code}: ${message}` : message,
    ...(code ? { code } : {}),
  };
}
