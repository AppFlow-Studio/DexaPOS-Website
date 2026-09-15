interface FunctionErrorLike {
  message?: unknown;
  context?: unknown;
}

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
