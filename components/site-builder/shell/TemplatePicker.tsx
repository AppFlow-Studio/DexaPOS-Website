"use client";

import { CircleCheck, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { OverlayRail, OverlayStage } from "./OverlayChrome";

export interface TemplateOption {
  id: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Choosing a starting point, with the starting point on screen.
 *
 * The rail lists the options and the stage renders the selected one **as the
 * real thing** — not a thumbnail, not an illustration. That is the whole design:
 * "what is a Showcase page" is a question you answer by looking, and a picker
 * that answers it with a sentence is asking the merchant to imagine instead.
 *
 * It is deliberately ignorant of what it is picking. New Page and New Form are
 * the same problem — a short list, a live preview, one commit — so they are the
 * same component with different options and a different preview.
 */
export default function TemplatePicker({
  title = "Select a template",
  description,
  options,
  selectedId,
  onSelect,
  preview,
  children,
}: {
  title?: string;
  description?: string;
  options: TemplateOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  preview: React.ReactNode;
  /** Anything the caller needs above the template list — a name field, usually. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0">
      <OverlayRail>
        <div className="p-4">
          {children}
          <p className="text-xs font-semibold">{title}</p>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          )}

          <div
            role="radiogroup"
            aria-label={title}
            className="mt-4 space-y-2"
          >
            {options.map(({ id, label, icon: Icon }) => {
              const selected = id === selectedId;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onSelect(id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    selected
                      ? "border-primary/40 bg-accent font-medium"
                      : "hover:border-foreground/25 hover:bg-accent/40",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {selected && <CircleCheck className="size-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      </OverlayRail>

      <OverlayStage>
        <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5">
          {preview}
        </div>
      </OverlayStage>
    </div>
  );
}
