/* eslint-disable @next/next/no-img-element -- Merchant assets are arbitrary
   remote CDN URLs, so next/image would require allowlisting every possible host
   in next.config.ts. Optimisation moves to CDN URL transforms in Stage 7
   (PLAN-05 §2.4), which is why this component is the single choke point for
   every image a section can render. */

import type { AssetRef } from "@/lib/site-builder/bindings/types";
import type { RenderContext } from "@/lib/site-builder/render-context";

/**
 * The only way a section may render an image.
 *
 * Centralising it is what keeps merchant-uploaded photography from sinking a
 * page whose entire purpose is ranking: lazy loading, explicit dimensions to
 * stop layout shift, and `object-fit` all live here rather than being
 * remembered nine times. A lint check asserts no section reaches for a bare
 * `<img>`.
 *
 * Two things worth knowing:
 *
 *  * **No srcset yet.** Derivative generation still has to happen at the CDN.
 *    When it does, this component grows `srcSet`/`sizes` and every section
 *    benefits with no edits anywhere else.
 *  * **A missing asset renders nothing.** A deleted, foreign or unknown id
 *    resolves to null, and null means no element at all — so a merchant
 *    removing a photo from their library can never produce a broken-image icon
 *    on a live page.
 *
 * Alt text resolves in the order that respects the merchant's intent: the
 * per-placement `AssetRef.alt` first, then the library's default for that
 * image, then empty — which is the correct value for decoration, and the only
 * honest one when nobody has described the photograph.
 */
export default function SiteImage({
  asset,
  ctx,
  className,
  width,
  height,
  priority = false,
  fallbackUrl = null,
  ...rest
}: {
  asset: AssetRef | null | undefined;
  ctx: RenderContext;
  className?: string;
  width?: number;
  height?: number;
  /** The hero, and only the hero, should skip lazy loading. */
  priority?: boolean;
  /** Escape hatch for URLs the platform already owns (logo, store hero, item photos). */
  fallbackUrl?: string | null;
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "width" | "height">) {
  const resolved = asset ? ctx.resolveAsset(asset.assetId) : null;
  const src = resolved?.url ?? fallbackUrl;

  if (!src) return null;

  return (
    <img
      src={src}
      alt={asset?.alt ?? resolved?.alt ?? ""}
      width={width ?? resolved?.width ?? undefined}
      height={height ?? resolved?.height ?? undefined}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : undefined}
      className={className}
      {...rest}
    />
  );
}
