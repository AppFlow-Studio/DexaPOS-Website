/** @vitest-environment happy-dom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FileUploadInput from "@/components/support/FileUploadInput";
import type { AttachmentInput } from "@/types/support-ticket";

function UploadHarness() {
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);

  return (
    <>
      <FileUploadInput
        onUploadsChange={setAttachments}
        getUploadUrl={async () => ({
          signedUrl: "https://uploads.example.test/file",
          path: "admin/drafts/user/file.pdf",
        })}
        sessionId="test-session"
      />
      <output data-testid="attachment-count">{attachments.length}</output>
    </>
  );
}

describe("FileUploadInput", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
      }),
    );
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

    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    expect(input).not.toBeNull();

    const file = new File(["ticket evidence"], "evidence.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });

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
});
