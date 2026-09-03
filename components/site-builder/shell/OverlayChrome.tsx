"use client";

import { CircleX, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { claimOverlay } from "@/lib/hooks/overlay-open";
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
 *
 * **It claims the screen as well as covering it.** Covering was all it used to
 * do: the sidebar, the dashboard header and the mobile tab bar stayed tabbable
 * behind it, the tab bar rendered *over* the drawer's Done button because both
 * were `z-50` and it came later in the DOM, and ⌘K opened the global palette
 * with an offer to navigate away mid-edit. It now announces itself as a modal
 * dialog and publishes its existence through `claimOverlay`, which is what the
 * dashboard shell reads to make itself inert. See `lib/hooks/overlay-open.ts`
 * for why the shell cannot simply be made inert from here.
 */
export default function OverlayChrome({
  title,
  centre,
  action,
  aside,
  onTitleClick,
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
  /**
   * Makes the title itself the way into the settings for the thing it names.
   *
   * Optional because most overlays title a *mode* — `Style`, `New Page` —
   * which has nothing behind it. Where the title names an object the merchant
   * owns, this is where renaming, its URL and removing it live.
   */
  onTitleClick?: () => void;
  /** Takes precedence over `closeHref`. */
  onClose?: () => void;
  /** Where `Close` goes when there is nothing to tear down first. */
  closeHref?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Publishes "an overlay is open" for as long as this one is mounted.
  useEffect(() => claimOverlay(), []);

  /*
    Focus starts inside the overlay rather than wherever the click that opened
    it left it. Without this the first Tab lands on whatever followed the
    trigger in the *dashboard's* tab order, which is the behaviour that made
    the app behind the overlay reachable in the first place.

    The container takes the focus, not the first control: a merchant who opened
    the editor to look at their page has not asked to have the Close button
    highlighted.
  */
  useEffect(() => {
    surfaceRef.current?.focus({ preventScroll: true });
  }, []);

  const close = () => {
    if (onClose) return onClose();
    if (closeHref) router.push(closeHref);
  };

  return (
    <div
      ref={surfaceRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      /*
        z-60, not z-50. `MobileBottomNav` is also z-50 and renders later in the
        dashboard layout's DOM order, so at 420 px it won the tie and covered
        the drawer's Done button completely — the button reported its own
        coordinates correctly and `elementFromPoint` returned the tab bar.
      */
      className="fixed inset-0 z-[60] flex flex-col bg-background outline-none"
    >
      <header className="relative flex h-14 shrink-0 items-center gap-3 border-b px-3 sm:px-4">
        <Button variant="outline" size="sm" onClick={close} className="gap-1.5">
          <CircleX className="size-4" />
          Close
        </Button>

        {onTitleClick ? (
          // The gear stays visible rather than appearing on hover. A control
          // that only exists once you are already touching it is how the page
          // settings drawer came to be unreachable in the first place.
          <button
            type="button"
            onClick={onTitleClick}
            aria-label={`${title} — page settings`}
            className="-mx-1.5 flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-accent"
          >
            <h1 id={titleId} className="min-w-0 truncate text-sm font-semibold">
              {title}
            </h1>
            <Settings2 className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        ) : (
          <h1 id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </h1>
        )}

        {/* Absolutely centred rather than flex-centred: the title on the left
            and the actions on the right are different widths on every screen,
            and a mode switch that drifts as the page name grows reads as a
            rendering bug.

            There is no room to centre anything on a phone, so below `md` the
            same control rides in the action cluster instead. It used to be
            `hidden md:block` and nothing else, which meant Preview — the one
            thing that works properly on a small screen — was the one thing
            unreachable there. */}
        {centre && (
          <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 md:block">
            <div className="pointer-events-auto">{centre}</div>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {centre && <div className="md:hidden">{centre}</div>}
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
      {/* The bottom padding is for the pinned footer: without it the last
          control in the rail ended flush against the Done button and read as
          clipped — the SEO panel's helper text was cut mid-sentence and the
          Gallery drawer's Columns control sat right under the button. */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">{children}</div>
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
