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
 * Two absences are deliberate:
 *
 *  * **No srcset yet.** Derivative generation is Stage 7. When it lands, this
 *    component grows `srcSet`/`sizes` and every section benefits with no edits.
 *  * **A missing asset renders nothing.** `site_assets` does not exist yet, so
 *    `resolveAssetUrl` returns null for everything. Renderers must already cope
 *    with that, which means Stage 7 changes nothing in this layer — and a
 *    deleted asset can never show a broken-image icon on a live site.
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
  const url = asset ? ctx.resolveAssetUrl(asset.assetId) : null;
  const src = url ?? fallbackUrl;

  if (!src) return null;

  return (
    <img
      src={src}
      alt={asset?.alt ?? ""}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : undefined}
      className={className}
      {...rest}
    />
  );
}
