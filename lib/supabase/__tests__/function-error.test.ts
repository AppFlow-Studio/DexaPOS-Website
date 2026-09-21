import { describe, expect, it } from "vitest";

import { getFunctionErrorMessage } from "@/lib/supabase/function-error";

describe("getFunctionErrorMessage", () => {
  it("returns the Edge Function response error", async () => {
    const error = {
      message: "Edge Function returned a non-2xx status code",
      context: new Response(JSON.stringify({ error: "Invalid category" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    };

    await expect(getFunctionErrorMessage(error, "Upload failed")).resolves.toBe(
      "Invalid category",
    );
  });

  it("falls back to the SDK message for a non-JSON response", async () => {
    const error = {
      message: "Upload service unavailable",
      context: new Response("offline", { status: 503 }),
    };

    await expect(getFunctionErrorMessage(error, "Upload failed")).resolves.toBe(
      "Upload service unavailable",
    );
  });

  it("uses the fallback when there is no message or response body", async () => {
    await expect(getFunctionErrorMessage({}, "Upload failed")).resolves.toBe(
      "Upload failed",
    );
    await expect(getFunctionErrorMessage(null, "Upload failed")).resolves.toBe(
      "Upload failed",
    );
  });
});
