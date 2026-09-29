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
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
      aria-label={preview ? 'Change merchant logo' : 'Upload merchant logo'}
      className={cn(
        'relative flex h-12 w-12 shrink-0 cursor-pointer select-none items-center justify-center rounded-2xl bg-muted text-muted-foreground',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
      )}
    >
      {/* Logo or fallback icon — clipped by its own box so the badge below can
          sit over the plate's corner. */}
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={merchantName}
            className="h-full w-full object-cover"
          />
        ) : (
          <Store className="h-6 w-6" />
        )}
      </div>

      {/* The change affordance is visible at rest, not revealed on hover (§7). */}
      {!isPending && (
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border"
        >
          <Camera className="h-3 w-3" />
        </span>
      )}

      {/* Upload in progress */}
      {isPending && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/55">
          <Loader2 className="h-4 w-4 animate-spin text-white" />
        </div>
      )}

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
