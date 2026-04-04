'use client'

import { useRef, useState, useTransition } from 'react'
import { Store, Camera, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/queries/admin-keys'
import { uploadMerchantLogo } from '@/app/manage/actions/upload-merchant-logo'
import { cn } from '@/lib/utils'

interface MerchantLogoUploadProps {
  merchantId: string
  merchantName: string
  logoUrl: string | null
}

export function MerchantLogoUpload({ merchantId, merchantName, logoUrl }: MerchantLogoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(logoUrl)
  const [isPending, startTransition] = useTransition()
  const queryClient = useQueryClient()

  function handleClick() {
    inputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Optimistic preview
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)

    const formData = new FormData()
    formData.append('logo', file)

    startTransition(async () => {
      const result = await uploadMerchantLogo(merchantId, formData)

      if (result.success && result.logoUrl) {
        // Replace object URL with the real stored URL
        URL.revokeObjectURL(objectUrl)
        setPreview(result.logoUrl)
        toast.success('Logo updated successfully')
        queryClient.invalidateQueries({ queryKey: adminKeys.merchantDetail(merchantId) })
      } else {
        // Revert preview on failure
        URL.revokeObjectURL(objectUrl)
        setPreview(logoUrl)
        toast.error(result.error ?? 'Failed to upload logo')
      }
    })

    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      aria-label={preview ? 'Change merchant logo' : 'Upload merchant logo'}
      className={cn(
        'relative h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden',
        'cursor-pointer select-none group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1'
      )}
    >
      {/* Logo or fallback icon */}
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt={merchantName}
          className="h-full w-full object-cover"
        />
      ) : (
        <Store className="h-6 w-6 text-primary" />
      )}

      {/* Hover / loading overlay */}
      <div
        className={cn(
          'absolute inset-0 flex flex-col items-center justify-center rounded-lg transition-opacity duration-150',
          'bg-black/55',
          isPending ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 text-white animate-spin" />
        ) : (
          <Camera className="h-4 w-4 text-white" />
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={handleFileChange}
        disabled={isPending}
      />
    </div>
  )
}
