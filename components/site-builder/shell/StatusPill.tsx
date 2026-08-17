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

export interface StatusAction {
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  onSelect: () => void;
}

/**
 * A status that is also the control for changing it.
 *
 * Collapsing "what state is this in" and "change that state" into one target is
 * the single densest idea in Owner's list screens: publishing a page is one
 * click from the list it is listed in, with no row menu to open and no editor
 * to enter.
 *
 * **Without `actions` it renders as a plain pill, not a dead button.** The home
 * page cannot be unpublished — the server refuses it — so it gets no chevron
 * and no hover affordance rather than a control that always fails.
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
  const base = "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium";

  if (!actions?.length) {
    return <span className={cn(base, TONES[tone])}>{label}</span>;
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
          >
            {action.icon}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
