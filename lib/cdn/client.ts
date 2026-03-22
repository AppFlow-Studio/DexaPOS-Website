import type { SupabaseClient } from "@supabase/supabase-js";

export type MerchantAssetCategory =
  | "logos"
  | "cfd-images"
  | "menu-items"
  | "documents";

export type OrganizationAssetCategory = "logos";

export type CdnUploadScope =
  | {
      scope: "merchant";
      merchantId: string;
      category: MerchantAssetCategory;
    }
  | {
      scope: "organization";
      organizationId: string;
      category: OrganizationAssetCategory;
    };

export type CdnDeleteScope =
  | {
      scope: "merchant";
      merchantId: string;
      storagePath: string;
    }
  | {
      scope: "organization";
      organizationId: string;
      storagePath: string;
    };

export type CdnUploadRequest = CdnUploadScope & {
  fileName: string;
  fileBase64: string;
  contentType: string;
};

export interface CdnResponse {
  success: boolean;
  cdnUrl?: string;
  storagePath?: string;
  error?: string;
}

type FunctionClient = Pick<SupabaseClient<any, any, any>, "functions">;

function getFunctionErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const maybeError = (data as { error?: unknown }).error;
    if (typeof maybeError === "string" && maybeError.trim().length > 0) {
      return maybeError;
    }
  }
  return fallback;
}

export async function uploadCdnAsset(
  supabase: FunctionClient,
  params: CdnUploadRequest,
): Promise<{ cdnUrl: string; storagePath: string }> {
  const { data, error } = await supabase.functions.invoke("cdn-upload", {
    method: "POST",
    body: params,
  });

  if (error) {
    throw new Error(`CDN upload failed: ${error.message}`);
  }

  if (!data?.success || !data?.cdnUrl || !data?.storagePath) {
    throw new Error(getFunctionErrorMessage(data, "CDN upload failed"));
  }

  return {
    cdnUrl: data.cdnUrl,
    storagePath: data.storagePath,
  };
}

export async function deleteCdnAsset(
  supabase: FunctionClient,
  params: CdnDeleteScope,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke("cdn-upload", {
    method: "DELETE",
    body: params,
  });

  if (error) {
    throw new Error(`CDN delete failed: ${error.message}`);
  }

  if (!data?.success) {
    throw new Error(getFunctionErrorMessage(data, "CDN delete failed"));
  }
}

export function generateCdnFileName(prefix: string, extension: string): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9-_]/g, "-");
  const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `${safePrefix}-${Date.now()}.${safeExtension || "bin"}`;
}

export function extractStoragePathFromCdnUrl(cdnUrl: string): string {
  const url = new URL(cdnUrl);
  return url.pathname.replace(/^\/+/, "");
}

export async function fileToBase64(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }

      const parts = result.split(",");
      resolve(parts.length > 1 ? parts[1] : result);
    };

    reader.readAsDataURL(file);
  });
}
