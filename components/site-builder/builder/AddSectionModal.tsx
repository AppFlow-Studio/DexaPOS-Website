"use client";

import { CornerDownLeft } from "lucide-react";
import { useMemo } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { addableKindsByCategory, SECTION_REGISTRY } from "@/lib/site-builder/sections/registry";
import { SectionIcon } from "./section-icons";
import type { BuilderStore } from "./store";

/**
 * Choosing a section to add.
 *
 * Driven entirely by the registry: `addable` decides what appears, which is why
 * header / hero / footer are absent without any list to maintain, and why
 * section kind #10 shows up automatically with its icon, description and group.
 *
 * **Grouped, not a flat grid.** Nine choices scan fine as a grid; the spec's
 * seventeen do not, and the groups cost one field on the registry entry. They
 * are named for what a restaurant owner is trying to do — "Menu", "Your story",
 * "Visit us" — rather than for what the section technically is.
 *
 * **Position is never asked for.** The modal is opened from a zone's own button
 * or from a `+` in the gap between two sections, and inherits the index from
 * wherever it was opened. A modal that has to ask "and where should this go?"
 * has taken a decision the merchant already made and handed it back to them.
 */
export default function AddSectionModal({ store }: { store: BuilderStore }) {
  const open = store((s) => s.addOpen);
  const closeAddSection = store((s) => s.closeAddSection);
  const addSection = store((s) => s.addSection);

  const groups = useMemo(() => addableKindsByCategory(), []);

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeAddSection();
      }}
    >
      <CommandInput placeholder="Search sections…" />

      <CommandList className="max-h-[60vh]">
        <CommandEmpty className="py-10 text-center text-sm text-muted-foreground">
          No sections match.
        </CommandEmpty>

        {groups.map((group) => (
          <CommandGroup key={group.id} heading={group.label}>
            {group.kinds.map((kind) => {
              const def = SECTION_REGISTRY[kind];
              return (
                <CommandItem
                  key={kind}
                  // Searched text, not the displayed text: a merchant typing
                  // "price" should find Popular Items through its description.
                  value={`${def.label} ${def.description}`}
                  onSelect={() => addSection(kind)}
                  className="gap-3"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                    <SectionIcon name={def.icon} className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{def.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {def.description}
                    </span>
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>

      <div className="flex items-center justify-end gap-1.5 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <CornerDownLeft className="size-3" />
        <span>to add</span>
      </div>
    </CommandDialog>
  );
}
