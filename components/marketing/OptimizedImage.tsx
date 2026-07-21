import Image from "next/image";

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  sizes: string;
  preload?: boolean;
  eager?: boolean;
  cmsAttrs?: Record<string, string>;
}

function canUseNextImage(src: string) {
  if (src.startsWith("/")) return true;

  try {
    const url = new URL(src);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

export default function OptimizedImage({
  src,
  alt,
  className,
  width = 1600,
  height = 900,
  fill = false,
  sizes,
  preload = false,
  eager = false,
  cmsAttrs,
}: OptimizedImageProps) {
  if (!canUseNextImage(src)) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        loading={preload || eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={preload ? "high" : "auto"}
        {...cmsAttrs}
      />
    );
  }

  const dimensions = fill ? { fill: true as const } : { width, height };
  return (
    <Image
      src={src}
      alt={alt}
      className={className}
      sizes={sizes}
      preload={preload}
      loading={preload ? undefined : eager ? "eager" : "lazy"}
      quality={75}
      {...dimensions}
      {...cmsAttrs}
    />
  );
}
