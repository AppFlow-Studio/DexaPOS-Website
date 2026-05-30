import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isValidImageUrl(url: string | null | undefined): url is string {
  return !!url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/'))
}

export function isTransientImageUrl(url: string | null | undefined): url is string {
  return !!url && (url.startsWith('blob:') || url.startsWith('data:'))
}

/**
 * Detects transient/preview image URLs — local previews created before upload
 * (object URLs and data URIs). These must be rendered with a native <img>
 * tag rather than next/image, which only accepts configured remote/local paths.
 */
export function isTransientImageUrl(url: string | null | undefined): url is string {
  return !!url && (url.startsWith('blob:') || url.startsWith('data:'))
}

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
