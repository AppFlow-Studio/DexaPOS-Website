"use client";

import { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";

import { renderBrandedQrPngBlob, type BrandedQrOptions } from "@/lib/qr/render";
import { cn } from "@/lib/utils";

interface BrandedQrPreviewProps {
  /** URL to encode. When empty the preview shows a placeholder rather than an error. */
  value: string | null;
  branding: Omit<BrandedQrOptions, "value">;
  className?: string;
  /** Rendered size in CSS pixels. The underlying raster is drawn at 2x for crispness. */
  sizePx?: number;
  /**
   * Accessible name for the image. Two of these can sit on one screen — the
   * table-code preview and the marketing-code preview — and identical alt text
   * leaves a screen reader user unable to tell which is which.
   */
  label?: string;
  /** Shown when there is nothing to encode yet. Table and marketing codes are
   *  created in different ways, so they need different instructions. */
  emptyLabel?: string;
}

interface RenderOutcome {
  /** Identifies which input produced this outcome, so stale results are ignored. */
  key: string;
  objectUrl: string | null;
  error: string | null;
}

/**
 * Live preview of the branded QR code.
 *
 * Deliberately renders the *raster* output rather than the SVG: this is the
 * artwork that ends up on the printed table tent, so previewing anything else
 * would reintroduce the on-screen/on-paper gap the ticket is about.
 */
export function BrandedQrPreview({
  value,
  branding,
  className,
  sizePx = 176,
  label = "Preview of the branded QR code",
  emptyLabel = "Generate a table QR code to see the branded preview.",
}: BrandedQrPreviewProps) {
  const [outcome, setOutcome] = useState<RenderOutcome | null>(null);

  const { logoUrl, moduleColor, backgroundColor, secondaryColor } = branding;

  // Every input that changes the artwork, collapsed into one comparable value.
  // Tagging the result with this lets a slow render that resolves after the
  // inputs moved on be discarded instead of flashing the wrong code.
  const renderKey = JSON.stringify([
    value,
    logoUrl,
    moduleColor,
    backgroundColor,
    secondaryColor,
    sizePx,
  ]);

  useEffect(() => {
    if (!value) return;

    let cancelled = false;
    let createdUrl: string | null = null;

    renderBrandedQrPngBlob({
      value,
      logoUrl,
      moduleColor,
      backgroundColor,
      secondaryColor,
      sizePx: sizePx * 2,
    })
      .then(({ data }) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(data);
        setOutcome({ key: renderKey, objectUrl: createdUrl, error: null });
      })
      .catch((renderError: unknown) => {
        if (cancelled) return;
        setOutcome({
          key: renderKey,
          objectUrl: null,
          error:
            renderError instanceof Error
              ? renderError.message
              : "Could not render the QR preview.",
        });
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [
    renderKey,
    value,
    logoUrl,
    moduleColor,
    backgroundColor,
    secondaryColor,
    sizePx,
  ]);

  // Derive the display state rather than storing it: an outcome tagged with a
  // stale key is simply not current, which is also what "still rendering"
  // means for freshly changed inputs.
  const current = outcome?.key === renderKey ? outcome : null;
  const isRendering = Boolean(value) && current === null;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background",
        className
      )}
      style={{ width: sizePx, height: sizePx }}
    >
      {isRendering ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : current?.error ? (
        <div className="flex flex-col items-center gap-1 px-3 text-center">
          <ImageOff className="h-5 w-5 text-muted-foreground" />
          <span className="text-[11px] leading-tight text-muted-foreground">
            {current.error}
          </span>
        </div>
      ) : current?.objectUrl ? (
        // A blob: URL cannot be run through the Next image optimizer, and the
        // bytes are already local, so there is nothing for <Image /> to do.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={current.objectUrl}
          alt={label}
          width={sizePx}
          height={sizePx}
          className="h-full w-full object-contain"
        />
      ) : (
        <span className="px-3 text-center text-[11px] leading-tight text-muted-foreground">
          {emptyLabel}
        </span>
      )}
    </div>
  );
}
