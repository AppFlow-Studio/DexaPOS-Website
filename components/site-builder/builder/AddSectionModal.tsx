"use client";

import { Check, Clock, Search, Sparkles, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SECTION_CATEGORIES, type SectionKind } from "@/lib/site-builder/sections/kinds";
import { addableKindsByCategory, SECTION_REGISTRY } from "@/lib/site-builder/sections/registry";
import { cn } from "@/lib/utils";
import { announce } from "./announce";
import SectionThumbnail from "./SectionThumbnail";
import type { BuilderStore } from "./store";

/**
 * Choosing a section to add.
 *
 * Still driven entirely by the registry — `addable` decides what appears, which
 * is why header / hero / footer are absent without a list to maintain — but it
 * is a gallery rather than a command list now. The previous version described
 * each section in a sentence and asked the merchant to picture it; every card
 * here shows the shape the section takes on the page, which is the question
 * "what is a Features section" answered before it is asked.
 *
 * **Position is never asked for.** The dialog is opened from a zone's own button
 * or from a `+` in a gap on the canvas, and inherits the index from wherever it
 * was opened. A dialog that has to ask "and where should this go?" has taken a
 * decision the merchant already made and handed it back to them.
 *
 * **Recommendations are about this page, not about popularity.** A section is
 * recommended when the page is missing something guests reliably look for; once
 * it is there the badge goes away rather than nagging.
 */

/** What a restaurant page needs before it is genuinely useful to a guest. */
const PAGE_ESSENTIALS: { kind: SectionKind; because: string }[] = [
  { kind: "popular-items", because: "Guests look for the food first" },
  { kind: "location", because: "Guests need to find you" },
  { kind: "content", because: "Tell guests who you are" },
];

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
      {/* The gallery — and therefore its search box — exists only while the
          dialog is open, so every open starts from an empty query without an
          effect reaching in to reset one. */}
      {open && <SectionGallery store={store} />}
    </Dialog>
  );
}

function SectionGallery({ store }: { store: BuilderStore }) {
  const addSection = store((s) => s.addSection);
  const doc = store((s) => s.doc);

  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => addableKindsByCategory(), []);
  const presentKinds = useMemo(
    () => new Set(doc.sections.map((section) => section.kind)),
    [doc.sections],
  );

  const term = query.trim().toLowerCase();
  const matches = (kind: SectionKind) => {
    if (!term) return true;
    const def = SECTION_REGISTRY[kind];
    return (
      def.label.toLowerCase().includes(term) || def.description.toLowerCase().includes(term)
    );
  };

  const visibleGroups = groups
    .map((group) => ({ ...group, kinds: group.kinds.filter(matches) }))
    .filter((group) => group.kinds.length > 0);

  const totalVisible = visibleGroups.reduce((sum, group) => sum + group.kinds.length, 0);

  const choose = (kind: SectionKind) => {
    addSection(kind);
    announce(`${SECTION_REGISTRY[kind].label} section added.`);
  };

  return (
    <DialogContent
      className="flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        searchRef.current?.focus();
      }}
    >
        <DialogHeader className="space-y-3 border-b px-5 py-4">
          <div>
            <DialogTitle>Add a section</DialogTitle>
            <DialogDescription>
              Sections stack down the page. You can reorder or remove any of them later.
            </DialogDescription>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search sections…"
              aria-label="Search sections"
              className="h-10 w-full rounded-md border border-input bg-transparent pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {totalVisible === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No sections match “{query}”.
            </p>
          ) : (
            visibleGroups.map((group) => (
              <section key={group.id} className="mb-6 last:mb-1">
                <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {categoryLabel(group.id) ?? group.label}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.kinds.map((kind) => (
                    <SectionCard
                      key={kind}
                      kind={kind}
                      alreadyOnPage={presentKinds.has(kind)}
                      onChoose={() => choose(kind)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
      </div>
    </DialogContent>
  );
}

function SectionCard({
  kind,
  alreadyOnPage,
  onChoose,
}: {
  kind: SectionKind;
  alreadyOnPage: boolean;
  onChoose: () => void;
}) {
  const def = SECTION_REGISTRY[kind];

  // Two different reasons a card can be inert, and they need different words.
  // A singleton that is already placed is a rule the merchant can learn; a kind
  // whose dependency does not exist yet is a promise the product cannot keep,
  // and saying which one applies is the difference between a rule and a button
  // that appears broken.
  const placed = def.singleton && alreadyOnPage;
  const blocked = placed || !!def.unavailable;
  const essential = PAGE_ESSENTIALS.find((item) => item.kind === kind);
  const recommended = !!essential && !alreadyOnPage && !def.unavailable;
  const livesOnPos = def.bindingTypes.length > 0 || def.liveFields.length > 0;

  return (
    <button
      type="button"
      disabled={blocked}
      onClick={onChoose}
      aria-label={
        placed
          ? `${def.label} — already on this page`
          : def.unavailable
            ? `${def.label} — not available yet. ${def.unavailable}`
            : `Add a ${def.label} section`
      }
      className={cn(
        "group flex flex-col gap-2.5 rounded-lg border p-3 text-left transition-all focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        blocked
          ? "cursor-not-allowed opacity-55"
          : "hover:border-foreground/25 hover:bg-accent/40 hover:shadow-sm",
      )}
    >
      <SectionThumbnail
        kind={kind}
        className={cn(!blocked && "transition-colors group-hover:text-muted-foreground/60")}
      />

      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{def.label}</span>
          {recommended && (
            <Badge variant="secondary" className="gap-0.5 px-1.5 py-0 text-[10px] font-medium">
              <Sparkles className="size-2.5" />
              Recommended
            </Badge>
          )}
          {placed && (
            <Badge variant="outline" className="gap-0.5 px-1.5 py-0 text-[10px]">
              <Check className="size-2.5" />
              On this page
            </Badge>
          )}
          {def.unavailable && !placed && (
            <Badge variant="outline" className="gap-0.5 px-1.5 py-0 text-[10px]">
              <Clock className="size-2.5" />
              Not ready yet
            </Badge>
          )}
        </span>

        <span className="text-xs leading-relaxed text-muted-foreground">
          {placed
            ? `Your page already has a ${def.label.toLowerCase()} section.`
            : (def.unavailable ?? essential?.because ?? def.description)}
        </span>

        {livesOnPos && !blocked && (
          <span className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <Zap className="size-2.5" />
            Updates from your POS
          </span>
        )}
      </span>
    </button>
  );
}

function categoryLabel(id: string): string | undefined {
  return SECTION_CATEGORIES.find((category) => category.id === id)?.label;
}
