"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import type { LucideIcon } from "lucide-react";

export interface BottomNavTab {
  id: string;
  label: string;
  icon: LucideIcon;
  url: string;
}

export interface MoreNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

interface MobileBottomNavProps {
  tabs: BottomNavTab[];
  moreItems: MoreNavItem[];
}

export function MobileBottomNav({ tabs, moreItems }: MobileBottomNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const { signOut } = useClerk();
  const { user } = useUser();

  // Closing the sheet and navigating happen in the same tick, and Radix
  // restores focus to the trigger as it closes. If that focus lands while the
  // tap is still resolving, the trigger re-fires and the sheet springs back
  // open. `closingUntil` swallows any trigger activation for a moment after a
  // close so the restored focus cannot reopen it.
  const closingUntil = useRef(0);

  const closeMore = () => {
    closingUntil.current = Date.now() + 400;
    setMoreOpen(false);
  };

  // Navigation is the authoritative "the link was followed" signal — more
  // reliable than the link's own onClick, which can be pre-empted by the
  // close animation. Closing here is conditional on the sheet actually being
  // open: arming the guard on every route change would swallow a legitimate
  // "More" tap right after navigating via one of the bottom tabs.
  useEffect(() => {
    setMoreOpen((open) => {
      if (open) closingUntil.current = Date.now() + 400;
      return false;
    });
  }, [pathname]);

  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Account";
  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-background/95 backdrop-blur-md border-t"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-stretch justify-around">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive =
              tab.url === pathname ||
              (tab.url !== "/" && pathname.startsWith(tab.url + "/"));

            return (
              <Link
                key={tab.id}
                href={tab.url}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 pt-2 pb-1 flex-1 min-h-[56px] transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium leading-tight">
                  {tab.label}
                </span>
              </Link>
            );
          })}

          {moreItems.length > 0 && (
            <button
              onClick={() => {
                if (Date.now() < closingUntil.current) return;
                setMoreOpen(true);
              }}
              className="flex flex-col items-center justify-center gap-0.5 pt-2 pb-1 flex-1 min-h-[56px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
              <span className="text-[10px] font-medium leading-tight">More</span>
            </button>
          )}
        </div>
      </nav>

      <Sheet
        open={moreOpen}
        onOpenChange={(open) => (open ? setMoreOpen(true) : closeMore())}
      >
        <SheetContent side="bottom" className="h-[70vh] overflow-y-auto">
          <SheetHeader className="pb-2">
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1">
            {moreItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.url === pathname ||
                (item.url !== "/" && pathname.startsWith(item.url + "/"));

              return (
                <Link
                  key={item.url}
                  href={item.url}
                  onClick={closeMore}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </nav>

          <Separator className="my-3" />

          <div className="px-3 py-2 space-y-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{displayName}</p>
              {email && email !== displayName && (
                <p className="text-xs text-muted-foreground truncate">{email}</p>
              )}
            </div>
            <button
              onClick={() => void signOut({ redirectUrl: "/" })}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
