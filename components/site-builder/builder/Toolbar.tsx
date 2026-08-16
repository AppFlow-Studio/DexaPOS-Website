"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  Circle,
  Cloud,
  CloudOff,
  ExternalLink,
  Eye,
  FileText,
  Home,
  Loader2,
  Monitor,
  MousePointer2,
  Plus,
  Redo2,
  RefreshCw,
  Rocket,
  Settings2,
  Smartphone,
  Tablet,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { diffDocuments } from "@/lib/site-builder/diff";
import { BUILT_SITE_IS_PUBLIC } from "@/lib/site-builder/public-site";
import { validatePage } from "@/lib/site-builder/validate";
import { cn } from "@/lib/utils";
import type { BuilderStore, DeviceMode, EditorPage, SaveState } from "./store";

const externalLinkLabel = BUILT_SITE_IS_PUBLIC
  ? "View the live site"
  : "View your ordering site";

/** Device labels carry their real width — "Tablet" alone is not a measurement. */
const DEVICES: { mode: DeviceMode; label: string; width: string; Icon: typeof Monitor }[] = [
  { mode: "desktop", label: "Desktop", width: "1120px", Icon: Monitor },
  { mode: "tablet", label: "Tablet", width: "834px", Icon: Tablet },
  { mode: "mobile", label: "Mobile", width: "390px", Icon: Smartphone },
];

/**
 * Draft-state presentation.
 *
 * Every label says "Draft" out loud. The word this deliberately never uses on
 * its own is "Saved": next to a Publish button, a bare "Saved" reads as "live",
 * and that single ambiguity is the thing merchants most reliably get wrong
 * about every site builder they have used before.
 */
const SAVE_PRESENTATION: Record<
  SaveState,
  { label: string; Icon: typeof Cloud; className: string; spin?: boolean } | null
> = {
  idle: null,
  dirty: { label: "Draft — unsaved", Icon: Cloud, className: "text-muted-foreground" },
  saving: { label: "Saving draft", Icon: Loader2, className: "text-muted-foreground", spin: true },
  saved: { label: "Draft saved", Icon: Check, className: "text-muted-foreground" },
  conflict: { label: "Changed elsewhere", Icon: CloudOff, className: "text-amber-600" },
  error: { label: "Draft not saved", Icon: CloudOff, className: "text-destructive" },
};

export default function Toolbar({
  store,
  locationId,
  viewUrl,
}: {
  store: BuilderStore;
  locationId: string;
  viewUrl?: string;
}) {
  const device = store((s) => s.device);
  const inspectorEnabled = store((s) => s.inspectorEnabled);
  const setDevice = store((s) => s.setDevice);
  const toggleInspector = store((s) => s.toggleInspector);
  const undo = store((s) => s.undo);
  const redo = store((s) => s.redo);
  const past = store((s) => s.past.length);
  const future = store((s) => s.future.length);

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background px-3 sm:px-4">
      <Tooltip>
        <TooltipTrigger asChild>
          {/* The editor is a focused surface. Returning merchants to the Website
              overview puts status, preview and their next task in front of them
              before they decide what to edit next. */}
          <Link
            href="/dashboard/website"
            aria-label="Back to Website"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
        </TooltipTrigger>
        <TooltipContent>Back to Website</TooltipContent>
      </Tooltip>

      <PageSwitcher store={store} locationId={locationId} />

      <StatusStack store={store} />

      <div className="mx-auto hidden items-center gap-0.5 rounded-lg border bg-muted/60 p-1 shadow-sm lg:flex">
        {DEVICES.map(({ mode, label, width, Icon }) => (
          <Tooltip key={mode}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`${label} preview, ${width} wide`}
                aria-pressed={device === mode}
                onClick={() => setDevice(mode)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-all",
                  device === mode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {label} · {width}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
        <ModeSwitch editing={inspectorEnabled} onToggle={toggleInspector} />

        <span className="hidden items-center gap-0.5 sm:flex">
          <IconButton label="Undo" shortcut="Ctrl+Z" disabled={past === 0} onClick={undo}>
            <Undo2 className="size-4" />
          </IconButton>
          <IconButton label="Redo" shortcut="Ctrl+Shift+Z" disabled={future === 0} onClick={redo}>
            <Redo2 className="size-4" />
          </IconButton>
        </span>

        {viewUrl && (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={externalLinkLabel}
                className="hidden size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:flex"
              >
                <ExternalLink className="size-4" />
              </a>
            </TooltipTrigger>
            {/* `viewUrl` is the ordering storefront. Calling it "the live site"
                while the built site is not served anywhere invites a merchant
                to publish, click here, and see none of their changes. */}
            <TooltipContent>{externalLinkLabel}</TooltipContent>
          </Tooltip>
        )}

        <PublishButton store={store} />
      </div>
    </header>
  );
}

/**
 * The page switcher.
 *
 * Every row carries the four facts that identify a page — its name, its address,
 * whether it is the home page, and whether it has changes guests cannot see yet.
 * A dropdown that lists only titles makes a merchant open pages to find out
 * which one they meant.
 */
function PageSwitcher({ store, locationId }: { store: BuilderStore; locationId: string }) {
  const router = useRouter();
  const page = store((s) => s.page);
  const pages = store((s) => s.pages);
  const doc = store((s) => s.doc);
  const publishedDoc = store((s) => s.publishedDoc);
  const saveState = store((s) => s.saveState);
  const openPageSettings = store((s) => s.openPageSettings);

  const currentHasChanges = publishedDoc === null || diffDocuments(publishedDoc, doc).length > 0;

  const switchTo = (target: EditorPage) => {
    if (target.id === page.id) return;
    // Never discard the open document mid-flight. Autosave debounces at 1.5s,
    // so a merchant who edits and immediately switches would otherwise lose the
    // last keystrokes to a route change.
    if (saveState === "dirty" || saveState === "saving") {
      const wait = setInterval(() => {
        const state = store.getState().saveState;
        if (state === "dirty" || state === "saving") return;
        clearInterval(wait);
        router.push(pageHref(target));
      }, 200);
      setTimeout(() => clearInterval(wait), 8000);
      return;
    }
    router.push(pageHref(target));
  };

  // Both identities stay in the URL so a refresh or a shared link reopens this
  // exact draft rather than falling back to whichever page is home.
  const pageHref = (target: EditorPage) =>
    `/dashboard/website/builder?location=${encodeURIComponent(locationId)}&page=${encodeURIComponent(target.id)}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className="min-w-0 max-w-36 sm:max-w-48">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold leading-tight">{page.title}</span>
            {page.isHome && <Home className="size-3 shrink-0 text-muted-foreground" />}
          </span>
          <span className="block truncate font-mono text-[11px] leading-tight text-muted-foreground">
            /{page.path}
          </span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
          {pages.length} page{pages.length === 1 ? "" : "s"} on this website
        </DropdownMenuLabel>

        {pages.map((item) => {
          const active = item.id === page.id;
          const unpublished = active
            ? currentHasChanges
            : item.status !== "published" || item.publishedAt === null;

          return (
            <DropdownMenuItem
              key={item.id}
              onSelect={() => switchTo(item)}
              className={cn("gap-2 py-2", active && "bg-accent")}
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium">{item.title}</span>
                  {item.isHome && (
                    <Badge variant="outline" className="shrink-0 px-1 py-0 text-[9px]">
                      Home
                    </Badge>
                  )}
                </span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  /{item.path}
                </span>
              </span>
              {/* A dot alone would be colour-only information. It is paired with
                  a label in the tooltip and an accessible name here. */}
              {unpublished ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      role="img"
                      aria-label="Has changes that are not live"
                      className="shrink-0 text-amber-500"
                    >
                      <Circle className="size-2 fill-current" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left">Not live yet</TooltipContent>
                </Tooltip>
              ) : (
                <span
                  role="img"
                  aria-label="Live and up to date"
                  className="shrink-0 text-emerald-600"
                >
                  <Check className="size-3" />
                </span>
              )}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={openPageSettings}>
          <Settings2 />
          Page settings
        </DropdownMenuItem>
        {/* Disabled rather than removed. `CreatePage` / `RenamePage` /
            `DeletePage` all exist and work, but nothing calls them and
            /dashboard/website counts pages without managing any — so this used
            to send a merchant looking for "add a page" to a screen that cannot
            add one. Kept visible so the capability still reads as planned.
            Re-enabled by plan item W3.1, which builds the page list. */}
        <DropdownMenuItem disabled className="gap-2">
          <Plus />
          <span className="flex min-w-0 flex-col leading-tight">
            <span>Manage pages</span>
            <span className="text-[10px] text-muted-foreground">Coming soon</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Draft state and live state, stacked and never merged.
 *
 * Two independent facts — "is my typing stored" and "can guests see it" — that
 * a single status line has to answer with one of them, and always answers with
 * the wrong one.
 */
function StatusStack({ store }: { store: BuilderStore }) {
  const saveState = store((s) => s.saveState);
  const savedAt = store((s) => s.savedAt);
  const saveError = store((s) => s.saveError);
  const publishedAt = store((s) => s.publishedAt);
  const relative = useRelativeTime(savedAt);

  const save = SAVE_PRESENTATION[saveState];

  return (
    <div className="hidden min-w-0 shrink-0 flex-col justify-center gap-0.5 pl-1 md:flex">
      {save && (
        <span className={cn("flex items-center gap-1.5 text-[11px]", save.className)} aria-live="polite">
          <save.Icon className={cn("size-3.5 shrink-0", save.spin && "animate-spin")} />
          <span className="truncate">
            {saveState === "saved" && relative ? `Draft saved ${relative}` : save.label}
          </span>
          {saveError && <RetryHint store={store} />}
        </span>
      )}
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Eye className="size-3.5 shrink-0" />
        <span className="truncate">
          {!publishedAt
            ? "Not published yet"
            : BUILT_SITE_IS_PUBLIC
              ? `Live · published ${formatShortDate(publishedAt)}`
              : `Published ${formatShortDate(publishedAt)}`}
        </span>
      </span>
    </div>
  );
}

/** Turns a failed save into an action instead of a dead end. */
function RetryHint({ store }: { store: BuilderStore }) {
  const setSaveState = store((s) => s.setSaveState);

  return (
    <button
      type="button"
      onClick={() => setSaveState("dirty")}
      className="flex shrink-0 items-center gap-1 rounded px-1 font-medium underline underline-offset-2"
    >
      <RefreshCw className="size-3" />
      Retry
    </button>
  );
}

/**
 * Edit / Preview as two labelled halves.
 *
 * This replaced a single icon whose pressed state was the only clue to which
 * mode you were in. The behavioural difference is large — in one mode a click
 * on a button selects a section, in the other it follows the link — and a
 * mouse-pointer glyph cannot carry that.
 */
function ModeSwitch({ editing, onToggle }: { editing: boolean; onToggle: () => void }) {
  return (
    <div
      role="group"
      aria-label="Editing mode"
      className="flex items-center gap-0.5 rounded-lg border bg-muted/60 p-0.5 shadow-sm"
    >
      <button
        type="button"
        aria-pressed={editing}
        onClick={() => !editing && onToggle()}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
          editing ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <MousePointer2 className="size-3.5" />
        Edit
      </button>
      <button
        type="button"
        aria-pressed={!editing}
        onClick={() => editing && onToggle()}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
          !editing ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Eye className="size-3.5" />
        Preview
      </button>
    </div>
  );
}

/**
 * The primary action, carrying the one number that matters.
 *
 * The badge counts changes against the *live* version, not against the session,
 * so "3" means three things guests cannot see yet. Blocking issues turn the
 * badge into a warning rather than hiding behind the sheet.
 */
function PublishButton({ store }: { store: BuilderStore }) {
  const doc = store((s) => s.doc);
  const publishedDoc = store((s) => s.publishedDoc);
  const openReview = store((s) => s.openReview);

  const changes = useMemo(
    () => (publishedDoc ? diffDocuments(publishedDoc, doc) : []),
    [publishedDoc, doc],
  );
  const validation = useMemo(() => validatePage(doc), [doc]);

  const neverPublished = publishedDoc === null;
  const blocked = validation.errors.length > 0;
  const count = neverPublished ? 0 : changes.length;

  return (
    <Button size="sm" className="shrink-0 gap-1.5 shadow-sm" onClick={openReview}>
      <Rocket className="size-3.5" />
      <span className="hidden sm:inline">
        {neverPublished ? "Review & publish" : count > 0 ? "Review & publish" : "Published"}
      </span>
      <span className="sm:hidden">Publish</span>
      {blocked ? (
        <span className="flex items-center gap-0.5 rounded-full bg-primary-foreground/20 px-1.5 text-[11px]">
          <TriangleAlert className="size-3" />
          {validation.errors.length}
        </span>
      ) : (
        count > 0 && (
          <span className="rounded-full bg-primary-foreground/20 px-1.5 text-[11px] tabular-nums">
            {count}
          </span>
        )
      )}
    </Button>
  );
}

function useRelativeTime(timestamp: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timestamp) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [timestamp]);

  if (!timestamp) return null;

  const seconds = Math.floor((now - timestamp) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function IconButton({
  label,
  shortcut,
  onClick,
  disabled,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-30 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{shortcut ? `${label} (${shortcut})` : label}</TooltipContent>
    </Tooltip>
  );
}
