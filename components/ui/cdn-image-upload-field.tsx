'use client'

import { Crop, ImageIcon, Loader2, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  CROPPABLE_MIME_TYPES,
  ImageCropDialog,
  urlToFile,
} from '@/components/ui/image-crop-dialog'
import { cn } from '@/lib/utils'

interface CdnImageUploadFieldProps {
  disabled?: boolean
  helperText?: string
  onClear: () => void
  onFileSelect: (file: File | null) => void
  previewUrl: string | null
  selectedFileName?: string | null
  uploadLabel?: string
  uploading?: boolean
  /**
   * Optional fixed aspect ratio for the pre-upload crop step (e.g. 1 for
   * square, 4/3 for product shots). When omitted the crop dialog defaults to
   * the image's natural aspect, so at zoom 1 the full image is kept untouched.
   */
  cropAspectRatio?: number
  /**
   * Title shown in the crop dialog header. Defaults to "Adjust your image".
   */
  cropDialogTitle?: string
  /**
   * When the upload field is rendered inside a Radix Dialog or BottomSheet,
   * use `"high"` (default) so the crop dialog floats above it. Switch to
   * `"default"` only for uploads rendered on a plain page.
   */
  cropDialogElevation?: 'default' | 'high'
}

const ACCEPTED_IMAGE_TYPES = '.jpg,.jpeg,.png,.webp,.gif,.svg'

export function CdnImageUploadField({
  disabled = false,
  helperText,
  onClear,
  onFileSelect,
  previewUrl,
  selectedFileName,
  uploadLabel = 'Upload image',
  uploading = false,
  cropAspectRatio,
  cropDialogTitle,
  cropDialogElevation = 'high',
}: CdnImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [isLoadingForAdjust, setIsLoadingForAdjust] = useState(false)

  const openFilePicker = () => {
    if (disabled || uploading) return
    inputRef.current?.click()
  }

  const openAdjustDialog = async () => {
    if (disabled || uploading || isLoadingForAdjust) return
    if (!previewUrl) return

    setIsLoadingForAdjust(true)
    try {
      const fileName = selectedFileName || inferFileNameFromUrl(previewUrl)
      const file = await urlToFile(previewUrl, fileName)

      if (!CROPPABLE_MIME_TYPES.has(file.type)) {
        toast.error('This image format cannot be adjusted (GIF/SVG). Replace with a JPEG, PNG, or WebP to crop.')
        return
      }

      setPendingFile(file)
      setCropOpen(true)
    } catch (error) {
      console.error('Failed to load image for adjustment', { previewUrl, error })
      const detail = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Could not load image: ${detail}`)
    } finally {
      setIsLoadingForAdjust(false)
    }
  }

  const handleFilePicked = (file: File | null) => {
    if (!file) {
      onFileSelect(null)
      return
    }

    // GIFs and SVGs bypass the crop step — GIFs are animated, SVGs are vectors,
    // neither can be usefully re-rasterised through a canvas.
    if (!CROPPABLE_MIME_TYPES.has(file.type)) {
      onFileSelect(file)
      return
    }

    setPendingFile(file)
    setCropOpen(true)
  }

  const handleCropConfirm = (croppedFile: File) => {
    onFileSelect(croppedFile)
    setPendingFile(null)
  }

  const handleCropOpenChange = (open: boolean) => {
    setCropOpen(open)
    if (!open) {
      setPendingFile(null)
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0] || null
          event.currentTarget.value = ''
          handleFilePicked(file)
        }}
        type="file"
      />

      <div
        className={cn(
          'rounded-xl border border-dashed bg-muted/20 p-4',
          previewUrl ? 'border-border' : 'border-muted-foreground/30',
        )}
      >
        {previewUrl ? (
          <div className="space-y-4">
            <div className="mx-auto w-full max-w-sm overflow-hidden rounded-lg border bg-background">
              <div className="h-40 bg-muted/40 sm:h-44">
                <img
                  alt="Upload preview"
                  className="h-full w-full object-cover"
                  src={previewUrl}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={disabled || uploading || isLoadingForAdjust}
                onClick={openAdjustDialog}
                size="sm"
                type="button"
                variant="outline"
              >
                {isLoadingForAdjust ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Crop className="mr-2 h-4 w-4" />
                )}
                Adjust
              </Button>
              <Button
                disabled={disabled || uploading || isLoadingForAdjust}
                onClick={openFilePicker}
                size="sm"
                type="button"
                variant="outline"
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Replace image
              </Button>
              <Button
                disabled={disabled || uploading || isLoadingForAdjust}
                onClick={onClear}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No image selected</p>
              <p className="text-xs text-muted-foreground">
                JPG, PNG, WEBP, GIF, or SVG up to 5 MB
              </p>
            </div>
            <Button
              disabled={disabled || uploading}
              onClick={openFilePicker}
              size="sm"
              type="button"
              variant="outline"
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {uploadLabel}
            </Button>
          </div>
        )}
      </div>

      {(selectedFileName || helperText) && (
        <div className="space-y-1 text-xs text-muted-foreground">
          {selectedFileName && (
            <p>
              Ready to upload on save: <span className="font-medium text-foreground">{selectedFileName}</span>
            </p>
          )}
          {helperText && <p>{helperText}</p>}
        </div>
      )}

      <ImageCropDialog
        file={pendingFile}
        open={cropOpen}
        onOpenChange={handleCropOpenChange}
        onConfirm={handleCropConfirm}
        aspectRatio={cropAspectRatio}
        title={cropDialogTitle}
        elevation={cropDialogElevation}
      />
    </div>
  )
}

function inferFileNameFromUrl(url: string): string {
  try {
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      return 'image.png'
    }
    const pathname = new URL(url).pathname
    const last = pathname.split('/').filter(Boolean).pop()
    return last && last.length > 0 ? decodeURIComponent(last) : 'image.png'
  } catch {
    return 'image.png'
  }
}
