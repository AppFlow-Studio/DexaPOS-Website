'use client'

import { ImageIcon, Loader2, Trash2, Upload } from 'lucide-react'
import { useRef } from 'react'

import { Button } from '@/components/ui/button'
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
}: CdnImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const openFilePicker = () => {
    if (disabled || uploading) return
    inputRef.current?.click()
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
          onFileSelect(file)
          event.currentTarget.value = ''
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
                Replace image
              </Button>
              <Button
                disabled={disabled || uploading}
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
    </div>
  )
}
