export const SUPPORT_CDN_CATEGORY = "support";

export type SupportCdnScope =
  | { scope: "merchant"; merchantId: string }
  | { scope: "organization"; organizationId: string };

export function sanitizeSupportFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function sanitizeSupportIdentitySegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function buildSupportCdnFileName(
  identitySegments: string[],
  fileName: string,
): string {
  const safeSegments = identitySegments.map(sanitizeSupportIdentitySegment);
  return `${safeSegments.join("_")}_${sanitizeSupportFileName(fileName)}`;
}

export function buildSupportCdnStoragePath(
  owner: SupportCdnScope,
  storedFileName: string,
): string {
  const ownerPath =
    owner.scope === "merchant"
      ? `merchants/${owner.merchantId}`
      : `organizations/${owner.organizationId}`;
  return `${ownerPath}/${SUPPORT_CDN_CATEGORY}/${storedFileName}`;
}

export function buildSupportCdnUrl(
  hostname: string,
  storagePath: string,
): string {
  const normalizedHost = hostname
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
  return `https://${normalizedHost}/${storagePath}`;
}

/**
 * Returns the Bunny storage path only when a persisted URL is an exact HTTPS
 * URL on the configured pull-zone host and sits under the expected owner path.
 */
export function parseSupportCdnStoragePath(
  value: string,
  hostname: string,
  expectedOwnerPrefix: string,
): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const normalizedHost = hostname
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .toLowerCase();
  const storagePath = url.pathname.replace(/^\/+/, "");

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== normalizedHost ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    storagePath.includes("..") ||
    storagePath.includes("\\") ||
    !storagePath.startsWith(`${expectedOwnerPrefix}/${SUPPORT_CDN_CATEGORY}/`)
  ) {
    return null;
  }

  return storagePath;
}
