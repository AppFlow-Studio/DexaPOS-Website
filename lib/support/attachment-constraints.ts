/**
 * Single source of truth for support-ticket attachment constraints.
 *
 * These limits are enforced by the client, server actions, and upload provider.
 * Images/PDFs retain the private Supabase bucket's 5 MB ceiling; videos use the
 * authenticated Bunny upload lane with a separate 100 MB ceiling.
 */

/** Accepted MIME types across both attachment providers. */
export const SUPPORT_ATTACHMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export type SupportAttachmentMimeType =
  (typeof SUPPORT_ATTACHMENT_MIME_TYPES)[number];

export const SUPPORT_ATTACHMENT_MAX_MB = 100;
export const SUPPORT_ATTACHMENT_NON_VIDEO_MAX_MB = 5;

/** Bunny support-video upload ceiling. */
export const SUPPORT_ATTACHMENT_MAX_BYTES =
  SUPPORT_ATTACHMENT_MAX_MB * 1024 * 1024;
export const SUPPORT_ATTACHMENT_NON_VIDEO_MAX_BYTES =
  SUPPORT_ATTACHMENT_NON_VIDEO_MAX_MB * 1024 * 1024;

export const SUPPORT_ATTACHMENT_MAX_FILES = 3;

/**
 * Extension → MIME fallback. Browsers frequently report `.mov` as
 * `application/octet-stream` (and sometimes give an empty type), which the CDN
 * upload lane rejects. Derive the type from the extension whenever the browser's
 * answer is missing or generic.
 */
const EXTENSION_TYPES: Record<string, SupportAttachmentMimeType> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  qt: "video/quicktime",
  webm: "video/webm",
};

/** Returns the allowlisted MIME type implied by a filename, if any. */
export function getAttachmentMimeTypeFromFileName(
  fileName: string,
): SupportAttachmentMimeType | undefined {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext ? EXTENSION_TYPES[ext] : undefined;
}

export function isSupportVideoMimeType(fileType: string): boolean {
  return fileType.startsWith("video/");
}

export function getSupportAttachmentMaxBytes(fileType: string): number {
  return isSupportVideoMimeType(fileType)
    ? SUPPORT_ATTACHMENT_MAX_BYTES
    : SUPPORT_ATTACHMENT_NON_VIDEO_MAX_BYTES;
}

/**
 * Resolves the content type to send with an upload. Falls back to the file
 * extension when the browser reports nothing useful.
 */
export function resolveAttachmentContentType(file: {
  name: string;
  type: string;
}): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  return getAttachmentMimeTypeFromFileName(file.name) || file.type || "";
}

/** Human-readable list of accepted formats, for UI copy and error messages. */
export const SUPPORT_ATTACHMENT_ACCEPTED_LABEL =
  "PNG, JPEG, WebP, PDF, MP4, MOV, or WebM";
