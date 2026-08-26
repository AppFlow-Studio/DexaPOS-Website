"use client";

import { UserProfile } from "@clerk/nextjs";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useIsDarkTheme } from "@/app/sign-in/clerk-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageShell, PageHeader, Panel } from "@/components/dashboard/shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfilePage() {
  const { data: userInfo, isLoading } = useUserInfo();
  const isDark = useIsDarkTheme();

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
    <PageShell width="narrow">
      <PageHeader
        title="My Profile"
        subtitle="Manage your account information and preferences"
      />

      {/* Identity summary — tier 1 panel, not a <Card> (C6/§3.1). */}
      <Panel padded>
        <div className="flex items-center gap-4">
          {isLoading ? (
            <>
              <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            </>
          ) : userInfo && !(userInfo instanceof Error) ? (
            <>
              <Avatar className="h-16 w-16 shrink-0">
                <AvatarImage
                  src={userInfo.avatar_url}
                  alt={userInfo.first_name}
                />
                <AvatarFallback className="text-lg">
                  {userInfo.first_name?.charAt(0)}
                  {userInfo.last_name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-1">
                <h2 className="truncate text-[1.0625rem] font-semibold">
                  {userInfo.first_name} {userInfo.last_name}
                </h2>
                <p className="truncate text-sm text-muted-foreground">
                  {userInfo.email}
                </p>
                {userInfo.members && userInfo.members.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {/* Neutral pill per §4.6b — an org name is a label, not a
                        status, so it never carries its own colour. */}
                    {userInfo.members.map((member: any) => (
                      <span
                        key={member.id}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium"
                      >
                        {member.organizations?.name ||
                          member.organizations?.merchants?.name ||
                          "Organization"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </Panel>

      {/* Clerk's account UI. The Panel owns the surface, so Clerk's own card is
          stripped bare — otherwise it renders a second bordered, shadowed box
          inside ours. Its inputs are restyled to the DS-CTL-02 material
          (muted, borderless, rounded) since Clerk ships bordered fields.

          `!` throughout because Clerk injects its styles at runtime with higher
          specificity than a plain utility class — the same failure the sign-in
          Continue button hit. Kept inline in this `.tsx` rather than extracted
          to a constants module so Tailwind is guaranteed to scan every class
          (C7): a class living only in a `.ts` file generates no CSS rule. */}
      <Panel padded>
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
              formButtonPrimary:
                "!bg-foreground hover:!bg-foreground/90 !text-background !border-0 !shadow-none normal-case text-sm font-medium",
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
              footer: "hidden",
            },
          }}
        />
      </Panel>
    </PageShell>
  );
}
