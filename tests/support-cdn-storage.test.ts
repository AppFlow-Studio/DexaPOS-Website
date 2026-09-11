import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSupportCdnFileName,
  buildSupportCdnStoragePath,
  buildSupportCdnUrl,
  parseSupportCdnStoragePath,
} from "@/lib/support/cdn";

describe("support attachment CDN storage", () => {
  it("builds and validates a tenant-scoped CDN URL", () => {
    const fileName = buildSupportCdnFileName(
      [
        "33333333-3333-4333-8333-333333333333",
        "44444444-4444-4444-8444-444444444444",
      ],
      "screen recording.mp4",
    );
    const storagePath = buildSupportCdnStoragePath(
      {
        scope: "merchant",
        merchantId: "11111111-1111-4111-8111-111111111111",
      },
      fileName,
    );
    const url = buildSupportCdnUrl("cdn.example.test", storagePath);

    expect(url).toBe(
      "https://cdn.example.test/merchants/11111111-1111-4111-8111-111111111111/support/" +
        "33333333-3333-4333-8333-333333333333_" +
        "44444444-4444-4444-8444-444444444444_screen_recording.mp4",
    );
    expect(
      parseSupportCdnStoragePath(
        url,
        "cdn.example.test",
        "merchants/11111111-1111-4111-8111-111111111111",
      ),
    ).toBe(storagePath);
  });

  it("rejects a foreign host, owner, query string, or traversal path", () => {
    const expectedOwner =
      "merchants/11111111-1111-4111-8111-111111111111";
    const validPath = `${expectedOwner}/support/file.mp4`;

    expect(
      parseSupportCdnStoragePath(
        `https://evil.test/${validPath}`,
        "cdn.example.test",
        expectedOwner,
      ),
    ).toBeNull();
    expect(
      parseSupportCdnStoragePath(
        "https://cdn.example.test/merchants/other/support/file.mp4",
        "cdn.example.test",
        expectedOwner,
      ),
    ).toBeNull();
    expect(
      parseSupportCdnStoragePath(
        `https://cdn.example.test/${validPath}?token=leak`,
        "cdn.example.test",
        expectedOwner,
      ),
    ).toBeNull();
    expect(
      parseSupportCdnStoragePath(
        `https://cdn.example.test/${expectedOwner}/support/../file.mp4`,
        "cdn.example.test",
        expectedOwner,
      ),
    ).toBeNull();
  });

  it("keeps the Edge Function support lane streamed and capped at 100 MB", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/cdn-upload/index.ts"),
      "utf8",
    );
    const binaryHandler = source.slice(
      source.indexOf("async function handleBinaryUpload"),
      source.indexOf("Deno.serve"),
    );

    expect(source).toContain('const MAX_SUPPORT_VIDEO_SIZE_BYTES = 100 * 1024 * 1024;');
    expect(source).toContain('"video/quicktime"');
    expect(source).toContain('"video/webm"');
    expect(source).toContain('"support",');
    expect(binaryHandler).toContain("req.body.pipeThrough(");
    expect(binaryHandler).toContain("receivedBytes > maxSize");
    expect(binaryHandler).toContain("proxyUpload(storagePath, limitedBody)");
    expect(binaryHandler).not.toContain("req.arrayBuffer()");
  });

  it("updates HQ metadata validation without changing Supabase Storage limits", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260909120000_support_video_cdn_metadata.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("support_ticket_attachments.file_path");
    expect(migration).toContain("104857600");
    expect(migration).toContain("5242880");
    expect(migration).toContain("'video/mp4', 'video/quicktime', 'video/webm'");
    expect(migration).toContain("/organizations/[^/?#]+/support/");
    expect(migration).not.toMatch(/update\s+storage\.buckets/i);
    expect(migration).not.toMatch(/alter\s+table\s+storage\.buckets/i);
  });
});
