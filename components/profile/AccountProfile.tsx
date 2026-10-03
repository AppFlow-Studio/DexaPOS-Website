"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { UserProfile, useUser } from "@clerk/nextjs";
import { useIsDarkTheme } from "@/app/sign-in/clerk-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/dashboard/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  AccountBodySkeleton,
  ProfileIdentitySkeleton,
} from "@/components/profile/ProfileSkeletons";

/*
 * The two halves of a profile page, shared by `/dashboard/profile` and
 * `/manage/profile` so the Clerk theming below exists once. Each page supplies
 * its own shell (`PageShell as="div"` on HQ, §14.1) and its own labels.
 *
 * ⚠️ Classes are literal strings in this .tsx on purpose (C7).
 */

export interface ProfileIdentity {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

/**
 * Identity summary: avatar, name, email and neutral label pills (an org, an
 * HQ role). A tier 1 panel, not a `<Card>` (C6, §3.1).
 */
export function ProfileIdentityPanel({
  identity,
  labels = [],
  labelsLoading = false,
  isLoading,
  isError,
  onRetry,
}: {
  identity: ProfileIdentity | null;
  /** Rendered as neutral pills — a label, not a status (§4.6b). */
  labels?: string[];
  /**
   * The labels arrive separately from the identity (the HQ role does). Holds
   * the pill row's place meanwhile, so the panel does not grow under the
   * reader when they land (§4.10).
   */
  labelsLoading?: boolean;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
}) {
  return (
    <Panel padded>
      {isError ? (
        // A failure said in words on a neutral well, never red text (§4.9).
        <div
          role="status"
          className="flex flex-col items-start gap-3 rounded-2xl bg-muted/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">We couldn&apos;t load your profile details</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your account settings below still work.
            </p>
          </div>
          {onRetry ? (
            // 44px on phones, where it is the panel's primary control (§13.6).
            <Button variant="outline" size="sm" className="h-11 shrink-0 px-4 sm:h-9" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : isLoading || !identity ? (
        // The same blocks as the route's `loading.tsx` (§4.10).
        <>
          <p role="status" className="sr-only">
            Loading your profile details
          </p>
          <ProfileIdentitySkeleton />
        </>
      ) : (
        <div className="flex items-center gap-4">
          {/* Avatars beside a name drop below `sm` (§13.4). */}
          <Avatar className="hidden h-16 w-16 shrink-0 sm:flex">
            <AvatarImage
              src={identity.avatarUrl ?? undefined}
              alt={identity.firstName ?? ""}
            />
            <AvatarFallback className="text-lg">
              {identity.firstName?.charAt(0)}
              {identity.lastName?.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <h2 className="truncate text-[1.0625rem] font-semibold">
              {[identity.firstName, identity.lastName].filter(Boolean).join(" ") || "—"}
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              {identity.email ?? "—"}
            </p>
            {labelsLoading ? (
              <div className="pt-1">
                <Skeleton
                  aria-hidden="true"
                  className="h-5 w-28 max-w-full rounded-full bg-muted/70 motion-reduce:animate-none"
                />
              </div>
            ) : labels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {labels.map((label, index) => (
                  <span
                    key={`${label}-${index}`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Panel>
  );
}

/*
 * Clerk's own section nav is a side rail on desktop and, below 768px, a
 * hamburger that slides a drawer over the page (§12 bans both the drawer and
 * the slide). It is hidden at every width; this DS-CTL-05 pill rail replaces
 * it (§4.5, §13.2). `<UserProfile routing="hash">` reads its page from the URL
 * hash (`#/security`) and re-renders on `hashchange`, so the rail drives it by
 * setting the hash, and follows it when Clerk navigates itself.
 *
 * Clerk shows exactly these two pages for this app. A page enabled later in
 * the Clerk dashboard (billing, API keys) needs adding here, or it is
 * unreachable.
 */
const ACCOUNT_PAGES = [
  { label: "Profile", hash: "/" },
  { label: "Security", hash: "/security" },
] as const;

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readAccountPageHash() {
  // `#/security`, or `#/security/...` on one of its sub-routes.
  return window.location.hash.startsWith("#/security") ? "/security" : "/";
}

function AccountSectionRail() {
  const activeHash = useSyncExternalStore(
    subscribeToHash,
    readAccountPageHash,
    () => "/",
  );

  return (
    <nav aria-label="Account sections" className="no-scrollbar w-full min-w-0 overflow-x-auto">
      <div className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
        {ACCOUNT_PAGES.map((page) => {
          const isActive = page.hash === activeHash;
          return (
            <button
              key={page.hash}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                window.location.hash = page.hash;
              }}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {page.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Clerk's account UI in a tier 1 panel, under our own section rail. The Panel
 * owns the surface, so Clerk's own card is stripped bare — otherwise it
 * renders a second bordered, shadowed box inside ours. Its inputs are restyled
 * to the DS-CTL-02 material (muted, borderless, rounded) since Clerk ships
 * bordered fields.
 *
 * `!` throughout because Clerk injects its styles at runtime with higher
 * specificity than a plain utility class — the same failure the sign-in
 * Continue button hit. Clerk's layout source (`npm pack @clerk/ui@1`,
 * `dist/elements/**`) is the reference for every override below.
 */
export function ClerkAccountPanel() {
  const isDark = useIsDarkTheme();
  // Clerk renders nothing until its script boots, leaving the Panel an empty
  // box for seconds. Hold its shape until the widget can paint.
  const { isLoaded: isClerkLoaded } = useUser();
  const [isProfilePainted, setIsProfilePainted] = useState(false);
  const profileWidgetRef = useRef<HTMLDivElement>(null);

  // `useUser().isLoaded` only means Clerk's user resource is ready. The
  // `<UserProfile>` widget mounts in a later pass, so using that flag alone
  // briefly exposes an empty, collapsed Panel. Keep the in-panel fallback
  // visible until the widget has actually painted meaningful content.
  useEffect(() => {
    if (!isClerkLoaded) return;

    const host = profileWidgetRef.current;
    if (!host) return;

    const markPainted = () => {
      if (host.textContent?.trim()) {
        setIsProfilePainted(true);
        return true;
      }
      return false;
    };

    if (markPainted()) return;

    const observer = new MutationObserver(() => {
      if (markPainted()) observer.disconnect();
    });
    observer.observe(host, { childList: true, subtree: true, characterData: true });

    return () => observer.disconnect();
  }, [isClerkLoaded]);

  // `UserProfile` types `appearance` as `Theme`, which omits `baseTheme` — and
  // passing it anyway had no effect (Clerk set none of its `--clerk-color-*`
  // variables and the widget stayed light-on-dark). The colours are therefore
  // driven through `variables`, which this component does honour, mapped to the
  // dashboard's own dark surfaces (C4: `--card` is `#1c1f26` in the dashboard).
  const clerkColors = isDark
    ? {
        colorPrimary: "#6ca0ff",
        colorBackground: "transparent",
        colorText: "#e5e7eb",
        colorTextSecondary: "#9ca3af",
        colorInputBackground: "#242833",
        colorInputText: "#e5e7eb",
      }
    : { colorPrimary: "#0c4fd1" };

  return (
    <Panel padded>
      <div className="min-w-0 space-y-6">
        <AccountSectionRail />
        {/* `overflow-x-clip`, not `hidden`: opening an inline editor makes
            Clerk call `scrollIntoView`, which scrolls every scrollable
            ancestor, and an `overflow-hidden` box (our Panel) is still
            scrollable by script. Anything of Clerk's that overhangs then slid
            the whole panel sideways. A `clip` box can't be scrolled, and what
            it clips adds no scrollable overflow to the Panel. Vertical stays
            visible for the in-flow menus. `-mx-2 px-2` moves the clip edge
            8px out into the Panel's padding without moving the content, so
            glyphs that overhang their box (the bold "P" of "Profile details")
            are not trimmed by it. */}
        <div className="relative -mx-2 min-w-0 overflow-x-clip px-2">
          {!isProfilePainted ? (
            // The same blocks as the route's `loading.tsx` (§4.10).
            <div aria-busy="true">
              <p role="status" className="sr-only">
                Loading your account details
              </p>
              <AccountBodySkeleton />
            </div>
          ) : null}
          <div
            ref={profileWidgetRef}
            aria-hidden={!isProfilePainted}
            className={
              isProfilePainted
                ? "min-w-0"
                : "invisible pointer-events-none absolute inset-0 min-w-0"
            }
          >
            <UserProfile
              routing="hash"
              appearance={{
                variables: {
                  ...clerkColors,
                  borderRadius: "0.625rem",
                },
                elements: {
                  // `clerk-themed` hands text colour back to the app's tokens —
                  // Clerk bakes its palette into generated classes and honours
                  // neither `baseTheme` nor `variables` here, so in dark mode its
                  // near-black type sat on our dark card. Rule lives in
                  // globals.css, scoped to this class so it cannot leak.
                  //
                  // `!w-full`: Clerk gives the root `width: fit-content`
                  // (`InvisibleRootBox`), so without `!` the widget shrank to
                  // its widest row and grew whenever an inline editor with a
                  // long sentence opened, dragging "Update profile" and every
                  // right-aligned control sideways.
                  rootBox: "!w-full clerk-themed",
                  // Clerk sizes this card for a modal: 55rem wide, a fixed 44rem
                  // tall around an inner scroller, and capped at
                  // `calc(100vw - 2rem)` — wider than our padded Panel on a
                  // phone. In a page the Panel sets the width and the page
                  // itself scrolls (§13.3).
                  //
                  // `!overflow-visible` here and on `scrollBox`: both are
                  // `overflow: hidden` in Clerk, which only served the inner
                  // scroller and phone drawer we removed. With our zero
                  // padding they trimmed the bold "P" of "Profile details",
                  // whose glyph overhangs its box. Our wrapper's
                  // `overflow-x-clip` is the one sideways guard.
                  cardBox:
                    "!w-full !max-w-full !h-auto !overflow-visible !shadow-none !border-0 !bg-transparent",
                  card: "!w-full !shadow-none !border-0 !bg-transparent",
                  // Both of Clerk's navs — the desktop rail and the phone
                  // hamburger drawer — give way to `AccountSectionRail`.
                  navbar: "!hidden",
                  navbarMobileMenuRow: "!hidden",
                  // Clerk draws this as a second card: an opaque fill, a 1px
                  // border and -1px margins, which read as a clipped edge just
                  // inside the Panel. The Panel is the only surface.
                  scrollBox:
                    "!m-0 !overflow-visible !border-0 !bg-transparent !shadow-none !rounded-none",
                  // No second scroll area inside the page.
                  pageScrollBox:
                    "!p-0 !h-auto !overflow-visible ![scrollbar-gutter:auto]",
                  // Clerk pads each page as if it were a standalone card; the
                  // Panel already does, so the inset doubled.
                  profilePageContent: "!p-0",
                  // An inline editor (Update profile, Add email…) is a card
                  // nested in the Panel: tier 2 (§3.1), no shadow.
                  actionCard:
                    "!rounded-2xl !border !border-border/60 !bg-card !shadow-none",
                  // Clerk keeps names, emails and account ids to one truncated
                  // line, which cut them off on phones. Let them wrap instead.
                  userPreviewMainIdentifierText:
                    "!whitespace-normal ![overflow-wrap:anywhere]",
                  userPreviewSecondaryIdentifier:
                    "!whitespace-normal ![overflow-wrap:anywhere]",
                  // The email text has no hook of its own; reach it via its row.
                  profileSectionItem:
                    "[&_p]:!whitespace-normal [&_p]:![overflow-wrap:anywhere]",
                  // Avatars beside a name drop below `sm` (§13.4).
                  userPreviewAvatarContainer: "max-sm:!hidden",
                  // DS-CTL-02: muted, borderless, rounded fields.
                  formFieldInput:
                    "!rounded-full !border-0 !bg-muted/60 !shadow-none focus-visible:!bg-background",
                  // The phone field is a bordered box around a country picker
                  // and an input; the box takes the field material instead, and
                  // the input inside it goes clear so it isn't tinted twice.
                  phoneInputBox:
                    "!rounded-full !border-0 !bg-muted/60 !shadow-none focus-within:!bg-background [&_input]:!bg-transparent",
                  // A pill like every other button (§4), and like Cancel beside it.
                  // The row they sit in is centred in globals.css (no hook here).
                  formButtonPrimary:
                    "!rounded-full !bg-foreground hover:!bg-foreground/90 !text-background !border-0 !shadow-none normal-case text-sm font-medium",
                  formButtonReset:
                    "!rounded-full !border-0 !bg-muted/60 !text-foreground !shadow-none",
                  // "Update profile", "+ Add email address", "+ Connect account":
                  // Clerk's ghost buttons turn brand blue on hover and while
                  // their menu is open, which `.clerk-themed`'s `inherit` loses
                  // to. Actions are neutral (§3.5).
                  profileSectionPrimaryButton: "!rounded-full !text-foreground",
                  badge:
                    "!rounded-full !border-0 !bg-muted/60 !text-xs !font-medium",
                  // Clerk draws a rule under every section; §5.5 bans them.
                  //
                  // The content column is capped — 28rem, 24rem on laptops
                  // (`lg`) — so a row's control ("Update profile", "⋯") sits
                  // near its text rather than at the far edge of a full-width
                  // panel. The cap is fixed, so an
                  // opening editor can't move it. Clerk lays the row out
                  // `row-reverse` (title on the left from 62em up), where
                  // `flex-start` is the RIGHT edge; `justify-end` packs
                  // title + column from the left instead. Stacked below 62em,
                  // it has no effect.
                  profileSection: "!border-0 !justify-end",
                  profileSectionContent: "!border-0 !max-w-md lg:!max-w-sm",
                  accordionTriggerButton: "!rounded-full",
                  // "Secured by Clerk". Clerk re-shows it below 768px with a
                  // media query, which a plain `hidden` loses to.
                  footer: "!hidden",
                },
              }}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}
