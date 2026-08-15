"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  Cloud,
  CloudOff,
  ExternalLink,
  Loader2,
  Monitor,
  MousePointerClick,
  Redo2,
  Settings2,
  Smartphone,
  Tablet,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { countBrokenBindings } from "@/lib/site-builder/binding-health";
import { diffDocuments } from "@/lib/site-builder/diff";
import { validatePage } from "@/lib/site-builder/validate";
import { cn } from "@/lib/utils";
import type { BuilderStore, DeviceMode, SaveState } from "./store";

const DEVICES: { mode: DeviceMode; label: string; Icon: typeof Monitor }[] = [
  { mode: "desktop", label: "Desktop", Icon: Monitor },
  { mode: "tablet", label: "Tablet", Icon: Tablet },
  { mode: "mobile", label: "Mobile", Icon: Smartphone },
];

/**
 * How each save state presents itself.
 *
 * Kept as data rather than a chain of ternaries in the markup: there are six
 * states and three of them need a different colour *and* a different icon, which
 * is exactly the point where inline conditionals stop being readable.
 */
const SAVE_PRESENTATION: Record<
  SaveState,
  { label: string; Icon: typeof Cloud; className: string; spin?: boolean } | null
> = {
  idle: null,
  dirty: { label: "Unsaved", Icon: Cloud, className: "text-muted-foreground" },
  saving: { label: "Saving", Icon: Loader2, className: "text-muted-foreground", spin: true },
  saved: { label: "Saved", Icon: Check, className: "text-muted-foreground" },
  conflict: { label: "Changed elsewhere", Icon: CloudOff, className: "text-amber-600" },
  error: { label: "Not saved", Icon: CloudOff, className: "text-destructive" },
};

export default function Toolbar({
  store,
  siteName,
  viewUrl,
}: {
  store: BuilderStore;
  siteName?: string;
  viewUrl?: string;
}) {
  const doc = store((s) => s.doc);
  const device = store((s) => s.device);
  const inspectorEnabled = store((s) => s.inspectorEnabled);
  const setDevice = store((s) => s.setDevice);
  const toggleInspector = store((s) => s.toggleInspector);
  const openPageSettings = store((s) => s.openPageSettings);
  const undo = store((s) => s.undo);
  const redo = store((s) => s.redo);
  const past = store((s) => s.past.length);
  const future = store((s) => s.future.length);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-3">
      {/* ── identity ─────────────────────────────────────────────────────── */}
      <Tooltip>
        <TooltipTrigger asChild>
          {/* `/dashboard/website` has no page — the only routes under it are
              `builder` and `preview`, so the old target 404'd. The online-store
              settings are the surface this builder is layered on (D1) and are
              the honest place to go back to until an index page exists. */}
          <Link
            href="/dashboard/online-ordering"
            aria-label="Back to online store settings"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
        </TooltipTrigger>
        <TooltipContent>Back to online store settings</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          {/* Capped, not just truncated: an SEO title can run to 60 characters
              and would otherwise shove the device switcher off centre. */}
          <span className="min-w-0 max-w-36 sm:max-w-52">
            <span className="block truncate text-[13px] font-semibold leading-tight">
              {doc.seo.title || "Home"}
            </span>
            {siteName && (
              <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                {siteName}
              </span>
            )}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
            {doc.sections.length} section{doc.sections.length === 1 ? "" : "s"} on this page
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openPageSettings}>
            <Settings2 />
            Page settings
          </DropdownMenuItem>
          {/* Multi-page is modelled in the schema and unbuilt in the UI. The
              dropdown is here rather than a bare label so that adding location
              pages later is a list of items, not a redesign of this corner. */}
        </DropdownMenuContent>
      </DropdownMenu>

      <SaveIndicator store={store} />

      {/* ── device switcher, optically centred ───────────────────────────── */}
      <div className="mx-auto hidden items-center gap-0.5 rounded-md bg-muted p-0.5 sm:flex">
        {DEVICES.map(({ mode, label, Icon }) => (
          <Tooltip key={mode}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={label}
                aria-pressed={device === mode}
                onClick={() => setDevice(mode)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-sm transition-all",
                  device === mode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* ── actions ──────────────────────────────────────────────────────── */}
      <div className="ml-auto flex items-center gap-0.5 sm:ml-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Preview mode"
              aria-pressed={!inspectorEnabled}
              onClick={toggleInspector}
              className={cn(
                "flex size-8 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                inspectorEnabled
                  ? "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  : "bg-foreground text-background hover:bg-foreground/90",
              )}
            >
              <MousePointerClick className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-56">
            {inspectorEnabled
              ? "Preview mode — use the page as a visitor would, to test links and accordions."
              : "Back to editing."}
          </TooltipContent>
        </Tooltip>

        <IconButton label="Undo" shortcut="Ctrl+Z" disabled={past === 0} onClick={undo}>
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton
          label="Redo"
          shortcut="Ctrl+Shift+Z"
          disabled={future === 0}
          onClick={redo}
        >
          <Redo2 className="size-4" />
        </IconButton>

        {viewUrl && (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View the live site"
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <ExternalLink className="size-4" />
              </a>
            </TooltipTrigger>
            <TooltipContent>View the live site</TooltipContent>
          </Tooltip>
        )}
      </div>

      <PublishButton store={store} />
    </header>
  );
}

/**
 * "Saved 2m ago", not "Saved".
 *
 * A bare checkmark does not answer the question a merchant who has just typed
 * for ten minutes is actually asking, which is *when*. The time re-renders on a
 * slow interval rather than a fast one — nobody needs second-level precision on
 * an autosave, and a per-second timer in a builder that already re-renders on
 * every keystroke is wasted work.
 */
function SaveIndicator({ store }: { store: BuilderStore }) {
  const saveState = store((s) => s.saveState);
  const savedAt = store((s) => s.savedAt);
  const relative = useRelativeTime(savedAt);

  const save = SAVE_PRESENTATION[saveState];
  if (!save) return null;

  const label =
    saveState === "saved" && relative ? `Saved ${relative}` : save.label;

  return (
    <span
      className={cn("flex shrink-0 items-center gap-1.5 text-[11px]", save.className)}
      aria-live="polite"
    >
      <save.Icon className={cn("size-3.5", save.spin && "animate-spin")} />
      <span className="hidden md:inline">{label}</span>
    </span>
  );
}

function useRelativeTime(timestamp: number | null): string | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!timestamp) return;
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, [timestamp]);

  if (!timestamp) return null;

  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

/**
 * `Publish · 3` — the unpublished-change count on the button itself.
 *
 * The draft/published split is the single thing merchants most reliably
 * misunderstand about a site builder, and every other builder answers it only
 * once the merchant thinks to ask. The count is free: a page is one JSON
 * document (A1) and a version is an immutable row (A2), so the difference is a
 * local computation over two objects.
 */
function PublishButton({ store }: { store: BuilderStore }) {
  const doc = store((s) => s.doc);
  const publishedDoc = store((s) => s.publishedDoc);
  const catalog = store((s) => s.catalog);
  const select = store((s) => s.select);

  const changes = useMemo(() => diffDocuments(publishedDoc, doc), [publishedDoc, doc]);
  const validation = useMemo(() => validatePage(doc), [doc]);
  const broken = useMemo(() => countBrokenBindings(doc, catalog), [doc, catalog]);

  const blocked = validation.errors.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" className="ml-1.5 shrink-0 gap-1.5">
          Publish
          {changes.length > 0 && (
            <span className="rounded-full bg-primary-foreground/20 px-1.5 text-[11px] tabular-nums">
              {changes.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Publish changes</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {changes.length === 0
              ? "Nothing has changed since your last publish."
              : `${changes.length} change${changes.length === 1 ? "" : "s"} ready to go live.`}
          </p>
        </div>

        {changes.length > 0 && (
          <ul className="max-h-44 overflow-y-auto border-b px-3 py-2 text-xs">
            {changes.map((change, index) => (
              <li
                key={`${change.kind}-${change.sectionId ?? index}`}
                className="flex items-center gap-2 py-1"
              >
                <span
                  aria-hidden
                  className="size-1 shrink-0 rounded-full bg-muted-foreground/50"
                />
                <span className="truncate">{change.label}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Errors block and each one links to the section that owns it. A count
            with no path to the fix only creates anxiety. */}
        {validation.errors.length > 0 && (
          <ul className="border-b bg-destructive/5 px-3 py-2">
            {validation.errors.map((issue, index) => (
              <li key={index} className="flex items-start gap-2 py-1 text-xs">
                <CircleAlert className="mt-px size-3.5 shrink-0 text-destructive" />
                <span className="flex-1 text-destructive">{issue.message}</span>
                {issue.sectionId && (
                  <button
                    type="button"
                    onClick={() => select(issue.sectionId!)}
                    className="shrink-0 font-medium text-destructive underline underline-offset-2"
                  >
                    Fix
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {broken > 0 && (
          <p className="flex items-start gap-2 border-b bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            <span>
              {broken} linked item{broken === 1 ? "" : "s"} will not appear — they are 86&rsquo;d
              or no longer on a menu here. Publishing is still fine.
            </span>
          </p>
        )}

        {validation.warnings.length > 0 && (
          <ul className="border-b px-3 py-2">
            {validation.warnings.map((issue, index) => (
              <li key={index} className="py-0.5 text-[11px] text-muted-foreground">
                {issue.message}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2 px-3 py-2.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button size="sm" disabled className="w-full">
                  Publish
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-56">
              {blocked
                ? "Fix the issues above first."
                : "Publishing arrives with Stage 5 — it needs the site tables."}
            </TooltipContent>
          </Tooltip>
        </div>
      </PopoverContent>
    </Popover>
  );
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
