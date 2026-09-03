"use client";

import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type StatusTone = "published" | "draft";

const TONES: Record<StatusTone, string> = {
  published:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
  draft: "bg-muted text-muted-foreground",
};

interface StatusActionBase {
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
}

/**
 * An entry in the pill's menu: either something that happens here, or
 * somewhere to go.
 *
 * A union rather than two optional fields, so an action carrying both — which
 * has no sensible meaning, and would silently do one of them — cannot be
 * written in the first place.
 *
 * `href` renders a real anchor rather than a handler calling `window.open`,
 * which is what lets a merchant middle-click or copy the link out of the menu.
 * Every one of these leaves the dashboard for the public site, so they open in
 * a new tab and carry `rel="noopener"`.
 */
export type StatusAction =
  | (StatusActionBase & { onSelect: () => void; href?: never })
  | (StatusActionBase & { href: string; onSelect?: never });

/**
 * A status that is also the control for changing it.
 *
 * Collapsing "what state is this in" and "change that state" into one target is
 * the single densest idea in Owner's list screens: publishing a page is one
 * click from the list it is listed in, with no row menu to open and no editor
 * to enter.
 *
 * **Without `actions` it renders as a plain pill, not a dead button.** The home
 * page cannot be unpublished — the server refuses it — so it gets no hover
 * affordance and no menu rather than a control that always fails.
 *
 * **Every pill is the same size either way.** The chevron's space is reserved
 * whether or not there is a menu, and the box has a floor width, so a column of
 * these lines up regardless of which rows can be acted on and whether the word
 * is "Published" or the longer "Unpublished". Letting the geometry vary made
 * the home row read as a different kind of thing from its neighbours when the
 * only real difference is that one menu is missing.
 */
export default function StatusPill({
  tone,
  label,
  actions,
  disabled = false,
}: {
  tone: StatusTone;
  label: string;
  actions?: StatusAction[];
  disabled?: boolean;
}) {
  const base =
    "inline-flex h-7 w-[7.25rem] items-center justify-between gap-1 rounded-md px-2.5 text-xs font-medium";

  if (!actions?.length) {
    return (
      <span className={cn(base, TONES[tone])}>
        {label}
        {/* Holds the chevron's place so an actionless pill is the same box. */}
        <ChevronDown aria-hidden className="invisible size-3" />
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(
          base,
          TONES[tone],
          "transition-opacity hover:opacity-85 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
        )}
      >
        {label}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            variant={action.destructive ? "destructive" : "default"}
            onSelect={action.onSelect}
            asChild={!!action.href}
          >
            {action.href ? (
              <a href={action.href} target="_blank" rel="noopener noreferrer">
                {action.icon}
                {action.label}
              </a>
            ) : (
              <>
                {action.icon}
                {action.label}
              </>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
