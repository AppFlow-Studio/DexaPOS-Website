"use client";

import { CircleX } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The full-screen working surface.
 *
 * Four different jobs share this one chrome — editing a page, setting the
 * site-wide style, creating a page, creating a form — and they differ only in
 * the title, the centre slot and the label on the single primary button. That
 * sameness is the point: a merchant learns the exit and the commit once.
 *
 * **It covers the dashboard sidebar deliberately.** `fixed inset-0` rather than
 * a panel inside `#main-content`, because a surface that leaves the sidebar
 * visible invites a merchant to navigate away mid-edit, and the old builder had
 * to spend negative margins fighting the dashboard's padding to get full-bleed
 * anyway. Escaping the layout is cheaper than cancelling it.
 *
 * The primary action carries its icon on the *right* — `Publish ⊕`, `Save ✓`,
 * `Create →`. That is not decoration: it distinguishes the one committing
 * button on screen from every other button in the product, which puts icons
 * on the left.
 */
export default function OverlayChrome({
  title,
  centre,
  action,
  aside,
  onClose,
  closeHref,
  children,
}: {
  /** The thing being worked on — a page name, or the name of the mode. */
  title: string;
  /** Mode switch or similar. Horizontally centred, absent on most screens. */
  centre?: React.ReactNode;
  /** The single committing action. */
  action?: React.ReactNode;
  /** Anything sitting just before the primary action. */
  aside?: React.ReactNode;
  /** Takes precedence over `closeHref`. */
  onClose?: () => void;
  /** Where `Close` goes when there is nothing to tear down first. */
  closeHref?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const close = () => {
    if (onClose) return onClose();
    if (closeHref) router.push(closeHref);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="relative flex h-14 shrink-0 items-center gap-3 border-b px-3 sm:px-4">
        <Button variant="outline" size="sm" onClick={close} className="gap-1.5">
          <CircleX className="size-4" />
          Close
        </Button>

        <h1 className="min-w-0 truncate text-sm font-semibold">{title}</h1>

        {/* Absolutely centred rather than flex-centred: the title on the left
            and the actions on the right are different widths on every screen,
            and a mode switch that drifts as the page name grows reads as a
            rendering bug. */}
        {centre && (
          <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 md:block">
            <div className="pointer-events-auto">{centre}</div>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {aside}
          {action}
        </div>
      </header>

      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * The left rail every overlay puts its controls in.
 *
 * Fixed width, its own scroll, and an optional footer that stays pinned — which
 * is where `Done` lives when the rail is editing something.
 */
export function OverlayRail({
  children,
  footer,
  className,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col border-r bg-background sm:w-60 lg:w-64",
        className,
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && <div className="shrink-0 border-t p-3">{footer}</div>}
    </aside>
  );
}

/** The grey field an overlay's preview sits on. */
export function OverlayStage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-auto bg-muted/40 p-4 sm:p-8", className)}>
      {children}
    </div>
  );
}
