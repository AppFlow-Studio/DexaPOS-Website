"use client";

import { ArrowDown, ArrowUp, ExternalLink, LinkIcon, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MAX_NAV_ITEMS,
  isExternalHref,
  moveNavItem,
  normalizeNavPath,
  type NavItem,
} from "@/lib/site-builder/nav";

/** A page a nav link can point at. */
export interface NavPageOption {
  /** Storage form: no leading slash. `""` is the home page. */
  path: string;
  title: string;
  isHome: boolean;
}

interface Props {
  items: NavItem[];
  pages: NavPageOption[];
  onChange: (items: NavItem[]) => void;
  disabled?: boolean;
}

/** Sentinel for the "external link" choice — Radix Select rejects an empty value. */
const EXTERNAL = "ext";
const pageValue = (path: string) => `page:${path}`;

/**
 * The site-wide navigation editor.
 *
 * **Targets are picked, not typed.** A free-text path is a 404 the merchant has
 * no way to see from here — they would have to publish, visit the live site and
 * click the link to find out. Since the page list is already loaded, the set of
 * valid internal targets is known exactly, so the control offers it and the
 * mistake becomes unavailable rather than merely discouraged.
 *
 * A link whose page was since renamed or removed is the one case that escapes
 * that, so it is called out in place instead of being silently coerced to
 * something else — the merchant is the only one who knows which page they meant.
 */
export default function NavEditor({ items, pages, onChange, disabled = false }: Props) {
  const baseId = useId();
  const atCapacity = items.length >= MAX_NAV_ITEMS;

  const patch = (index: number, next: NavItem) =>
    onChange(items.map((item, i) => (i === index ? next : item)));

  const addLink = () => {
    if (atCapacity) return;
    // Default to a page they have not linked yet, so one click produces a
    // working link rather than an empty row to fill in.
    const linked = new Set(items.filter((i) => i.href === undefined).map((i) => i.path ?? ""));
    const suggestion = pages.find((p) => !linked.has(p.path));

    // Every page already has a link — a second one to the same page is the one
    // thing they almost certainly did not mean. An external row is the only
    // kind of link left to add, so offer that instead of a silent duplicate.
    onChange([
      ...items,
      suggestion ? { label: suggestion.title, path: suggestion.path } : { label: "", href: "" },
    ]);
  };

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm font-medium">No navigation links yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Without them, a visitor who lands on your home page has no way to reach your other
            pages. Add a link for each page you want in the header.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item, index) => {
            const external = item.href !== undefined;
            const rowId = `${baseId}-${index}`;
            const matchedPage = external
              ? null
              : pages.find((p) => p.path === (item.path ?? ""));
            const brokenTarget = !external && !matchedPage;

            return (
              <li key={rowId} className="rounded-lg border bg-card p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor={`${rowId}-label`} className="text-xs text-muted-foreground">
                      Link text
                    </Label>
                    <Input
                      id={`${rowId}-label`}
                      value={item.label}
                      disabled={disabled}
                      placeholder="Menu"
                      onChange={(e) => patch(index, { ...item, label: e.target.value })}
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor={`${rowId}-target`} className="text-xs text-muted-foreground">
                      Goes to
                    </Label>
                    <Select
                      value={external ? EXTERNAL : pageValue(item.path ?? "")}
                      disabled={disabled}
                      onValueChange={(value) =>
                        patch(
                          index,
                          value === EXTERNAL
                            ? { label: item.label, href: "" }
                            : { label: item.label, path: value.slice("page:".length) },
                        )
                      }
                    >
                      <SelectTrigger id={`${rowId}-target`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start">
                        <SelectGroup>
                          <SelectLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Your pages
                          </SelectLabel>
                          {pages.map((page) => (
                            <SelectItem key={page.path} value={pageValue(page.path)}>
                              {page.title}
                              <span className="ml-2 text-muted-foreground">
                                /{page.path}
                              </span>
                            </SelectItem>
                          ))}
                          {brokenTarget && (
                            <SelectItem value={pageValue(item.path ?? "")}>
                              /{item.path} (page not found)
                            </SelectItem>
                          )}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Somewhere else
                          </SelectLabel>
                          <SelectItem value={EXTERNAL}>External link…</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={disabled || index === 0}
                      aria-label={`Move ${item.label || "link"} up`}
                      onClick={() => onChange(moveNavItem(items, index, -1))}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={disabled || index === items.length - 1}
                      aria-label={`Move ${item.label || "link"} down`}
                      onClick={() => onChange(moveNavItem(items, index, 1))}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={disabled}
                      aria-label={`Remove ${item.label || "link"}`}
                      onClick={() => onChange(items.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {external && (
                  <div className="mt-3 space-y-1.5">
                    <Label htmlFor={`${rowId}-href`} className="text-xs text-muted-foreground">
                      Web address
                    </Label>
                    <Input
                      id={`${rowId}-href`}
                      value={item.href ?? ""}
                      disabled={disabled}
                      inputMode="url"
                      placeholder="https://example.com/reservations"
                      onChange={(e) => patch(index, { label: item.label, href: e.target.value })}
                    />
                    {item.href !== "" && !isExternalHref(item.href) && (
                      <p className="flex items-center gap-1.5 text-xs text-destructive">
                        <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                        Start with https:// — this link will not be saved as it is.
                      </p>
                    )}
                  </div>
                )}

                {brokenTarget && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-destructive">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                    No page lives at /{normalizeNavPath(item.path ?? "")} any more. Pick another
                    page, or visitors will hit a missing page.
                  </p>
                )}

                {!item.label.trim() && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                    A link with no text cannot be shown, so this row will be dropped when you save.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={addLink} disabled={disabled || atCapacity}>
          <Plus className="h-4 w-4" />
          Add link
        </Button>
        <p className="text-xs text-muted-foreground">
          {atCapacity ? (
            <>
              <LinkIcon className="mr-1 inline h-3.5 w-3.5" />
              {MAX_NAV_ITEMS} links is the most the header can show.
            </>
          ) : (
            <>
              <ExternalLink className="mr-1 inline h-3.5 w-3.5" />
              Links appear in your header in this order, on every page.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
