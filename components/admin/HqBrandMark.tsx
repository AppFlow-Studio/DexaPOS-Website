"use client";

import Image from "next/image";
import { Shield } from "lucide-react";
import { useState } from "react";

interface HqBrandMarkProps {
  imageUrl?: string | null;
  organizationName?: string | null;
}

export function resolveHqLogoSource(value: string | null | undefined): string | null {
  const source = value?.trim();
  if (!source) return null;
  if (source.startsWith("/") && !source.startsWith("//")) return source;

  try {
    const url = new URL(source);
    return url.protocol === "https:" || url.protocol === "http:" ? source : null;
  } catch {
    return null;
  }
}

export function HqBrandMark({ imageUrl, organizationName }: HqBrandMarkProps) {
  const source = resolveHqLogoSource(imageUrl);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const showImage = Boolean(source && source !== failedSource);

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary">
      {showImage && source ? (
        <Image
          src={source}
          alt={organizationName || "Dexa POS HQ"}
          width={32}
          height={32}
          className="h-8 w-8 object-cover"
          onError={() => setFailedSource(source)}
        />
      ) : (
        <Shield
          className="h-4 w-4 text-primary-foreground"
          aria-label="Dexa POS HQ logo fallback"
        />
      )}
    </div>
  );
}
