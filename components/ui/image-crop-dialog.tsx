'use client'

import Cropper, { type Area, type MediaSize } from 'react-easy-crop'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'

export const CROPPABLE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

interface ImageCropDialogProps {
  file: File | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (croppedFile: File) => void
  aspectRatio?: number
  title?: string
  description?: string
  elevation?: 'default' | 'high'
}

const DEFAULT_MIN_ZOOM = 1
const DEFAULT_MAX_ZOOM = 4

export function ImageCropDialog({
  file,
  open,
  onOpenChange,
  onConfirm,
  aspectRatio,
  title = 'Adjust your image',
  description = 'Drag to pan. Scroll, pinch, or use the slider to zoom.',
  elevation = 'high',
}: ImageCropDialogProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!file || !open) {
      revokeObjectUrl()
      setImageSrc(null)
      return
    }

    revokeObjectUrl()
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    setImageSrc(url)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setNaturalAspect(null)
  }, [file, open, revokeObjectUrl])

  useEffect(() => {
    return () => {
      revokeObjectUrl()
    }
  }, [revokeObjectUrl])

  const handleCropComplete = useCallback(
    (_croppedArea: Area, pixels: Area) => {
      setCroppedAreaPixels(pixels)
    },
    [],
  )

  const handleMediaLoaded = useCallback((mediaSize: MediaSize) => {
    if (mediaSize.naturalWidth > 0 && mediaSize.naturalHeight > 0) {
      setNaturalAspect(mediaSize.naturalWidth / mediaSize.naturalHeight)
    }
  }, [])

  const handleReset = () => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
  }

  const handleApply = async () => {
    if (!file || !imageSrc || !croppedAreaPixels) return

    setIsProcessing(true)
    try {
      const croppedFile = await cropImageFile(file, imageSrc, croppedAreaPixels)
      onConfirm(croppedFile)
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to crop image', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCancel = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        elevation={elevation}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="relative h-72 w-full overflow-hidden rounded-lg border bg-muted sm:h-96">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspectRatio ?? naturalAspect ?? 1}
              minZoom={DEFAULT_MIN_ZOOM}
              maxZoom={DEFAULT_MAX_ZOOM}
              restrictPosition
              showGrid
              objectFit="contain"
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
              onMediaLoaded={handleMediaLoaded}
            />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="image-crop-zoom" className="text-sm">
              Zoom
            </Label>
            <span className="text-xs text-muted-foreground">{zoom.toFixed(2)}x</span>
          </div>
          <Slider
            id="image-crop-zoom"
            min={DEFAULT_MIN_ZOOM}
            max={DEFAULT_MAX_ZOOM}
            step={0.01}
            value={[zoom]}
            onValueChange={(next) => setZoom(next[0] ?? 1)}
            aria-label="Zoom"
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={handleReset}
            disabled={isProcessing}
          >
            Reset
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleApply}
              disabled={isProcessing || !croppedAreaPixels}
            >
              {isProcessing ? 'Applying…' : 'Apply crop'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load image for cropping'))
    image.src = src
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode cropped image'))
          return
        }
        resolve(blob)
      },
      mimeType,
      quality,
    )
  })
}

/**
 * Fetches `url` (either a CDN URL or a blob: URL) and wraps the response as a
 * File so it can be fed back into the crop dialog. Used to re-crop an image
 * that has already been set on the field.
 *
 * Cross-origin URLs (e.g. Bunny CDN) are routed through `/api/cdn-proxy`
 * because Bunny pull zones don't return CORS headers by default, which would
 * otherwise block a direct browser `fetch`.
 */
export async function urlToFile(
  url: string,
  fileName: string,
  fallbackType = 'image/png',
): Promise<File> {
  const fetchUrl = resolveFetchUrl(url)
  let response: Response
  try {
    response = await fetch(fetchUrl, { credentials: 'same-origin' })
  } catch (cause) {
    console.error('[urlToFile] network error', { fetchUrl, cause })
    throw new Error('Network error while fetching image')
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error('[urlToFile] non-OK response', {
      fetchUrl,
      status: response.status,
      body: body.slice(0, 500),
    })
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`)
  }
  const blob = await response.blob()
  const type = blob.type && blob.type.startsWith('image/') ? blob.type : fallbackType
  return new File([blob], fileName, { type, lastModified: Date.now() })
}

function resolveFetchUrl(url: string): string {
  if (typeof window === 'undefined') return url
  if (url.startsWith('blob:') || url.startsWith('data:')) return url

  try {
    const parsed = new URL(url, window.location.href)
    if (parsed.origin === window.location.origin) {
      return parsed.toString()
    }
    return `/api/cdn-proxy?url=${encodeURIComponent(parsed.toString())}`
  } catch {
    return url
  }
}

/**
 * Crops `file` to the given pixel-space rectangle and returns a new File with
 * the same mime type and (approximately) the same name. PNG keeps lossless
 * encoding; JPEG/WebP encode at 0.95 quality to avoid double-compression
 * artifacts (downstream `optimizeImageForCdn` handles final size targeting).
 */
export async function cropImageFile(
  file: File,
  imageSrc: string,
  pixelCrop: Area,
): Promise<File> {
  const image = await loadHtmlImage(imageSrc)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable')
  }

  const width = Math.max(1, Math.round(pixelCrop.width))
  const height = Math.max(1, Math.round(pixelCrop.height))
  canvas.width = width
  canvas.height = height

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    width,
    height,
  )

  const mimeType = CROPPABLE_MIME_TYPES.has(file.type) ? file.type : 'image/png'
  const quality = mimeType === 'image/png' ? undefined : 0.95
  const blob = await canvasToBlob(canvas, mimeType, quality)

  return new File([blob], file.name, {
    type: mimeType,
    lastModified: Date.now(),
  })
}
