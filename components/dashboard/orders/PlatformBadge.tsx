"use client";

import Image from "next/image";
import * as React from "react";
import {
  platformLogo,
  platformLabel,
  platformColor,
} from "@/lib/orderout/platform";
import { cn } from "@/lib/utils";

interface PlatformBadgeProps {
  /** Raw delivery_platform value (e.g. "Grubhub", "Uber Eats"). */
  platform: string | null | undefined;
  /** Logo edge length in px. */
  size?: number;
  /** Hide the text label, showing only the logo/dot (e.g. tight table cells). */
  iconOnly?: boolean;
  className?: string;
}

/**
 * Delivery-marketplace indicator: real logo (assets from Abubeckr in /public) when
 * one is mapped, otherwise a brand-colored dot. Keeps the Orders list + Order Details
 * consistent and matches the Jun 10 relabel (no status-pill dots — logos, not dots,
 * for platforms). Vocabulary/logo source: lib/orderout/platform.ts.
 */
export function PlatformBadge({
  platform,
  size = 16,
  iconOnly = false,
  className,
}: PlatformBadgeProps) {
  const label = platformLabel(platform);
  const logo = platformLogo(platform);
  const [errored, setErrored] = React.useState(false);

  if (!platform) return null;

  const mark =
    logo && !errored ? (
      <Image
        src={logo}
        alt={iconOnly ? label : ""}
        width={size}
        height={size}
        className="shrink-0 rounded-[3px] object-contain"
        onError={() => setErrored(true)}
      />
    ) : (
      <span
        className="shrink-0 rounded-full"
        style={{
          width: Math.round(size * 0.55),
          height: Math.round(size * 0.55),
          backgroundColor: platformColor(platform),
        }}
        aria-hidden
      />
    );

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {mark}
      {!iconOnly && (
        <span className="font-medium text-foreground/80">{label}</span>
      )}
    </span>
  );
}
