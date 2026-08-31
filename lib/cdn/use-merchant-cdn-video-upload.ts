'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback } from 'react'

import { generateCdnFileName } from '@/lib/cdn/client'

/**
 * Direct browser -> Supabase `cdn-upload` Edge Function upload for kiosk idle
 * videos. The file is streamed as the raw request body (no base64, no JSON), with
 * metadata in x-cdn-* headers — base64-in-JSON inflates the payload ~1.33x and
 * forces the edge worker to hold several multi-MB copies at once, which exceeds
 * its memory limit on real-world clips. This also bypasses the Next.js Server
 * Action body limit that blocked video originally. The Edge Function proxies the
 * PUT to Bunny; Bunny serves the `.mp4` object as `video/mp4` on GET, so it plays
 * back in both a browser `<video>` and the kiosk's expo-video player.
 */

// Kept in sync with MAX_VIDEO_SIZE_BYTES in supabase/functions/cdn-upload.
export const MAX_KIOSK_VIDEO_BYTES = 20 * 1024 * 1024
export const KIOSK_VIDEO_CONTENT_TYPE = 'video/mp4'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export interface UploadedVideoAsset {
  cdnUrl: string
  storagePath: string
}

/** Returns an error message if the file is not an acceptable kiosk video, else null. */
export function validateKioskVideoFile(file: File): string | null {
  if (file.type !== KIOSK_VIDEO_CONTENT_TYPE) {
    return 'Use an MP4 (H.264) video.'
  }
  if (file.size > MAX_KIOSK_VIDEO_BYTES) {
    return 'Video must be 20MB or smaller.'
  }
  return null
}

interface UseMerchantCdnVideoUploadOptions {
  merchantId: string
  fileNamePrefix: string
}

export function useMerchantCdnVideoUpload({
  merchantId,
  fileNamePrefix,
}: UseMerchantCdnVideoUploadOptions) {
  const { getToken } = useAuth()

  const uploadVideo = useCallback(
    async (file: File): Promise<UploadedVideoAsset> => {
      const validationError = validateKioskVideoFile(file)
      if (validationError) {
        throw new Error(validationError)
      }
      if (!SUPABASE_URL) {
        throw new Error('Supabase URL is not configured')
      }

      const token =
        (await getToken({ template: 'supabase' }).catch(() => null)) ||
        (await getToken())
      if (!token) {
        throw new Error('Authentication required for CDN upload')
      }

      const fileName = generateCdnFileName(fileNamePrefix, 'mp4')
      const response = await fetch(`${SUPABASE_URL}/functions/v1/cdn-upload`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY ?? '',
          Authorization: `Bearer ${token}`,
          'Content-Type': KIOSK_VIDEO_CONTENT_TYPE,
          'x-cdn-scope': 'merchant',
          'x-cdn-merchant-id': merchantId,
          'x-cdn-category': 'kiosk',
          'x-cdn-file-name': fileName,
          'x-cdn-content-type': KIOSK_VIDEO_CONTENT_TYPE,
        },
        body: file,
      })

      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.success || !data?.cdnUrl || !data?.storagePath) {
        throw new Error(data?.error ?? 'CDN upload failed')
      }

      return { cdnUrl: data.cdnUrl, storagePath: data.storagePath }
    },
    [getToken, fileNamePrefix, merchantId],
  )

  return { uploadVideo }
}
