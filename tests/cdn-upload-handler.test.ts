import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as jose from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

// Exercise the actual Deno entry point, with only SDKs and network replaced.
// This catches exceptions escaping Deno.serve (source-string checks cannot).
function loadHandler(
  fetchMock: ReturnType<typeof vi.fn>,
  brokenConfig = false,
  verifySession = vi.fn(async () => ({ sub: "user_test" })),
  hasAccess = () => true,
) {
  let handler!: (request: Request) => Promise<Response>;
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    single: async () => ({ data: null, error: null }),
    then: (resolve: (result: unknown) => unknown) =>
      Promise.resolve({ data: hasAccess() ? [{ role: "admin", code: "admin" }] : [] }).then(resolve),
  };
  const source = readFileSync(
    resolve(process.cwd(), "supabase/functions/cdn-upload/index.ts"),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  runInNewContext(outputText, {
    exports: {},
    require: (name: string) => {
      if (name === "npm:@clerk/backend") {
        return { verifyToken: verifySession };
      }
      if (name === "npm:jose@6") return jose;
      if (name === "npm:@supabase/supabase-js") {
        return { createClient: () => {
          if (brokenConfig) throw new Error("private configuration detail");
          return { from: () => query };
        } };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
    Deno: {
      env: { get: (name: string) => name === "BUNNY_CDN_HOSTNAME" ? "cdn.example.test" : "test" },
      serve: (callback: typeof handler) => { handler = callback; },
    },
    Response, Headers, TransformStream, Uint8Array, Error, DOMException, TextEncoder,
    AbortSignal, AbortController, setTimeout, clearTimeout,
    fetch: fetchMock,
    console: { error: vi.fn() },
  });
  return handler;
}

function videoRequest(contentLength = "3") {
  return new Request("https://edge.example.test/cdn-upload", {
    method: "POST",
    headers: {
      authorization: "Bearer test",
      "x-cdn-scope": "merchant",
      "x-cdn-merchant-id": "merchant_test",
      "x-cdn-category": "support",
      "x-cdn-file-name": "recording.mp4",
      "x-cdn-content-type": "video/mp4",
      "content-length": contentLength,
    },
    body: new Uint8Array([1, 2, 3]),
  });
}

describe("CDN binary upload error boundary", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  function prepareRequest() {
    const headers = new Headers(videoRequest().headers);
    headers.delete("content-length");
    return new Request(videoRequest().url, { method: "GET", headers });
  }

  it("authorizes before sending bytes and survives expiry of the original session JWT", async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      await new Response(init.body).arrayBuffer();
      return new Response(null, { status: 201 });
    });
    const verifySession = vi.fn(async () => ({ sub: "user_test" }));
    const handler = loadHandler(fetchMock, false, verifySession);
    const prepared = await handler(prepareRequest());
    expect(prepared.status).toBe(200);
    expect(prepared.headers.get("Cache-Control")).toBe("no-store");
    const { uploadToken } = await prepared.json();
    expect(fetchMock).not.toHaveBeenCalled();
    const claims = jose.decodeJwt(uploadToken);
    expect(claims.exp! - claims.iat!).toBe(900);
    verifySession.mockRejectedValue(new Error("JWT is expired"));
    const request = videoRequest();
    request.headers.delete("authorization");
    request.headers.set("x-cdn-upload-token", uploadToken);
    const uploaded = await handler(request);
    expect(uploaded.status).toBe(201);
    expect(verifySession).toHaveBeenCalledTimes(1);
  });

  it.each(["x-cdn-merchant-id", "x-cdn-file-name", "x-cdn-category", "x-cdn-content-type"])(
    "does not let an upload permission authorize a different %s", async (header) => {
      const fetchMock = vi.fn();
      const handler = loadHandler(fetchMock);
      const { uploadToken } = await (await handler(prepareRequest())).json();
      const request = videoRequest();
      request.headers.set("x-cdn-upload-token", uploadToken);
      request.headers.set(header, "changed");
      expect((await handler(request)).status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("rejects expired and forged upload permissions", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const fetchMock = vi.fn();
    const handler = loadHandler(fetchMock);
    const { uploadToken } = await (await handler(prepareRequest())).json();
    const request = videoRequest();
    request.headers.set("x-cdn-upload-token", uploadToken);
    vi.setSystemTime(Date.now() + 901_000);
    expect((await handler(request)).status).toBe(401);
    request.headers.set("x-cdn-upload-token", "forged.token.value");
    expect((await handler(request)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never accepts an upload permission for deletion", async () => {
    const fetchMock = vi.fn();
    const handler = loadHandler(fetchMock);
    const { uploadToken } = await (await handler(prepareRequest())).json();
    const response = await handler(new Request(videoRequest().url, {
      method: "DELETE", headers: { "x-cdn-upload-token": uploadToken },
    }));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks owner access when issuing the permission and again when uploading", async () => {
    let allowed = false;
    const fetchMock = vi.fn();
    const handler = loadHandler(fetchMock, false, undefined, () => allowed);
    expect((await handler(prepareRequest())).status).toBe(403);
    allowed = true;
    const { uploadToken } = await (await handler(prepareRequest())).json();
    allowed = false;
    const request = videoRequest();
    request.headers.set("x-cdn-upload-token", uploadToken);
    expect((await handler(request)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a readable 502 when Bunny drops the connection after receiving bytes", async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      if (init.method === "DELETE") return new Response(null, { status: 200 });
      await new Response(init.body).arrayBuffer();
      throw new TypeError("connection reset");
    });
    const response = await loadHandler(fetchMock)(videoRequest());
    expect(response.status).toBe(502);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await response.json()).toEqual({
      success: false, error: "CDN storage connection failed. Please retry the upload.",
    });
    expect(fetchMock.mock.calls.map(([, init]) => init.method)).toEqual(["PUT", "DELETE"]);
  });

  it("returns a readable timeout rather than an uncaught runtime failure", async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      if (init.method === "DELETE") return new Response(null, { status: 200 });
      expect(init.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException("deadline exceeded", "TimeoutError");
    });
    const response = await loadHandler(fetchMock)(videoRequest());
    expect(response.status).toBe(504);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect((await response.json()).error).toContain("timed out");
  });

  it("also catches setup failures without disclosing internal configuration", async () => {
    const response = await loadHandler(vi.fn(), true)(videoRequest());
    expect(response.status).toBe(500);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await response.json()).toEqual({ success: false, error: "Internal server error" });
  });

  it("aborts a stalled storage request using a bounded deadline", async () => {
    const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi.spyOn(AbortSignal, "timeout")
      .mockImplementation(() => originalTimeout(20));
    const fetchMock = vi.fn(async (_url, init) => {
      if (init.method === "DELETE") return new Response(null, { status: 200 });
      return await new Promise<Response>((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      });
    });
    const response = await loadHandler(fetchMock)(videoRequest());
    expect(response.status).toBe(504);
    expect(timeout).toHaveBeenNthCalledWith(1, 120_000);
    expect(timeout).toHaveBeenNthCalledWith(2, 10_000);
  });

  it("reports an early Bunny rejection instead of blaming the file length", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
    const response = await loadHandler(fetchMock)(videoRequest());
    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe("Bunny upload failed: 401");
  });

  it("rejects and cleans up a body whose actual length differs from its header", async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      if (init.method === "PUT") await new Response(init.body).arrayBuffer();
      return new Response(null, { status: 201 });
    });
    const response = await loadHandler(fetchMock)(videoRequest("4"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid upload length");
    expect(fetchMock.mock.calls.map(([, init]) => init.method)).toEqual(["PUT", "DELETE"]);
  });

  it("streams a valid upload and returns the CDN URL only after success", async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      expect(Array.from(new Uint8Array(await new Response(init.body).arrayBuffer())))
        .toEqual([1, 2, 3]);
      return new Response(null, { status: 201 });
    });
    const response = await loadHandler(fetchMock)(videoRequest());
    expect(response.status).toBe(201);
    expect((await response.json()).cdnUrl)
      .toBe("https://cdn.example.test/merchants/merchant_test/support/recording.mp4");
  });

  it("preserves size rejection before any Bunny request", async () => {
    const fetchMock = vi.fn();
    const response = await loadHandler(fetchMock)(videoRequest(String(101 * 1024 * 1024)));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
