'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  fileToBase64,
  generateCdnFileName,
  optimizeImageForCdn,
  type MerchantAssetCategory,
  uploadCdnAsset,
  deleteCdnAsset,
} from '@/lib/cdn/client'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

interface UploadedAsset {
  cdnUrl: string
  storagePath: string
}

interface ResolveImageValueResult {
  value: string | null
  uploadedAsset?: UploadedAsset
}

interface UseMerchantCdnImageUploadOptions {
  merchantId: string
  category: MerchantAssetCategory
  fileNamePrefix: string
  targetBytes?: number
}

export function useMerchantCdnImageUpload({
  merchantId,
  category,
  fileNamePrefix,
  targetBytes = 500 * 1024,
}: UseMerchantCdnImageUploadOptions) {
  const { getToken } = useAuth()
  const objectUrlRef = useRef<string | null>(null)

  const [initialUrl, setInitialUrl] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isRemoved, setIsRemoved] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      revokeObjectUrl()
    }
  }, [revokeObjectUrl])

  const createSupabaseClient = useCallback(async () => {
    const tokenGetter = async () =>
      (await getToken({ template: 'supabase' }).catch(() => null)) ||
      (await getToken())

    const token = await tokenGetter()
    if (!token) {
      throw new Error('Authentication required for CDN upload')
    }

    return createBrowserSupabaseClient(tokenGetter)
  }, [getToken])

  const reset = useCallback((url?: string | null) => {
    revokeObjectUrl()
    const nextUrl = url || null
    setInitialUrl(nextUrl)
    setPreviewUrl(nextUrl)
    setSelectedFile(null)
    setIsRemoved(false)
  }, [revokeObjectUrl])

  const selectFile = useCallback((file: File | null) => {
    revokeObjectUrl()

    if (!file) {
      setSelectedFile(null)
      setPreviewUrl(initialUrl)
      setIsRemoved(false)
      return
    }

    const objectUrl = URL.createObjectURL(file)
    objectUrlRef.current = objectUrl

    setSelectedFile(file)
    setPreviewUrl(objectUrl)
    setIsRemoved(false)
  }, [initialUrl, revokeObjectUrl])

  const clear = useCallback(() => {
    revokeObjectUrl()
    setSelectedFile(null)
    setPreviewUrl(null)
    setIsRemoved(true)
  }, [revokeObjectUrl])

  const resolveImageValue = useCallback(async (): Promise<ResolveImageValueResult> => {
    if (isRemoved && !selectedFile) {
      return { value: null }
    }

    if (!selectedFile) {
      return { value: initialUrl }
    }

    setIsUploading(true)

    try {
      const supabase = await createSupabaseClient()
      const optimizedFile = await optimizeImageForCdn(selectedFile, {
        targetBytes,
      })
      const fileName = generateCdnFileName(fileNamePrefix, optimizedFile.extension)
      const fileBase64 = await fileToBase64(optimizedFile.file)
      const uploadedAsset = await uploadCdnAsset(supabase, {
        scope: 'merchant',
        merchantId,
        category,
        fileName,
        fileBase64,
        contentType: optimizedFile.contentType,
      })

      return {
        value: uploadedAsset.cdnUrl,
        uploadedAsset,
      }
    } finally {
      setIsUploading(false)
    }
  }, [
    category,
    createSupabaseClient,
    fileNamePrefix,
    initialUrl,
    isRemoved,
    merchantId,
    selectedFile,
    targetBytes,
  ])

  const cleanupUploadedAsset = useCallback(async (storagePath: string) => {
    if (!storagePath) return

    const supabase = await createSupabaseClient()
    await deleteCdnAsset(supabase, {
      scope: 'merchant',
      merchantId,
      storagePath,
    })
  }, [createSupabaseClient, merchantId])

  return {
    clear,
    cleanupUploadedAsset,
    hasPendingChange: Boolean(selectedFile) || isRemoved,
    isRemoved,
    isUploading,
    previewUrl,
    reset,
    resolveImageValue,
    selectFile,
    selectedFileName: selectedFile?.name || null,
  }
}
