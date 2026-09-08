import type { SupabaseClient } from "@supabase/supabase-js";

export type MerchantAssetCategory =
  | "logos"
  | "cfd-images"
  | "menu-categories"
  | "menu-items"
  | "menus"
  | "documents"
  | "kiosk";

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

export interface OptimizedCdnFile {
  file: File;
  contentType: string;
  extension: string;
  originalSize: number;
  optimizedSize: number;
  wasOptimized: boolean;
}

export interface OptimizeImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  targetBytes?: number;
  initialQuality?: number;
  minQuality?: number;
}

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

function getFileExtension(fileName: string): string {
  const extension = fileName.split(".").pop();
  return extension ? extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() : "bin";
}

function buildOptimizedFileName(fileName: string, extension: string): string {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return `${baseName}.${extension}`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for optimization"));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode optimized image"));
          return;
        }

        resolve(blob);
      },
      type,
      quality,
    );
  });
}

function getConstrainedDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  const widthRatio = maxWidth / width;
  const heightRatio = maxHeight / height;
  const scale = Math.min(widthRatio, heightRatio, 1);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function optimizeImageForCdn(
  file: File,
  options: OptimizeImageOptions = {},
): Promise<OptimizedCdnFile> {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    targetBytes = 500 * 1024,
    initialQuality = 0.82,
    minQuality = 0.5,
  } = options;

  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    return {
      file,
      contentType: file.type || "application/octet-stream",
      extension: getFileExtension(file.name),
      originalSize: file.size,
      optimizedSize: file.size,
      wasOptimized: false,
    };
  }

  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return {
      file,
      contentType: file.type,
      extension: getFileExtension(file.name),
      originalSize: file.size,
      optimizedSize: file.size,
      wasOptimized: false,
    };
  }

  let { width, height } = getConstrainedDimensions(
    image.naturalWidth,
    image.naturalHeight,
    maxWidth,
    maxHeight,
  );

  let bestBlob: Blob | null = null;

  while (width >= 640 && height >= 360) {
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (let quality = initialQuality; quality >= minQuality; quality -= 0.08) {
      const encodedBlob = await canvasToBlob(canvas, "image/webp", quality);

      if (!bestBlob || encodedBlob.size < bestBlob.size) {
        bestBlob = encodedBlob;
      }

      if (encodedBlob.size <= targetBytes) {
        bestBlob = encodedBlob;
        break;
      }
    }

    if (bestBlob && bestBlob.size <= targetBytes) {
      break;
    }

    width = Math.round(width * 0.85);
    height = Math.round(height * 0.85);
  }

  if (!bestBlob || bestBlob.size >= file.size) {
    return {
      file,
      contentType: file.type,
      extension: getFileExtension(file.name),
      originalSize: file.size,
      optimizedSize: file.size,
      wasOptimized: false,
    };
  }

  const optimizedFile = new File(
    [bestBlob],
    buildOptimizedFileName(file.name, "webp"),
    {
      type: "image/webp",
      lastModified: Date.now(),
    },
  );

  return {
    file: optimizedFile,
    contentType: optimizedFile.type,
    extension: "webp",
    originalSize: file.size,
    optimizedSize: optimizedFile.size,
    wasOptimized: true,
  };
}
