"use client";

import { Globe } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  resolveDeliveryPlatformLogo,
  type ResolvedDeliveryPlatform,
} from "@/lib/orders/delivery-platform";

interface DeliveryPlatformBadgeProps {
  order: Parameters<typeof resolveDeliveryPlatformLogo>[0];
  className?: string;
  compact?: boolean;
}

function PlatformLogo({ platform }: { platform: ResolvedDeliveryPlatform }) {
  if (platform.logoSrc) {
    return (
      <Image
        src={platform.logoSrc}
        alt=""
        aria-hidden="true"
        width={16}
        height={16}
        className="h-4 w-4 shrink-0 rounded-sm object-contain"
      />
    );
  }

  return <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

export function DeliveryPlatformBadge({
  order,
  className,
  compact = false,
}: DeliveryPlatformBadgeProps) {
  const platform = resolveDeliveryPlatformLogo(order);
  if (!platform) return null;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background px-2 py-0.5 text-xs font-medium text-foreground shadow-sm",
        platform.isFallback && "text-muted-foreground",
        className
      )}
      title={`${platform.label} (${platform.sourceField}: ${platform.rawValue})`}
    >
      <PlatformLogo platform={platform} />
      {!compact && <span className="truncate">{platform.label}</span>}
    </span>
  );
}
