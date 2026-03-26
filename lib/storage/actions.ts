"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { v4 as uuidv4 } from "uuid";

const BUCKET_NAME = "store-assets";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

type StoreAssetType = "logo" | "hero" | "favicon" | "og";

interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

interface UploadStoreImageOptions {
  merchantId: string;
  locationId: string;
  assetType: StoreAssetType;
}

function getStoreAssetPrefix(assetType: StoreAssetType): string {
  switch (assetType) {
    case "logo":
      return "store-logo";
    case "hero":
      return "store-hero";
    case "favicon":
      return "store-favicon";
    case "og":
      return "store-og";
  }
}

function sanitizeExtension(fileName: string): string {
  const extension = fileName.split(".").pop();
  return extension
    ? extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
    : "bin";
}

function getStoragePathFromUrl(url: string): string {
  const parsedUrl = new URL(url);
  return parsedUrl.pathname.replace(/^\/+/, "");
}

function getLegacyStoreAssetPath(url: string): string | null {
  const urlParts = url.split(`${BUCKET_NAME}/`);
  return urlParts.length < 2 ? null : urlParts[1];
}

/**
 * Upload an image for the online-ordering storefront through Bunny.
 * Asset URLs remain persisted exactly as before; only transport changes.
 */
export async function uploadStoreImage(
  formData: FormData,
  options: UploadStoreImageOptions,
): Promise<UploadResult> {
  try {
    const file = formData.get("file") as File | null;

    if (!file) {
      return { success: false, error: "No file provided" };
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        success: false,
        error: "Invalid file type. Allowed types: PNG, JPG, GIF, SVG, WebP",
      };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: "File too large. Maximum size: 5MB",
      };
    }

    const supabase = createServerSupabaseClient();
    const fileExt = sanitizeExtension(file.name);
    const fileName = `${getStoreAssetPrefix(options.assetType)}-${options.locationId}-${uuidv4()}.${fileExt}`;
    const fileBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");

    const { data, error } = await supabase.functions.invoke("cdn-upload", {
      method: "POST",
      body: {
        scope: "merchant",
        merchantId: options.merchantId,
        category: "logos",
        fileName,
        fileBase64,
        contentType: file.type,
      },
    });

    if (error) {
      console.error("Bunny upload invoke error:", error);
      return { success: false, error: error.message };
    }

    if (!data?.success || !data?.cdnUrl) {
      return {
        success: false,
        error:
          typeof data?.error === "string" ? data.error : "Upload failed",
      };
    }

    return {
      success: true,
      url: data.cdnUrl,
    };
  } catch (err) {
    console.error("Upload error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Upload failed",
    };
  }
}

/**
 * Delete an online-ordering image from Bunny when migrated, or from
 * legacy Supabase Storage if the URL still points at the old bucket.
 */
export async function deleteStoreImage(
  url: string,
  merchantId: string,
): Promise<UploadResult> {
  try {
    const supabase = createServerSupabaseClient();
    const parsedUrl = new URL(url);

    if (parsedUrl.pathname.startsWith("/merchants/")) {
      const { data, error } = await supabase.functions.invoke("cdn-upload", {
        method: "DELETE",
        body: {
          scope: "merchant",
          merchantId,
          storagePath: getStoragePathFromUrl(url),
        },
      });

      if (error) {
        console.error("Bunny delete invoke error:", error);
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

    const legacyPath = getLegacyStoreAssetPath(url);
    if (!legacyPath) {
      return { success: false, error: "Invalid URL format" };
    }

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([legacyPath]);

    if (error) {
      console.error("Supabase storage delete error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("Delete error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Delete failed",
    };
  }
}
