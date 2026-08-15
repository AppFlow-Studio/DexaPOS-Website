"use client";

import {
  ArrowLeft,
  Check,
  CircleAlert,
  Cloud,
  CloudOff,
  Lightbulb,
  Loader2,
  Monitor,
  Redo2,
  Search,
  Smartphone,
  Tablet,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { SECTION_REGISTRY, addableKinds } from "@/lib/site-builder/sections/registry";
import { validatePage } from "@/lib/site-builder/validate";
import { SectionIcon } from "./section-icons";
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
  dirty: { label: "Unsaved", Icon: Cloud, className: "text-zinc-500" },
  saving: { label: "Saving", Icon: Loader2, className: "text-zinc-500", spin: true },
  saved: { label: "Saved", Icon: Check, className: "text-emerald-600" },
  conflict: { label: "Changed elsewhere", Icon: CloudOff, className: "text-amber-600" },
  error: { label: "Not saved", Icon: CloudOff, className: "text-red-600" },
};

export default function Toolbar({
  store,
  onOpenAddSection,
}: {
  store: BuilderStore;
  onOpenAddSection: () => void;
}) {
  const doc = store((s) => s.doc);
  const device = store((s) => s.device);
  const saveState = store((s) => s.saveState);
  const setDevice = store((s) => s.setDevice);
  const undo = store((s) => s.undo);
  const redo = store((s) => s.redo);
  const past = store((s) => s.past.length);
  const future = store((s) => s.future.length);

  // Cheap enough to recompute per render, and never stale as a result.
  const validation = validatePage(doc);
  const save = SAVE_PRESENTATION[saveState];

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-3">
      {/* ── identity ─────────────────────────────────────────────────────── */}
      <Link
        href="/dashboard/website"
        aria-label="Back to website settings"
        className="flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
      >
        <ArrowLeft className="size-4" />
      </Link>

      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-sm font-semibold text-zinc-900">
          {doc.seo.title || "Home"}
        </span>
        <span className="hidden text-xs text-zinc-400 sm:inline">
          {doc.sections.length} section{doc.sections.length === 1 ? "" : "s"}
        </span>
      </div>

      {save && (
        <span className={cn("flex items-center gap-1.5 text-xs", save.className)}>
          <save.Icon className={cn("size-3.5", save.spin && "animate-spin")} />
          <span className="hidden md:inline">{save.label}</span>
        </span>
      )}

      {/* ── device switcher, optically centred ───────────────────────────── */}
      <div className="mx-auto flex items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5">
        {DEVICES.map(({ mode, label, Icon }) => (
          <button
            key={mode}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={device === mode}
            onClick={() => setDevice(mode)}
            className={cn(
              "flex size-7 items-center justify-center rounded-md transition-all",
              device === mode
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-900",
            )}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>

      {/* ── actions ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0.5">
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
      </div>

      <ValidationPill validation={validation} />

      <div className="h-5 w-px bg-zinc-200" />

      <button
        type="button"
        onClick={onOpenAddSection}
        className="hidden rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 lg:block"
      >
        Add section
      </button>

      <button
        type="button"
        disabled
        title="Publishing arrives with Stage 5 — it needs the site tables."
        className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
      >
        Publish
      </button>
    </header>
  );
}

/**
 * Errors block publishing; warnings never do. A merchant who deleted a menu item
 * last month must still be able to fix a typo, so the two are visually distinct
 * rather than being one "problems" count.
 */
function ValidationPill({ validation }: { validation: ReturnType<typeof validatePage> }) {
  const { errors, warnings } = validation;

  const state = errors.length
    ? {
        Icon: CircleAlert,
        text: `${errors.length} issue${errors.length === 1 ? "" : "s"}`,
        className: "bg-red-50 text-red-700",
        title: errors.map((e) => e.message).join("\n"),
      }
    : warnings.length
      ? {
          Icon: Lightbulb,
          text: `${warnings.length} tip${warnings.length === 1 ? "" : "s"}`,
          className: "bg-amber-50 text-amber-700",
          title: warnings.map((w) => w.message).join("\n"),
        }
      : {
          Icon: Check,
          text: "Ready",
          className: "bg-emerald-50 text-emerald-700",
          title: "No problems found on this page.",
        };

  return (
    <span
      title={state.title}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        state.className,
      )}
    >
      <state.Icon className="size-3.5" />
      <span className="hidden sm:inline">{state.text}</span>
    </span>
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
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/**
 * The Add Section modal, driven entirely by the registry.
 *
 * `addable` on each registry entry decides what appears here, which is why
 * header / hero / footer are absent without any list to maintain — and why
 * section kind #10 shows up automatically, icon and description included.
 */
export function AddSectionModal({
  store,
  onClose,
}: {
  store: BuilderStore;
  onClose: () => void;
}) {
  const addSection = store((s) => s.addSection);
  const [query, setQuery] = useState("");

  const kinds = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return addableKinds();
    return addableKinds().filter((kind) => {
      const def = SECTION_REGISTRY[kind];
      return (
        def.label.toLowerCase().includes(term) ||
        def.description.toLowerCase().includes(term)
      );
    });
  }, [query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-900/40 p-6 pt-[12vh] backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Add a section"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-900/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3">
          <Search className="size-4 shrink-0 text-zinc-400" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sections…"
            aria-label="Search sections"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="size-4" />
          </button>
        </div>

        <ul className="grid gap-1.5 overflow-y-auto p-3 sm:grid-cols-2">
          {kinds.map((kind) => {
            const def = SECTION_REGISTRY[kind];
            return (
              <li key={kind}>
                <button
                  type="button"
                  onClick={() => {
                    addSection(kind);
                    onClose();
                  }}
                  className="group flex h-full w-full gap-3 rounded-xl border border-transparent p-3 text-left transition-colors hover:border-zinc-200 hover:bg-zinc-50"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 transition-colors group-hover:bg-white group-hover:text-zinc-900">
                    <SectionIcon name={def.icon} className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-zinc-900">{def.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                      {def.description}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}

          {kinds.length === 0 && (
            <li className="col-span-full px-3 py-10 text-center text-sm text-zinc-400">
              No sections match “{query}”.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
