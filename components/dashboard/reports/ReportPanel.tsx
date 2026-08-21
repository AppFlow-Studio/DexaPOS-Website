"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Report-specific panel primitives used while the report suite is migrated
 * away from the legacy shadcn Card surface. They deliberately enforce the
 * dashboard panel hierarchy even when an older report still passes obsolete
 * shadow, ring, background, or radius classes.
 */
export function ReportPanel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      data-slot="report-panel"
      className={cn(
        "min-w-0 !rounded-3xl !border !border-border !bg-card !shadow-none !ring-0 !backdrop-blur-none",
        "[&_thead_tr]:!border-b [&_thead_tr]:!border-border/60 [&_thead_tr]:!bg-transparent [&_thead_tr]:hover:!bg-transparent",
        "[&_th]:!h-auto [&_th]:!py-2.5 [&_th]:!text-[0.8125rem] [&_th]:!font-normal [&_th]:!text-muted-foreground",
        "[&_tbody_tr]:!border-b [&_tbody_tr]:!border-border/60 [&_tbody_tr]:transition-colors [&_tbody_tr]:last:!border-0 [&_tbody_tr]:hover:!bg-muted/50",
        "[&_td]:!py-3 [&_td]:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export function ReportPanelHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <header
      className={cn("space-y-1 px-4 pb-3 pt-6 sm:px-6", className)}
      {...props}
    />
  );
}

export function ReportPanelTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "!text-[1.0625rem] !font-semibold !text-[#0C4FD1] dark:!text-[#6CA0FF]",
        className,
      )}
      {...props}
    />
  );
}

export function ReportPanelDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

export function ReportPanelContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-6 sm:px-6", className)} {...props} />;
}
