"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const LEGACY_ORG_LOGO_BUCKET = "Organizations-Logos";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
];
const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

interface ServerCdnResult {
  success: boolean;
  cdnUrl?: string;
  storagePath?: string;
  error?: string;
}

function sanitizeExtension(fileName: string): string {
  const extension = fileName.split(".").pop();
  return extension
    ? extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
    : "bin";
}

function extractStoragePath(cdnUrl: string): string {
  const url = new URL(cdnUrl);
  return url.pathname.replace(/^\/+/, "");
}

function extractLegacyOrganizationLogoPath(url: string): string | null {
  const urlParts = url.split(`${LEGACY_ORG_LOGO_BUCKET}/`);
  return urlParts.length < 2 ? null : urlParts[1];
}

export async function uploadOrganizationLogo(
  file: File,
  organizationId: string,
): Promise<ServerCdnResult> {
  try {
    if (!file) {
      return { success: false, error: "No file provided" };
    }

    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      return {
        success: false,
        error: "Invalid file type. Allowed types: PNG, JPG, GIF, SVG, WebP",
      };
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return {
        success: false,
        error: "File too large. Maximum size: 5MB",
      };
    }

    const supabase = createServerSupabaseClient();
    const fileExt = sanitizeExtension(file.name);
    const fileBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");

    const { data, error } = await supabase.functions.invoke("cdn-upload", {
      method: "POST",
      body: {
        scope: "organization",
        organizationId,
        category: "logos",
        fileName: `logo-${Date.now()}.${fileExt}`,
        fileBase64,
        contentType: file.type,
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success || !data?.cdnUrl || !data?.storagePath) {
      return {
        success: false,
        error:
          typeof data?.error === "string" ? data.error : "Upload failed",
      };
    }

    return {
      success: true,
      cdnUrl: data.cdnUrl,
      storagePath: data.storagePath,
    };
  } catch (error) {
    console.error("Organization logo upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

export async function uploadOrganizationDocument(
  file: File,
  organizationId: string,
  filePrefix: string,
): Promise<ServerCdnResult> {
  try {
    if (!file) {
      return { success: false, error: "No file provided" };
    }

    if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
      return {
        success: false,
        error: "Invalid file type. Allowed types: PDF, PNG, JPG, WEBP",
      };
    }

    if (file.size > MAX_DOCUMENT_SIZE) {
      return {
        success: false,
        error: "File too large. Maximum size: 10MB",
      };
    }

    const supabase = createServerSupabaseClient();
    const fileExt = sanitizeExtension(file.name);
    const fileBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");

    const { data, error } = await supabase.functions.invoke("cdn-upload", {
      method: "POST",
      body: {
        scope: "organization",
        organizationId,
        category: "documents",
        fileName: `${filePrefix}-${Date.now()}.${fileExt}`,
        fileBase64,
        contentType: file.type,
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success || !data?.cdnUrl || !data?.storagePath) {
      return {
        success: false,
        error:
          typeof data?.error === "string" ? data.error : "Upload failed",
      };
    }

    return {
      success: true,
      cdnUrl: data.cdnUrl,
      storagePath: data.storagePath,
    };
  } catch (error) {
    console.error("Organization document upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

export async function uploadMerchantDocument(
  file: File,
  merchantId: string,
  filePrefix: string,
): Promise<ServerCdnResult> {
  try {
    if (!file) {
      return { success: false, error: "No file provided" };
    }

    if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
      return {
        success: false,
        error: "Invalid file type. Allowed types: PDF, PNG, JPG, WEBP",
      };
    }

    if (file.size > MAX_DOCUMENT_SIZE) {
      return {
        success: false,
        error: "File too large. Maximum size: 10MB",
      };
    }

    const supabase = createServerSupabaseClient();
    const fileExt = sanitizeExtension(file.name);
    const fileBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");

    const { data, error } = await supabase.functions.invoke("cdn-upload", {
      method: "POST",
      body: {
        scope: "merchant",
        merchantId,
        category: "documents",
        fileName: `${filePrefix}-${Date.now()}.${fileExt}`,
        fileBase64,
        contentType: file.type,
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success || !data?.cdnUrl || !data?.storagePath) {
      return {
        success: false,
        error:
          typeof data?.error === "string" ? data.error : "Upload failed",
      };
    }

    return {
      success: true,
      cdnUrl: data.cdnUrl,
      storagePath: data.storagePath,
    };
  } catch (error) {
    console.error("Merchant document upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

export async function deleteOrganizationLogo(
  imageUrl: string | null | undefined,
  organizationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServerSupabaseClient();

    if (imageUrl) {
      const storagePath = extractStoragePath(imageUrl);

      if (storagePath.startsWith(`organizations/${organizationId}/`)) {
        const { data, error } = await supabase.functions.invoke("cdn-upload", {
          method: "DELETE",
          body: {
            scope: "organization",
            organizationId,
            storagePath,
          },
        });

        if (error) {
          return { success: false, error: error.message };
        }

        if (!data?.success) {
          return {
            success: false,
            error:
              typeof data?.error === "string" ? data.error : "Delete failed",
          };
        }

        return { success: true };
      }

      const legacyPath = extractLegacyOrganizationLogoPath(imageUrl);
      if (legacyPath) {
        const { error } = await supabase.storage
          .from(LEGACY_ORG_LOGO_BUCKET)
          .remove([legacyPath]);

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      }
    }

    const { error } = await supabase.storage
      .from(LEGACY_ORG_LOGO_BUCKET)
      .remove([`${organizationId}.png`]);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Organization logo delete error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Delete failed",
    };
  }
}
