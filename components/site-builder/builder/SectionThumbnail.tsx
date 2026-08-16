"use client";

import type { SectionKind } from "@/lib/site-builder/sections/kinds";
import { cn } from "@/lib/utils";

/**
 * A wireframe of what each section looks like on the page.
 *
 * The add-section list used to be an icon, a name and a sentence — which asks a
 * restaurant owner to picture "Features" from the word "Features". A shape
 * answers that instantly: three columns with icons is recognisable before the
 * label is read.
 *
 * Drawn with divs rather than shipped as images on purpose. There is no asset
 * pipeline to keep in sync when a section's layout changes, it costs no
 * requests, and it inherits `currentColor` so the same thumbnail works on a
 * hovered card, a disabled card, and in dark mode without a second copy.
 */

const BAR = "rounded-full bg-current";
const BLOCK = "rounded-sm bg-current";

export default function SectionThumbnail({
  kind,
  className,
}: {
  kind: SectionKind;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-16 w-full flex-col justify-center gap-1 overflow-hidden rounded-md border bg-muted/40 p-2 text-muted-foreground/45",
        className,
      )}
    >
      {SHAPES[kind]}
    </div>
  );
}

const SHAPES: Record<SectionKind, React.ReactNode> = {
  header: (
    <div className="flex items-center justify-between">
      <div className={cn(BLOCK, "h-2.5 w-6")} />
      <div className="flex items-center gap-1">
        <div className={cn(BAR, "h-1 w-3")} />
        <div className={cn(BAR, "h-1 w-3")} />
        <div className={cn(BLOCK, "h-2 w-5 opacity-70")} />
      </div>
    </div>
  ),

  hero: (
    <div className="flex flex-col items-center gap-1">
      <div className={cn(BAR, "h-1.5 w-2/3")} />
      <div className={cn(BAR, "h-1 w-1/2 opacity-60")} />
      <div className={cn(BLOCK, "mt-0.5 h-3 w-10 opacity-80")} />
    </div>
  ),

  content: (
    <div className="flex items-center gap-2">
      <div className={cn(BLOCK, "h-10 w-10 shrink-0 opacity-60")} />
      <div className="flex flex-1 flex-col gap-1">
        <div className={cn(BAR, "h-1.5 w-2/3")} />
        <div className={cn(BAR, "h-1 w-full opacity-60")} />
        <div className={cn(BAR, "h-1 w-full opacity-60")} />
        <div className={cn(BAR, "h-1 w-3/5 opacity-60")} />
      </div>
    </div>
  ),

  gallery: (
    <div className="grid grid-cols-4 gap-1">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} className={cn(BLOCK, "aspect-square w-full opacity-60")} />
      ))}
    </div>
  ),

  "popular-items": (
    <div className="grid grid-cols-3 gap-1.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className={cn(BLOCK, "h-6 w-full opacity-55")} />
          <div className={cn(BAR, "h-1 w-4/5")} />
          <div className={cn(BAR, "h-1 w-1/2 opacity-60")} />
        </div>
      ))}
    </div>
  ),

  features: (
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div className={cn(BLOCK, "size-3 rounded-full opacity-70")} />
          <div className={cn(BAR, "h-1 w-full")} />
          <div className={cn(BAR, "h-1 w-2/3 opacity-60")} />
        </div>
      ))}
    </div>
  ),

  faq: (
    <div className="flex flex-col gap-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between gap-2">
          <div className={cn(BAR, "h-1.5", i === 0 ? "w-3/5" : "w-1/2")} />
          <div className={cn(BAR, "h-1 w-1.5 shrink-0 opacity-70")} />
        </div>
      ))}
      <div className={cn(BAR, "h-1 w-full opacity-40")} />
    </div>
  ),

  location: (
    <div className="flex items-center gap-2">
      <div className={cn(BLOCK, "h-10 flex-1 opacity-55")} />
      <div className="flex flex-1 flex-col gap-1">
        <div className={cn(BAR, "h-1.5 w-3/4")} />
        <div className={cn(BAR, "h-1 w-full opacity-60")} />
        <div className={cn(BAR, "h-1 w-2/3 opacity-60")} />
        <div className={cn(BAR, "h-1 w-1/2 opacity-60")} />
      </div>
    </div>
  ),

  footer: (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className={cn(BAR, "h-1 w-full")} />
            <div className={cn(BAR, "h-1 w-2/3 opacity-60")} />
          </div>
        ))}
      </div>
      <div className={cn(BAR, "h-1 w-1/3 self-center opacity-40")} />
    </div>
  ),
};
