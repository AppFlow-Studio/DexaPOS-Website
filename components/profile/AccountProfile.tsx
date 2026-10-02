"use client";

import { useEffect, useRef, useState } from "react";
import { UserProfile, useUser } from "@clerk/nextjs";
import { useIsDarkTheme } from "@/app/sign-in/clerk-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/dashboard/shell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AccountPanelSkeleton,
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

/**
 * Clerk's account UI in a tier 1 panel. The Panel owns the surface, so Clerk's
 * own card is stripped bare — otherwise it renders a second bordered, shadowed
 * box inside ours. Its inputs are restyled to the DS-CTL-02 material (muted,
 * borderless, rounded) since Clerk ships bordered fields.
 *
 * `!` throughout because Clerk injects its styles at runtime with higher
 * specificity than a plain utility class — the same failure the sign-in
 * Continue button hit.
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
      <div className="relative min-w-0">
        {!isProfilePainted ? (
          // The same blocks as the route's `loading.tsx` (§4.10).
          <div aria-busy="true">
            <p role="status" className="sr-only">
              Loading your account details
            </p>
            <AccountPanelSkeleton />
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
                rootBox: "w-full clerk-themed",
                cardBox: "w-full !shadow-none !border-0 !bg-transparent",
                card: "w-full !shadow-none !border-0 !bg-transparent",
                navbar: "!border-0 !bg-transparent",
                // §5.5 — no dividing lines anywhere.
                navbarMobileMenuRow: "!border-0",
                // Clerk paints this opaque white, so it ignores the dark palette
                // and reads as a second card sitting inside the Panel.
                scrollBox: "!bg-transparent !shadow-none !rounded-none",
                pageScrollBox: "!p-0",
                // DS-CTL-02: muted, borderless, rounded fields.
                formFieldInput:
                  "!rounded-full !border-0 !bg-muted/60 !shadow-none focus-visible:!bg-background",
                // A pill like every other button (§4), and like Cancel beside it.
                formButtonPrimary:
                  "!rounded-full !bg-foreground hover:!bg-foreground/90 !text-background !border-0 !shadow-none normal-case text-sm font-medium",
                formButtonReset:
                  "!rounded-full !border-0 !bg-muted/60 !text-foreground !shadow-none",
                profileSectionPrimaryButton: "!rounded-full",
                badge:
                  "!rounded-full !border-0 !bg-muted/60 !text-xs !font-medium",
                // Clerk draws a rule under every section; §5.5 bans them.
                profileSection: "!border-0",
                profileSectionContent: "!border-0",
                accordionTriggerButton: "!rounded-full",
                // Clerk tints the active item with a hardcoded black alpha that
                // does not track the theme; use the muted token instead.
                navbarButton:
                  "!rounded-full !text-muted-foreground hover:!bg-muted/60 hover:!text-foreground",
                // The DS-CTL-05 active pill (§4.5). Clerk adds this class on
                // top of `navbarButton`, whose `!` colour would otherwise win:
                // `[&&]` doubles the selector so these outrank it, hover included.
                navbarButton__active:
                  "[&&]:!bg-background [&&]:!text-foreground [&&]:!shadow-sm [&&]:!ring-1 [&&]:!ring-border",
                footer: "hidden",
              },
            }}
          />
        </div>
      </div>
    </Panel>
  );
}
