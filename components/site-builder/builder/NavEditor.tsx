"use client";

import { GripVertical, Link2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { UpdateSiteNav } from "@/app/dashboard/website/actions/site";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  isExternalHref,
  MAX_NAV_ITEMS,
  moveNavItem,
  normalizeNavPath,
  type NavItem,
} from "@/lib/site-builder/nav";
import { cn } from "@/lib/utils";
import { announce } from "./announce";

/**
 * The site navigation, edited from the header section.
 *
 * **This is the panel that makes a published page reachable.** `merchant_sites.nav`
 * had a reader in the public renderer and a complete, tested writer in
 * `lib/site-builder/nav.ts`, and nothing in between: no screen wrote the column.
 * A merchant could build a page, publish it, watch it go live at its own address
 * and have no visitor ever find it, because the header rendered whatever was in
 * a jsonb column that stayed `{"items":[]}` forever.
 *
 * Reached from the header block's pencil, which is where Owner.com puts it and
 * is a genuinely surprising place until you see the alternative: a separate
 * "Navigation" screen turns a two-second edit into a trip out of the editor and
 * back. The banner is what makes it safe — you arrived at a site-wide setting by
 * clicking a section on one page, and you have to be told.
 *
 * **Drag is deliberate here and nowhere else.** Sections reorder with buttons,
 * because a page is long and a drag across a scrolling canvas is miserable. A
 * nav is short, flat and entirely about order, so it gets handles. That is a
 * considered split rather than an inconsistency — and every drag has a
 * keyboard-reachable equivalent in the row's ⋯ menu.
 */

/** A page, as much of one as the navigation editor needs. */
export interface NavPageOption {
  title: string;
  path: string;
  isHome: boolean;
  isPublished: boolean;
}

export interface NavDraft {
  items: NavItem[];
  setItems: (items: NavItem[]) => void;
  dirty: boolean;
  saving: boolean;
  save: () => Promise<void>;
}

/**
 * The unsaved navigation, held apart from the page draft.
 *
 * Navigation is site-wide and saves on its own, so it deliberately does not go
 * through the builder's autosave: a merchant reordering their links is changing
 * every page at once, and that is worth an explicit button. Lives in a hook so
 * the rail's pinned footer can carry the button while the panel carries the
 * list.
 */
export function useNavDraft({
  siteId,
  clerkOrgId,
  initialItems,
}: {
  siteId: string;
  clerkOrgId: string;
  initialItems: NavItem[];
}): NavDraft {
  const [items, setItems] = useState<NavItem[]>(initialItems);
  const [saving, setSaving] = useState(false);
  const [savedItems, setSavedItems] = useState<NavItem[]>(initialItems);

  const save = async () => {
    setSaving(true);
    try {
      const result = await UpdateSiteNav(clerkOrgId, siteId, items);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSavedItems(items);
      toast.success("Navigation updated on every page.");
    } finally {
      setSaving(false);
    }
  };

  return {
    items,
    setItems,
    dirty: !sameItems(items, savedItems),
    saving,
    save,
  };
}

/**
 * The rail's pinned button for the header section.
 *
 * Saves the navigation *and* closes, so a merchant who arranges their links and
 * presses the obvious button does not lose the work. When there is nothing to
 * save it is an ordinary Done, which is what it looks like from the moment the
 * panel opens.
 */
export function NavDoneButton({ draft, onClose }: { draft: NavDraft; onClose: () => void }) {
  return (
    <Button
      className="w-full"
      disabled={draft.saving}
      onClick={async () => {
        if (draft.dirty) await draft.save();
        onClose();
      }}
    >
      {draft.saving ? "Saving…" : draft.dirty ? "Save navigation" : "Done"}
    </Button>
  );
}

export default function NavEditor({
  draft,
  pages,
}: {
  draft: NavDraft;
  /** Pages that can be linked to, for the ⊕ Page button. */
  pages: NavPageOption[];
}) {
  const { items, setItems } = draft;
  const [editing, setEditing] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const full = items.length >= MAX_NAV_ITEMS;

  /** Pages not already linked. A page listed twice is a mistake, not a choice. */
  const linkable = pages.filter(
    (page) =>
      !page.isHome &&
      !items.some(
        (item) =>
          item.path !== undefined && normalizeNavPath(item.path) === normalizeNavPath(page.path),
      ),
  );

  const move = (index: number, direction: -1 | 1) => {
    const next = moveNavItem(items, index, direction);
    if (next === items) return;
    setItems(next);
    announce(`${items[index].label} moved ${direction === -1 ? "up" : "down"}.`);
  };

  /** Drop `dragIndex` at `to`, the one place in the builder that uses drag. */
  const drop = (to: number) => {
    if (dragIndex === null || dragIndex === to) return;
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(to, 0, moved);
    setItems(next);
    setDragIndex(null);
    announce(`${moved.label} moved to position ${to + 1}.`);
  };

  return (
    <div className="space-y-4 p-4">
      <p className="rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
        Changes to the navigation affect{" "}
        <strong className="font-medium text-foreground">all pages</strong>, and go live as soon as
        you save them — they are not part of this page&rsquo;s draft.
      </p>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs font-medium">Link order</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {items.length}/{MAX_NAV_ITEMS}
          </span>
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Links that don&rsquo;t fit fall into a &ldquo;More&rdquo; menu.
        </p>

        {items.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-[11px] text-muted-foreground">
            No links yet. Visitors can only reach your home page.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item, index) =>
              editing === index ? (
                <li key={`edit-${index}`}>
                  <NavItemForm
                    item={item}
                    pages={pages}
                    onCancel={() => {
                      // The ⊕ Link button appends a blank row and opens it, so
                      // cancelling out of one has to take the row with it —
                      // otherwise the list shows an unlabelled link that
                      // `serializeNav` would silently drop on save.
                      if (!item.label.trim()) setItems(items.filter((_, i) => i !== index));
                      setEditing(null);
                    }}
                    onSave={(next) => {
                      setItems(items.map((existing, i) => (i === index ? next : existing)));
                      setEditing(null);
                    }}
                  />
                </li>
              ) : (
                <li
                  key={`${item.label}-${index}`}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => drop(index)}
                  onDragEnd={() => setDragIndex(null)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border bg-background px-2 py-2 transition-opacity",
                    dragIndex === index && "opacity-40",
                  )}
                >
                  <GripVertical
                    aria-hidden
                    className="size-3.5 shrink-0 cursor-grab text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{item.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {item.href !== undefined
                        ? item.href
                        : `Page · /${normalizeNavPath(item.path ?? "")}`}
                    </span>
                  </span>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Options for ${item.label}`}
                      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onSelect={() => setEditing(index)}>Edit</DropdownMenuItem>
                      {/* Keyboard and screen-reader equivalent for the drag handle. */}
                      <DropdownMenuItem disabled={index === 0} onSelect={() => move(index, -1)}>
                        Move up
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={index === items.length - 1}
                        onSelect={() => move(index, 1)}
                      >
                        Move down
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => {
                          setItems(items.filter((_, i) => i !== index));
                          announce(`${item.label} removed from the navigation.`);
                        }}
                      >
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {editing === null && (
        <div className="grid grid-cols-2 gap-2">
          <AddPageMenu
            disabled={full || linkable.length === 0}
            pages={linkable}
            onPick={(page) => {
              setItems([...items, { label: page.title, path: normalizeNavPath(page.path) }]);
              announce(`${page.title} added to the navigation.`);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={full}
            className="h-auto flex-col gap-1 py-3 text-[11px]"
            onClick={() => {
              setItems([...items, { label: "", href: "" }]);
              setEditing(items.length);
            }}
          >
            <Link2 className="size-4" />
            Link
          </Button>
        </div>
      )}

      {full && (
        <p className="text-[11px] text-muted-foreground">
          That is as many links as the header can lay out. Remove one to add another.
        </p>
      )}
    </div>
  );
}

/** ⊕ Page — an internal link, chosen from the pages that exist. */
function AddPageMenu({
  pages,
  disabled,
  onPick,
}: {
  pages: { title: string; path: string; isPublished: boolean }[];
  disabled: boolean;
  onPick: (page: { title: string; path: string }) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-auto flex-col gap-1 py-3 text-[11px]"
        >
          <Plus className="size-4" />
          Page
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {pages.map((page) => (
          <DropdownMenuItem key={page.path} onSelect={() => onPick(page)}>
            <span className="min-w-0 flex-1 truncate">{page.title}</span>
            {/* An unpublished page can be linked — the merchant may be about to
                publish it — but they should know the link 404s until they do. */}
            {!page.isPublished && (
              <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">Not live</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The inline editor for one link — label, and where it points. */
function NavItemForm({
  item,
  pages,
  onSave,
  onCancel,
}: {
  item: NavItem;
  pages: { title: string; path: string; isHome: boolean }[];
  onSave: (item: NavItem) => void;
  onCancel: () => void;
}) {
  const external = item.href !== undefined;
  const [label, setLabel] = useState(item.label);
  const [href, setHref] = useState(item.href ?? "");
  const [path, setPath] = useState(normalizeNavPath(item.path ?? ""));

  const valid = label.trim().length > 0 && (external ? isExternalHref(href) : true);

  return (
    <div className="space-y-2.5 rounded-md border bg-muted/30 p-3">
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium">Label</span>
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={40}
          className={fieldClass}
        />
      </label>

      {external ? (
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium">Web address</span>
          <input
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="https://example.com"
            className={cn(fieldClass, "font-mono")}
          />
          {href.trim() !== "" && !isExternalHref(href) && (
            <span className="mt-1 block text-[11px] text-destructive">
              Start with http:// or https://
            </span>
          )}
        </label>
      ) : (
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium">Page</span>
          <select value={path} onChange={(e) => setPath(e.target.value)} className={fieldClass}>
            {pages.map((page) => (
              <option key={page.path} value={normalizeNavPath(page.path)}>
                {page.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-7 flex-1 text-[11px]"
          disabled={!valid}
          onClick={() =>
            onSave(
              external
                ? { label: label.trim(), href: href.trim() }
                : { label: label.trim(), path: normalizeNavPath(path) },
            )
          }
        >
          Done
        </Button>
        <Button size="sm" variant="ghost" className="h-7 flex-1 text-[11px]" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Order and destination both matter, so compare positionally. */
function sameItems(a: NavItem[], b: NavItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, i) => {
    const other = b[i];
    return (
      item.label === other.label &&
      (item.href ?? null) === (other.href ?? null) &&
      normalizeNavPath(item.path ?? "") === normalizeNavPath(other.path ?? "")
    );
  });
}

const fieldClass =
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
