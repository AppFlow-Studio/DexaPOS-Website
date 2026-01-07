"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { v4 as uuidv4 } from "uuid";

const BUCKET_NAME = "store-assets";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Upload an image to Supabase Storage
 * @param formData - FormData containing the file to upload
 * @param folder - Folder path (e.g., "logos", "banners")
 * @returns The public URL of the uploaded image
 */
export async function uploadStoreImage(
  formData: FormData,
  folder: string = "general"
): Promise<UploadResult> {
  try {
    const file = formData.get("file") as File;

    if (!file) {
      return { success: false, error: "No file provided" };
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        success: false,
        error: "Invalid file type. Allowed types: PNG, JPG, GIF, WebP",
      };
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: "File too large. Maximum size: 5MB",
      };
    }

    const supabase = createServerSupabaseClient();

    // Generate unique filename
    const fileExt = file.name.split(".").pop();
    const fileName = `${folder}/${uuidv4()}.${fileExt}`;

    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error("Supabase storage upload error:", error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path);

    return {
      success: true,
      url: urlData.publicUrl,
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
 * Delete an image from Supabase Storage
 * @param url - The public URL of the image to delete
 */
export async function deleteStoreImage(url: string): Promise<UploadResult> {
  try {
    const supabase = createServerSupabaseClient();

    // Extract the path from the URL
    const urlParts = url.split(`${BUCKET_NAME}/`);
    if (urlParts.length < 2) {
      return { success: false, error: "Invalid URL format" };
    }

    const filePath = urlParts[1];

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

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
