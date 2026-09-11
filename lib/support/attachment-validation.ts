import { z } from "zod";
import {
  getAttachmentMimeTypeFromFileName,
  getSupportAttachmentMaxBytes,
  isSupportVideoMimeType,
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MAX_FILES,
  SUPPORT_ATTACHMENT_MIME_TYPES,
} from "@/lib/support/attachment-constraints";
import {
  parseSupportCdnStoragePath,
  sanitizeSupportFileName,
} from "@/lib/support/cdn";
import type { AttachmentInput } from "@/types/support-ticket";

const uuidSchema = z.string().uuid();

const supportAttachmentSchema = z
  .object({
    file_name: z.string().trim().min(1).max(255),
    file_path: z.string().trim().min(1).max(1000),
    file_size: z.number().int().positive().max(SUPPORT_ATTACHMENT_MAX_BYTES),
    file_type: z.enum(SUPPORT_ATTACHMENT_MIME_TYPES),
  })
  .strict()
  .superRefine((attachment, context) => {
    const expectedMimeType = getAttachmentMimeTypeFromFileName(
      attachment.file_name,
    );

    if (!expectedMimeType) {
      context.addIssue({
        code: "custom",
        path: ["file_name"],
        message: "Unsupported attachment type",
      });
    } else if (expectedMimeType !== attachment.file_type) {
      context.addIssue({
        code: "custom",
        path: ["file_type"],
        message: "Attachment type does not match its filename",
      });
    }

    if (
      attachment.file_size >
      getSupportAttachmentMaxBytes(attachment.file_type)
    ) {
      context.addIssue({
        code: "custom",
        path: ["file_size"],
        message: "Attachment exceeds the allowed size",
      });
    }
  });

const supportAttachmentsSchema = z
  .array(supportAttachmentSchema)
  .max(
    SUPPORT_ATTACHMENT_MAX_FILES,
    `A maximum of ${SUPPORT_ATTACHMENT_MAX_FILES} attachments is allowed`,
  );

type ValidationResult =
  | { data: AttachmentInput[]; error?: never }
  | { data?: never; error: string };

type UploadRequestValidationResult =
  | {
      data: {
        fileName: string;
        sanitizedFileName: string;
        fileId: string;
        uploadSessionId: string;
        contentType: (typeof SUPPORT_ATTACHMENT_MIME_TYPES)[number];
        isVideo: boolean;
      };
      error?: never;
    }
  | { data?: never; error: string };

export function validateSupportUploadRequest(
  fileName: unknown,
  fileId: unknown,
  uploadSessionId: unknown,
  contentType: unknown,
): UploadRequestValidationResult {
  const parsed = z
    .object({
      fileName: z.string().trim().min(1).max(255),
      fileId: uuidSchema,
      uploadSessionId: uuidSchema,
      contentType: z.enum(SUPPORT_ATTACHMENT_MIME_TYPES),
    })
    .safeParse({ fileName, fileId, uploadSessionId, contentType });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message || "Invalid attachment upload",
    };
  }

  const expectedMimeType = getAttachmentMimeTypeFromFileName(
    parsed.data.fileName,
  );
  if (!expectedMimeType) return { error: "Unsupported attachment type" };
  if (expectedMimeType !== parsed.data.contentType) {
    return { error: "Attachment type does not match its filename" };
  }

  return {
    data: {
      ...parsed.data,
      sanitizedFileName: sanitizeSupportFileName(parsed.data.fileName),
      isVideo: isSupportVideoMimeType(parsed.data.contentType),
    },
  };
}

/**
 * Validates metadata submitted by a merchant after a direct storage upload.
 *
 * Besides validating the client-supplied fields, this binds every object path
 * to the authenticated merchant and to the canonical path shape minted by
 * `GetSupportUploadUrl`. This prevents a service-role RPC from recording an
 * attachment that points at another tenant's object.
 */
export function validateMerchantSupportAttachments(
  attachments: unknown,
  merchantId: string,
  cdnHostname = process.env.BUNNY_CDN_HOSTNAME ?? "",
): ValidationResult {
  const parsed = supportAttachmentsSchema.safeParse(attachments ?? []);

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message || "Invalid attachment metadata",
    };
  }

  for (const attachment of parsed.data) {
    if (isSupportVideoMimeType(attachment.file_type)) {
      const storagePath = parseSupportCdnStoragePath(
        attachment.file_path,
        cdnHostname,
        `merchants/${merchantId}`,
      );
      const storedFileName = storagePath?.split("/").at(-1);
      const uploadSessionId = storedFileName?.slice(0, 36);
      const firstSeparator = storedFileName?.charAt(36);
      const fileId = storedFileName?.slice(37, 73);
      const secondSeparator = storedFileName?.charAt(73);
      const pathFileName = storedFileName?.slice(74);

      const hasValidCdnPath =
        Boolean(storagePath) &&
        uuidSchema.safeParse(uploadSessionId).success &&
        firstSeparator === "_" &&
        uuidSchema.safeParse(fileId).success &&
        secondSeparator === "_" &&
        pathFileName === sanitizeSupportFileName(attachment.file_name);

      if (!hasValidCdnPath) {
        return { error: "One or more attachment paths are invalid" };
      }
      continue;
    }

    const pathSegments = attachment.file_path.split("/");
    const [pathMerchantId, scope, uploadSessionId, storedFileName] =
      pathSegments;
    const fileId = storedFileName?.slice(0, 36);
    const separator = storedFileName?.charAt(36);
    const pathFileName = storedFileName?.slice(37);

    const hasValidPath =
      pathSegments.length === 4 &&
      pathMerchantId === merchantId &&
      scope === "tickets" &&
      uuidSchema.safeParse(uploadSessionId).success &&
      uuidSchema.safeParse(fileId).success &&
      separator === "_" &&
      pathFileName === sanitizeSupportFileName(attachment.file_name);

    if (!hasValidPath) {
      return { error: "One or more attachment paths are invalid" };
    }
  }

  return { data: parsed.data };
}
