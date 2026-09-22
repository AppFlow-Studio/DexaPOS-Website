interface FunctionErrorLike {
  message?: unknown;
  context?: unknown;
}

/**
 * Supabase's `functions.invoke` surfaces a non-2xx Edge Function response as a
 * `FunctionsHttpError` whose `.message` is the generic "Edge Function returned a
 * non-2xx status code" — the actual reason lives in the response body on
 * `.context`. This reads the `{ error }` field out of that body so callers can
 * show the real message (e.g. "Invalid category") instead of the generic one,
 * falling back to the SDK message and then the caller's fallback.
 */
export async function getFunctionErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  if (error && typeof error === "object") {
    const { context, message } = error as FunctionErrorLike;
    if (context && typeof context === "object" && "json" in context) {
      try {
        const payload = await (context as { json: () => Promise<unknown> }).json();
        if (
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string" &&
          payload.error.trim()
        ) {
          return payload.error;
        }
      } catch {
        // Fall through to the SDK message when the response is not JSON.
      }
    }

    if (typeof message === "string" && message.trim()) return message;
  }

  return fallback;
}
