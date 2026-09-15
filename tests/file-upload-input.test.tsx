/** @vitest-environment happy-dom */

import {
  act,
  StrictMode,
  type ComponentProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ getToken: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: authMocks.getToken }),
}));

import FileUploadInput from "@/components/support/FileUploadInput";
import type { AttachmentInput } from "@/types/support-ticket";

function UploadHarness(props: {
  onAttachments?: (a: AttachmentInput[]) => void;
  getUploadUrl?: ComponentProps<typeof FileUploadInput>["getUploadUrl"];
}) {
  const { onAttachments, getUploadUrl } = props;
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);

  // Must be referentially stable: the component re-runs its notify effect
  // whenever `onUploadsChange` changes identity, so an inline arrow here would
  // loop forever and blow the stack.
  const latestOnAttachments = useRef(onAttachments);
  useEffect(() => {
    latestOnAttachments.current = onAttachments;
  }, [onAttachments]);

  const handleUploadsChange = useCallback((next: AttachmentInput[]) => {
    setAttachments(next);
    latestOnAttachments.current?.(next);
  }, []);

  return (
    <>
      <FileUploadInput
        onUploadsChange={handleUploadsChange}
        getUploadUrl={
          getUploadUrl ??
          (async () => ({
            target: {
              provider: "supabase",
              upload_url: "https://uploads.example.test/file",
              method: "PUT",
              file_path: "admin/drafts/user/file.pdf",
            },
          }))
        }
        sessionId="test-session"
      />
      <output data-testid="attachment-count">{attachments.length}</output>
    </>
  );
}

/**
 * The component uploads via XMLHttpRequest (fetch cannot report upload
 * progress), so tests stub XHR rather than fetch. Instances are captured so a
 * test can drive progress events and completion by hand.
 */
type FakeXhr = {
  status: number;
  upload: {
    onprogress?: (e: {
      lengthComputable: boolean;
      loaded: number;
      total: number;
    }) => void;
    onload?: () => void;
  };
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  open: (method: string, url: string, async?: boolean) => void;
  setRequestHeader: (key: string, value: string) => void;
  send: (body?: unknown) => void;
  abort: () => void;
  requestHeaders: Record<string, string>;
  aborted: boolean;
  responseText: string;
  openedMethod?: string;
};

let xhrInstances: FakeXhr[] = [];

/**
 * Patches XMLHttpRequest's prototype methods rather than replacing the global.
 * happy-dom's XHR is wired into its own internals, and swapping the constructor
 * out from under it kills the test worker — so we keep its objects and only
 * intercept open/send/abort, which is all the component uses.
 */
function installXhrStub(options: {
  autoComplete?: boolean;
  responseText?: string;
  /**
   * Fire `onerror` (a transport failure) for this many attempts before letting
   * the transfer succeed, to exercise automatic retry.
   */
  failFirstAttempts?: number;
}) {
  const autoComplete = options.autoComplete !== false;
  let attemptsSoFar = 0;
  xhrInstances = [];

  // Typed loosely on purpose: these are XHR's own prototype methods, and the
  // stubs only need to satisfy the handful of members the component touches.
  const proto = XMLHttpRequest.prototype as unknown as Record<
    string,
    (...args: never[]) => unknown
  >;

  vi.spyOn(proto, "open").mockImplementation(function (
    this: FakeXhr,
    ...args: never[]
  ) {
    // `status` is a read-only accessor on happy-dom's XHR; it is set in send().
    this.requestHeaders = {};
    this.aborted = false;
    this.openedMethod = (args as unknown as [string])[0];
    xhrInstances.push(this);
  });

  vi.spyOn(proto, "setRequestHeader").mockImplementation(function (
    this: FakeXhr,
    ...args: never[]
  ) {
    const [key, value] = args as unknown as [string, string];
    this.requestHeaders[key] = value;
  });

  vi.spyOn(proto, "send").mockImplementation(function (this: FakeXhr) {
    if (!autoComplete) return;

    attemptsSoFar += 1;
    if (attemptsSoFar <= (options.failFirstAttempts ?? 0)) {
      // A dropped connection: the browser reports onerror with no readable
      // response, which is what the component treats as retryable.
      setTimeout(() => this.onerror?.(), 0);
      return;
    }

    // happy-dom's XHR reports status 0 when send() is stubbed out; the component
    // treats anything outside 2xx as a failure, so publish a success status.
    try {
      Object.defineProperty(this, "status", {
        configurable: true,
        get: () => 200,
      });
      Object.defineProperty(this, "responseText", {
        configurable: true,
        get: () => options.responseText ?? "",
      });
    } catch {
      /* status already redefined on this instance */
    }
    // Complete asynchronously, as a real XHR does. Firing onload synchronously
    // inside send() would re-enter React's state updates from the same call
    // stack that triggered them.
    setTimeout(() => {
      this.upload?.onprogress?.({
        lengthComputable: true,
        loaded: 1,
        total: 1,
      });
      this.upload?.onload?.();
      this.onload?.();
    }, 0);
  });

  vi.spyOn(proto, "abort").mockImplementation(function (this: FakeXhr) {
    this.aborted = true;
    this.onabort?.();
  });
}

function selectFile(container: HTMLElement, file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  return input;
}

describe("FileUploadInput", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    authMocks.getToken.mockReset().mockResolvedValue("clerk-test-token");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      success: true, uploadToken: "file-specific-upload-token",
    }), { status: 200 })));
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
    installXhrStub({});
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("notifies the parent only after the upload state commits", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await act(async () => {
      root.render(<UploadHarness />);
    });

    const file = new File(["ticket evidence"], "evidence.pdf", {
      type: "application/pdf",
    });
    const input = selectFile(container, file);

    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="attachment-count"]')
          ?.textContent,
      ).toBe("1");
    });

    const crossComponentUpdate = consoleError.mock.calls.some((call) =>
      call.some(
        (value) =>
          typeof value === "string" &&
          value.includes("Cannot update a component") &&
          value.includes("while rendering a different component"),
      ),
    );
    expect(crossComponentUpdate).toBe(false);
  });

  it("uploads after Strict Mode replays the mount effect", async () => {
    await act(async () => {
      root.render(
        <StrictMode>
          <UploadHarness />
        </StrictMode>,
      );
    });

    const file = new File(["repro recording"], "repro.mp4", {
      type: "video/mp4",
    });
    const input = selectFile(container, file);

    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="attachment-count"]')?.textContent,
      ).toBe("1");
    });
    expect(xhrInstances).toHaveLength(1);
    expect(container.textContent).not.toContain("Preparing");
  });

  it("posts videos to the authenticated CDN target and saves its URL", async () => {
    const cdnUrl =
      "https://cdn.example.test/merchants/merchant-1/support/session_file_repro.mp4";
    installXhrStub({
      responseText: JSON.stringify({ success: true, cdnUrl }),
    });
    const seen: AttachmentInput[][] = [];

    await act(async () => {
      root.render(
        <StrictMode>
          <UploadHarness
            onAttachments={(attachments) => seen.push(attachments)}
            getUploadUrl={async () => ({
              target: {
                provider: "cdn",
                upload_url: "https://project.supabase.co/functions/v1/cdn-upload",
                method: "POST",
                file_path: cdnUrl,
                headers: {
                  "x-cdn-scope": "merchant",
                  "x-cdn-merchant-id": "merchant-1",
                  "x-cdn-category": "support",
                  "x-cdn-file-name": "session_file_repro.mp4",
                  "x-cdn-content-type": "video/mp4",
                },
              },
            })}
          />
        </StrictMode>,
      );
    });

    const input = selectFile(
      container,
      new File(["video"], "repro.mp4", { type: "video/mp4" }),
    );
    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(seen.at(-1)?.[0]?.file_path).toBe(cdnUrl);
    });
    expect(xhrInstances[0]?.openedMethod).toBe("POST");
    // The `supabase` JWT template is requested first: a bare getToken() can
    // return a non-JWT session ticket, which cdn-upload rejects with
    // "Invalid JWT form". A bare call remains as the fallback.
    //
    // `leewayInSeconds: 0` matters as much as `skipCache`: Clerk tokens live
    // 60s, and the default leeway served one with ~0s left, so it expired
    // between the prepare call and verification — the upload then 502'd before
    // the function booted, and the browser reported only an unreadable error.
    expect(authMocks.getToken).toHaveBeenCalledWith({
      template: "supabase",
      skipCache: true,
      leewayInSeconds: 0,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/functions/v1/cdn-upload",
      expect.objectContaining({ method: "GET", headers: expect.objectContaining({
        Authorization: "Bearer clerk-test-token", "x-cdn-file-name": "session_file_repro.mp4",
      }) }),
    );
    expect(xhrInstances[0]?.requestHeaders.Authorization).toBeUndefined();
    expect(xhrInstances[0]?.requestHeaders["x-cdn-upload-token"]).toBe("file-specific-upload-token");
    expect(xhrInstances[0]?.requestHeaders.apikey).toBe("publishable-test-key");
    expect(xhrInstances[0]?.requestHeaders["x-cdn-category"]).toBe("support");
  });

  it("falls back to a bare session token when the supabase template is unavailable", async () => {
    // Projects without a `supabase` JWT template configured reject the
    // templated call; the upload must still authorize via the bare token.
    authMocks.getToken.mockReset().mockImplementation(
      async (options?: { template?: string }) => {
        if (options?.template === "supabase") {
          throw new Error("No JWT template exists with name: supabase");
        }
        return "bare-session-token";
      },
    );

    const cdnUrl = "https://cdn.example.test/organizations/org_1/support/session_file_repro.mp4";
    installXhrStub({
      responseText: JSON.stringify({ success: true, cdnUrl }),
    });
    const seen: AttachmentInput[][] = [];
    await act(async () => {
      root.render(
        <StrictMode>
          <UploadHarness
            onAttachments={(a) => seen.push(a)}
            getUploadUrl={async () => ({
              target: {
                provider: "cdn",
                upload_url: "https://project.supabase.co/functions/v1/cdn-upload",
                method: "POST",
                file_path: cdnUrl,
                headers: {
                  "x-cdn-scope": "organization",
                  "x-cdn-organization-id": "org_1",
                  "x-cdn-category": "support",
                  "x-cdn-file-name": "session_file_repro.mp4",
                  "x-cdn-content-type": "video/mp4",
                },
              },
            })}
          />
        </StrictMode>,
      );
    });

    const input = selectFile(
      container,
      new File(["video"], "repro.mp4", { type: "video/mp4" }),
    );
    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(seen.at(-1)?.[0]?.file_path).toBe(cdnUrl);
    });
    expect(authMocks.getToken).toHaveBeenCalledWith({
      skipCache: true,
      leewayInSeconds: 0,
    });
  });

  it("does not start a transfer if cancelled while awaiting authentication", async () => {
    let resolveToken!: (token: string) => void;
    authMocks.getToken.mockReturnValue(new Promise<string>((resolve) => {
      resolveToken = resolve;
    }));
    await act(async () => {
      root.render(
        <StrictMode>
          <UploadHarness getUploadUrl={async () => ({
            target: {
              provider: "cdn",
              upload_url: "https://project.supabase.co/functions/v1/cdn-upload",
              method: "POST",
              file_path: "https://cdn.example.test/merchants/test/support/repro.mp4",
            },
          })} />
        </StrictMode>,
      );
    });
    const input = selectFile(container, new File(["video"], "repro.mp4", {
      type: "video/mp4",
    }));
    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(authMocks.getToken).toHaveBeenCalled();
    expect(container.textContent).toContain("Preparing");
    await act(async () => {
      container.querySelector('button[aria-label="Cancel upload"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      resolveToken("clerk-test-token");
    });
    expect(xhrInstances).toHaveLength(0);
    expect(container.querySelector('[data-testid="attachment-count"]')?.textContent)
      .toBe("0");
  });

  const getCdnTarget: ComponentProps<typeof FileUploadInput>["getUploadUrl"] = async () => ({
    target: {
      provider: "cdn", method: "POST",
      upload_url: "https://project.supabase.co/functions/v1/cdn-upload",
      file_path: "https://cdn.example.test/merchants/test/support/repro.mp4",
    },
  });

  it("shows an expired session before sending any video bytes", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));
    await act(async () => { root.render(<UploadHarness getUploadUrl={getCdnTarget} />); });
    const input = selectFile(container, new File(["video"], "repro.mp4", { type: "video/mp4" }));
    await act(async () => { input?.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(xhrInstances).toHaveLength(0);
    expect(container.textContent).toContain("Your session expired");
    expect(container.textContent).not.toContain("Preparing");
  });

  it.each(["cancel", "unmount"])("aborts pending file authorization on %s", async (action) => {
    let preparationSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      preparationSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        preparationSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    await act(async () => { root.render(<UploadHarness getUploadUrl={getCdnTarget} />); });
    const input = selectFile(container, new File(["video"], "repro.mp4", { type: "video/mp4" }));
    await act(async () => { input?.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.textContent).toContain("Preparing");
    await act(async () => {
      if (action === "unmount") root.render(null);
      else container.querySelector('button[aria-label="Cancel upload"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(preparationSignal?.aborted).toBe(true);
    expect(xhrInstances).toHaveLength(0);
  });

  it("derives a content type for an iOS .mov reported as octet-stream", async () => {
    const seen: AttachmentInput[][] = [];

    await act(async () => {
      root.render(<UploadHarness onAttachments={(a) => seen.push(a)} />);
    });

    // What Safari/iOS commonly hands over for a screen recording.
    const file = new File(["ios recording"], "screen-recording.mov", {
      type: "application/octet-stream",
    });
    const input = selectFile(container, file);

    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="attachment-count"]')?.textContent,
      ).toBe("1");
    });

    // The CDN lane rejects octet-stream, so the upload must carry the derived
    // type both on the wire and in the recorded attachment metadata.
    expect(xhrInstances[0]?.requestHeaders["Content-Type"]).toBe(
      "video/quicktime",
    );
    const latest = seen.at(-1)?.[0];
    expect(latest?.file_type).toBe("video/quicktime");
  });

  it("rejects an oversize file before sending any bytes, naming the cap", async () => {
    await act(async () => {
      root.render(<UploadHarness />);
    });

    const oversize = new File(["x"], "huge.mp4", { type: "video/mp4" });
    // 120 MB — over the 100 MB cap.
    Object.defineProperty(oversize, "size", {
      configurable: true,
      value: 120 * 1024 * 1024,
    });
    const input = selectFile(container, oversize);

    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // No upload attempted at all.
    expect(xhrInstances).toHaveLength(0);
    expect(
      container.querySelector('[data-testid="attachment-count"]')?.textContent,
    ).toBe("0");
    expect(container.textContent).toContain("100MB");
  });

  it("accepts a video of exactly the 100 MB cap", async () => {
    // The boundary itself must upload: every layer (client, Edge Function
    // declared/actual bytes, Zod schema, and the HQ ticket RPC) compares with
    // `>` / inclusive max, so 104857600 bytes is allowed and 104857601 is not.
    // Without this, an off-by-one turning `>` into `>=` would silently reject
    // a valid file and only the oversize test would still pass.
    const cdnUrl =
      "https://cdn.example.test/merchants/merchant-1/support/session_file_repro.mp4";
    installXhrStub({
      responseText: JSON.stringify({ success: true, cdnUrl }),
    });
    const seen: AttachmentInput[][] = [];

    await act(async () => {
      root.render(
        <StrictMode>
          <UploadHarness
            onAttachments={(attachments) => seen.push(attachments)}
            getUploadUrl={async () => ({
              target: {
                provider: "cdn",
                upload_url: "https://project.supabase.co/functions/v1/cdn-upload",
                method: "POST",
                file_path: cdnUrl,
                headers: {
                  "x-cdn-scope": "merchant",
                  "x-cdn-merchant-id": "merchant-1",
                  "x-cdn-category": "support",
                  "x-cdn-file-name": "session_file_repro.mp4",
                  "x-cdn-content-type": "video/mp4",
                },
              },
            })}
          />
        </StrictMode>,
      );
    });

    const atCap = new File(["video"], "repro.mp4", { type: "video/mp4" });
    Object.defineProperty(atCap, "size", {
      configurable: true,
      value: 100 * 1024 * 1024,
    });
    const input = selectFile(container, atCap);

    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(seen.at(-1)?.[0]?.file_path).toBe(cdnUrl);
    });
    expect(container.textContent).not.toContain("exceeds");
  });

  it("keeps the 5 MB limit for Supabase-hosted images", async () => {
    await act(async () => {
      root.render(<UploadHarness />);
    });

    const oversize = new File(["x"], "large.png", { type: "image/png" });
    Object.defineProperty(oversize, "size", {
      configurable: true,
      value: 6 * 1024 * 1024,
    });
    const input = selectFile(container, oversize);

    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(xhrInstances).toHaveLength(0);
    expect(container.textContent).toContain("5MB");
  });

  it("rejects an unsupported type with a message naming what is accepted", async () => {
    await act(async () => {
      root.render(<UploadHarness />);
    });

    const file = new File(["nope"], "payload.exe", {
      type: "application/x-msdownload",
    });
    const input = selectFile(container, file);

    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(xhrInstances).toHaveLength(0);
    expect(container.textContent).toContain("Unsupported file type");
    expect(container.textContent).toContain("MP4");
  });

  it("retries automatically after a dropped connection and still succeeds", async () => {
    // Bunny Storage has no resumable protocol, so recovery restarts the
    // transfer rather than resuming from an offset. What matters to the
    // reporter is that a brief network blip does not cost them the upload.
    const cdnUrl =
      "https://cdn.example.test/merchants/merchant-1/support/session_file_repro.mp4";
    installXhrStub({
      responseText: JSON.stringify({ success: true, cdnUrl }),
      failFirstAttempts: 1,
    });
    const seen: AttachmentInput[][] = [];

    await act(async () => {
      root.render(
        <StrictMode>
          <UploadHarness
            onAttachments={(attachments) => seen.push(attachments)}
            getUploadUrl={async () => ({
              target: {
                provider: "cdn",
                upload_url: "https://project.supabase.co/functions/v1/cdn-upload",
                method: "POST",
                file_path: cdnUrl,
                headers: {
                  "x-cdn-scope": "merchant",
                  "x-cdn-merchant-id": "merchant-1",
                  "x-cdn-category": "support",
                  "x-cdn-file-name": "session_file_repro.mp4",
                  "x-cdn-content-type": "video/mp4",
                },
              },
            })}
          />
        </StrictMode>,
      );
    });

    const input = selectFile(
      container,
      new File(["video"], "repro.mp4", { type: "video/mp4" }),
    );
    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await vi.waitFor(
      () => {
        expect(seen.at(-1)?.[0]?.file_path).toBe(cdnUrl);
      },
      { timeout: 4000 },
    );
    // Two transfers: the dropped one and the successful retry.
    expect(xhrInstances.length).toBeGreaterThanOrEqual(2);
  });

  it("gives up after exhausting retries and reports a single failure", async () => {
    const cdnUrl =
      "https://cdn.example.test/merchants/merchant-1/support/session_file_repro.mp4";
    installXhrStub({
      responseText: JSON.stringify({ success: true, cdnUrl }),
      failFirstAttempts: 99,
    });

    await act(async () => {
      root.render(
        <StrictMode>
          <UploadHarness
            getUploadUrl={async () => ({
              target: {
                provider: "cdn",
                upload_url: "https://project.supabase.co/functions/v1/cdn-upload",
                method: "POST",
                file_path: cdnUrl,
                headers: {
                  "x-cdn-scope": "merchant",
                  "x-cdn-merchant-id": "merchant-1",
                  "x-cdn-category": "support",
                  "x-cdn-file-name": "session_file_repro.mp4",
                  "x-cdn-content-type": "video/mp4",
                },
              },
            })}
          />
        </StrictMode>,
      );
    });

    const input = selectFile(
      container,
      new File(["video"], "repro.mp4", { type: "video/mp4" }),
    );
    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await vi.waitFor(
      () => {
        expect(container.textContent).toContain("interrupted");
      },
      { timeout: 6000 },
    );
    // Bounded: the initial attempt plus two retries, not an endless loop.
    expect(
      container.querySelector('[data-testid="attachment-count"]')?.textContent,
    ).toBe("0");
  });

  it("does not retry an HTTP error status", async () => {
    // A rejected type/size or expired token is a decision the server already
    // made; repeating the request would fail identically and waste the
    // reporter's time.
    installXhrStub({ responseText: "" });
    vi.spyOn(
      XMLHttpRequest.prototype as unknown as Record<string, () => void>,
      "send",
    ).mockImplementation(function (this: FakeXhr) {
      Object.defineProperty(this, "status", {
        configurable: true,
        get: () => 400,
      });
      Object.defineProperty(this, "responseText", {
        configurable: true,
        get: () => JSON.stringify({ success: false, error: "Rejected by CDN" }),
      });
      setTimeout(() => this.onload?.(), 0);
    });

    const cdnUrl =
      "https://cdn.example.test/merchants/merchant-1/support/session_file_repro.mp4";
    await act(async () => {
      root.render(
        <StrictMode>
          <UploadHarness
            getUploadUrl={async () => ({
              target: {
                provider: "cdn",
                upload_url: "https://project.supabase.co/functions/v1/cdn-upload",
                method: "POST",
                file_path: cdnUrl,
                headers: {
                  "x-cdn-scope": "merchant",
                  "x-cdn-merchant-id": "merchant-1",
                  "x-cdn-category": "support",
                  "x-cdn-file-name": "session_file_repro.mp4",
                  "x-cdn-content-type": "video/mp4",
                },
              },
            })}
          />
        </StrictMode>,
      );
    });

    const input = selectFile(
      container,
      new File(["video"], "repro.mp4", { type: "video/mp4" }),
    );
    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain("Rejected by CDN");
    });
    // Exactly one transfer — the server's answer was accepted, not retried.
    expect(xhrInstances).toHaveLength(1);
  });

  it("cancelling an in-flight upload aborts it and records no attachment", async () => {
    // Do not auto-complete: keep the request in flight so cancel has something
    // to abort.
    installXhrStub({ autoComplete: false });

    await act(async () => {
      root.render(<UploadHarness />);
    });

    const file = new File(["big"], "long-upload.mp4", { type: "video/mp4" });
    const input = selectFile(container, file);

    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(xhrInstances).toHaveLength(1);
    });

    const cancel = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Cancel upload"]',
    );
    expect(cancel).not.toBeNull();

    await act(async () => {
      cancel?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(xhrInstances[0]?.aborted).toBe(true);
    expect(
      container.querySelector('[data-testid="attachment-count"]')?.textContent,
    ).toBe("0");
  });
});
