"use client";

import { CircleCheck, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SectionKind } from "@/lib/site-builder/sections/kinds";
import {
  availableKinds,
  kindsAwaitingFeature,
  SECTION_REGISTRY,
} from "@/lib/site-builder/sections/registry";
import { cn } from "@/lib/utils";
import { websiteRoutes } from "../routes";
import { announce } from "./announce";
import { SectionIcon } from "./section-icons";
import type { BuilderStore } from "./store";

/**
 * Choosing a section to add.
 *
 * Still driven entirely by the registry — `addable` decides what appears, which
 * is why header, hero and footer are absent without a list to maintain — but it
 * is a plain two-column grid now rather than a gallery. Gone: the search box,
 * the category headings, the per-kind descriptions, the wireframe thumbnails and
 * the "Recommended" badges computed from what the page was missing.
 *
 * All of that was defensible and it added up to a dialog that took a moment to
 * read. With nine kinds, a merchant recognises the one they want by name faster
 * than they can parse a card. If the list ever reaches twenty, the search box
 * earns its place back.
 *
 * **Choosing is two steps — pick, then `Add`.** That is what lets the dialog
 * avoid asking *where*: position came from wherever the merchant opened it, and
 * a single-click grid would commit before they could change their mind.
 */
export default function AddSectionModal({ store }: { store: BuilderStore }) {
  const open = store((s) => s.addOpen);
  const closeAddSection = store((s) => s.closeAddSection);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeAddSection();
      }}
    >
      {/* The grid exists only while the dialog is open, so every open starts
          from no selection without an effect reaching in to reset one. */}
      {open && <SectionGrid store={store} />}
    </Dialog>
  );
}

function SectionGrid({ store }: { store: BuilderStore }) {
  const doc = store((s) => s.doc);
  const addSection = store((s) => s.addSection);
  const locationId = store((s) => s.locationId);

  const features = store((s) => s.features);

  // Feature-gated kinds are ABSENT, not disabled. The alternative — a greyed
  // row per kind — turns the catalogue into a list of things this restaurant
  // does not have, which is the opposite of what a merchant opened it for.
  // What they lose is the answer to "where did Reviews go", and that is what
  // the line beneath the grid is for.
  const kinds = availableKinds(features);
  const awaiting = kindsAwaitingFeature(features);
  const present = new Set(doc.sections.map((section) => section.kind));

  /*
    Nothing is chosen to begin with.

    This used to preselect the first available kind, which was always Content —
    so a merchant who opened the modal and clicked `Add` without reading it got
    a Content section they had not asked for, and the highlighted row made it
    look like the product had recommended one. `Add` stays disabled until they
    say what they want.
  */
  const [chosen, setChosen] = useState<SectionKind | undefined>(undefined);

  const add = () => {
    if (!chosen) return;
    addSection(chosen);
    announce(`${SECTION_REGISTRY[chosen].label} section added.`);
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Add Section</DialogTitle>
      </DialogHeader>

      {/* A real radiogroup. The rows already carried `role="radio"` and
          `aria-checked`, which is invalid ARIA without an owning group — a
          screen reader announced eleven unrelated radios with no set. */}
      <div
        role="radiogroup"
        aria-label="Section type"
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {kinds.map((kind) => (
          <SectionRow
            key={kind}
            kind={kind}
            selected={kind === chosen}
            present={present.has(kind)}
            onSelect={() => setChosen(kind)}
          />
        ))}
      </div>

      {awaiting.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {awaiting.map(({ feature, featureLabel, kinds: hidden }) => (
            <span key={feature} className="block">
              {listLabels(hidden)} appear here once{" "}
              <strong className="font-medium text-foreground">{featureLabel}</strong> is on in{" "}
              <Link
                href={websiteRoutes.settings(locationId ?? undefined)}
                className="underline underline-offset-2 hover:text-foreground"
              >
                website settings
              </Link>
              .
            </span>
          ))}
        </p>
      )}

      <DialogFooter>
        <Button disabled={!chosen} onClick={add}>
          Add
          <Plus className="size-4" />
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** A singleton already on the page, or a kind whose dependency does not exist. */
function isBlocked(kind: SectionKind, present: Set<SectionKind>): boolean {
  const def = SECTION_REGISTRY[kind];
  return (def.singleton && present.has(kind)) || !!def.unavailable;
}

function SectionRow({
  kind,
  selected,
  present,
  onSelect,
}: {
  kind: SectionKind;
  selected: boolean;
  present: boolean;
  onSelect: () => void;
}) {
  const def = SECTION_REGISTRY[kind];
  const placed = def.singleton && present;
  const blocked = placed || !!def.unavailable;

  // Two different reasons a row can be inert, and they need different words. A
  // singleton already placed is a rule the merchant can learn; a kind whose
  // dependency does not exist yet is a promise the product cannot keep.
  const reason = placed
    ? `Your page already has a ${def.label.toLowerCase()} section.`
    : def.unavailable;

  const row = (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      /*
        The row's own text is its accessible name inside a group already labelled
        "Section type" — which is both correct ARIA and better than what was
        here: a template that read "Add a Events section" and "Add a
        Integrations section". A blocked row still needs its reason spoken,
        since the tooltip carrying it is not reachable by keyboard.
      */
      aria-label={reason ? `${def.label} — ${reason}` : undefined}
      disabled={blocked}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        blocked && "cursor-not-allowed opacity-50",
        !blocked && selected && "border-primary/40 bg-accent font-medium",
        !blocked && !selected && "hover:border-foreground/25 hover:bg-accent/40",
      )}
    >
      <SectionIcon name={def.icon} className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{def.label}</span>
      {/* Why the row is inert, on the row. It used to live only in the
          `aria-label` and in a tooltip, so a sighted merchant saw a greyed row
          with no explanation and read it as broken. */}
      {blocked && (
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
          {placed ? "Added" : "Soon"}
        </span>
      )}
      {!blocked && selected && <CircleCheck className="size-4 shrink-0 text-primary" />}
    </button>
  );

  // A disabled row cannot explain itself on hover without a wrapper, and a
  // merchant who cannot see why something is greyed out assumes it is broken.
  if (!reason) return row;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block">{row}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-56">{reason}</TooltipContent>
    </Tooltip>
  );
}

/** "Reviews", or "Reviews and Reservations" — never a bare comma-separated list of two. */
function listLabels(kinds: SectionKind[]): string {
  const labels = kinds.map((kind) => `${SECTION_REGISTRY[kind].label} sections`);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}
