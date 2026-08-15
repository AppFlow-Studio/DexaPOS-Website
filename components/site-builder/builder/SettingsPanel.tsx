"use client";

import { Plus, Sparkles, Trash2, X } from "lucide-react";
import { useMemo } from "react";

import { describeSchema, humanize, type FieldControl } from "@/lib/site-builder/schema-introspect";
import { SECTION_REGISTRY } from "@/lib/site-builder/sections/registry";
import type { Section } from "@/lib/site-builder/sections/types";
import { cn } from "@/lib/utils";
import { SectionIcon } from "./section-icons";
import type { BuilderStore } from "./store";

/**
 * The settings panel, generated from each section's Zod schema.
 *
 * There is no per-section form anywhere in this codebase. Add a field to a
 * schema and a control appears here; change its type and the control changes.
 * That is the whole payoff of the registry design — section kind #10 costs a
 * schema file and a renderer, not a schema file, a renderer, *and* a form.
 *
 * Every edit goes through `updateSectionProps`, which validates against the same
 * schema before accepting. An invalid value is refused and explained rather than
 * quietly repaired: an edit arriving from the editor with a bad value is a bug
 * worth surfacing, unlike a stored document from an older build.
 */
export default function SettingsPanel({ store }: { store: BuilderStore }) {
  const doc = store((s) => s.doc);
  const selectedId = store((s) => s.selectedId);
  const section = doc.sections.find((s) => s.id === selectedId);

  if (!section) return <SeoPanel store={store} />;

  return <SectionSettings key={section.id} section={section} store={store} />;
}

function SectionSettings({ section, store }: { section: Section; store: BuilderStore }) {
  const def = SECTION_REGISTRY[section.kind];
  const updateProps = store((s) => s.updateProps);
  const select = store((s) => s.select);

  const controls = useMemo(() => describeSchema(def.schema), [def.schema]);
  const props = section.props as Record<string, unknown>;

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex items-start gap-3 border-b border-zinc-100 px-4 py-3.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
          <SectionIcon name={def.icon} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-zinc-900">{def.label}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{def.description}</p>
        </div>
        <button
          type="button"
          onClick={() => select(null)}
          aria-label="Close section settings"
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        >
          <X className="size-4" />
        </button>
      </header>

      {def.liveFields.length > 0 && (
        // Decision D6, said out loud. Merchants otherwise assume everything on
        // the page is something they typed and must maintain.
        <div className="flex gap-2.5 border-b border-blue-100 bg-blue-50/70 px-4 py-3">
          <Sparkles className="mt-px size-3.5 shrink-0 text-blue-600" />
          <p className="text-xs leading-relaxed text-blue-900">
            <strong className="font-semibold">Updates automatically.</strong>{" "}
            {def.liveFields.map(humanize).join(", ").toLowerCase()} always show your current
            data — you never need to republish to keep them right.
          </p>
        </div>
      )}

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {controls.map((control) => (
          <Control
            key={control.name}
            control={control}
            value={props[control.name]}
            onChange={(value) => updateProps(section.id, { [control.name]: value })}
          />
        ))}
      </div>
    </div>
  );
}

function FieldLabel({ control, className }: { control: FieldControl; className?: string }) {
  return (
    <span className={cn("flex items-center gap-1 text-xs font-medium text-zinc-700", className)}>
      {control.label}
      {!control.optional && (
        <span className="text-zinc-300" title="Required">
          *
        </span>
      )}
    </span>
  );
}

function Control({
  control,
  value,
  onChange,
}: {
  control: FieldControl;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = <FieldLabel control={control} className="mb-1.5" />;

  switch (control.kind) {
    case "text":
    case "richtext": {
      // Rich text gets a plain textarea for now. TipTap
      // (components/cms/TipTapEditor.tsx) is already in the repo and drops in
      // here; the markup it produces passes through the same sanitizer either
      // way, so this is a UI upgrade rather than a behavioural one.
      const isLong = control.kind === "richtext" || control.max === Number.MAX_SAFE_INTEGER;
      return (
        <label className="block">
          {label}
          {isLong ? (
            <textarea
              rows={control.kind === "richtext" ? 6 : 3}
              value={String(value ?? "")}
              onChange={(e) => onChange(e.target.value || undefined)}
              className={cn(inputClass, "resize-y leading-relaxed")}
            />
          ) : (
            <input
              type="text"
              value={String(value ?? "")}
              onChange={(e) => onChange(e.target.value || undefined)}
              className={inputClass}
            />
          )}
          {control.kind === "richtext" && (
            <span className="mt-1.5 block text-[11px] text-zinc-400">
              Basic HTML is allowed. Anything unsafe is removed automatically.
            </span>
          )}
        </label>
      );
    }

    case "boolean":
      return (
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 transition-colors hover:bg-zinc-50">
          <span className="text-xs font-medium text-zinc-700">{control.label}</span>
          {/* A native checkbox styled as a track-and-thumb switch: the peer
              pattern keeps it keyboard- and screen-reader-native with no extra
              component and no `role="switch"` to get wrong. */}
          <span className="relative inline-flex shrink-0">
            <input
              type="checkbox"
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
              className="peer size-0 opacity-0"
            />
            <span
              aria-hidden
              className="block h-5 w-9 rounded-full bg-zinc-200 transition-colors peer-checked:bg-zinc-900 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4"
            />
          </span>
        </label>
      );

    case "number":
      return (
        <label className="block">
          <span className="mb-1.5 flex items-center justify-between">
            <FieldLabel control={control} />
            <span className="text-[11px] tabular-nums text-zinc-500">{String(value ?? 0)}</span>
          </span>
          <input
            type="range"
            min={control.min ?? 0}
            max={control.max ?? 100}
            value={Number(value ?? 0)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-zinc-900"
          />
        </label>
      );

    case "select":
      return (
        <label className="block">
          {label}
          <select
            value={String(value ?? "")}
            onChange={(e) => {
              const raw = e.target.value;
              // Column counts are literal numbers in the schema, not strings.
              const numeric = Number(raw);
              onChange(raw !== "" && !Number.isNaN(numeric) ? numeric : raw);
            }}
            className={inputClass}
          >
            {control.optional && <option value="">—</option>}
            {control.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );

    case "link": {
      const link = (value ?? {}) as { label?: string; target?: { kind?: string; value?: string } };
      return (
        <div>
          {label}
          <div className="space-y-2 rounded-lg border border-zinc-200 p-3">
            <input
              type="text"
              placeholder="Button text"
              aria-label={`${control.label} text`}
              value={link.label ?? ""}
              onChange={(e) =>
                onChange(
                  e.target.value
                    ? { label: e.target.value, target: link.target ?? { kind: "order" } }
                    : undefined,
                )
              }
              className={inputClass}
            />
            <select
              aria-label={`${control.label} destination`}
              value={link.target?.kind ?? "order"}
              onChange={(e) =>
                onChange({ label: link.label ?? "Order Now", target: { kind: e.target.value } })
              }
              className={inputClass}
            >
              <option value="order">Go to ordering</option>
              <option value="menu">Go to the menu</option>
              <option value="contact">Jump to contact</option>
              <option value="url">External link</option>
              <option value="phone">Call us</option>
            </select>
            {(link.target?.kind === "url" || link.target?.kind === "phone") && (
              <input
                type="text"
                placeholder={link.target.kind === "url" ? "https://…" : "+1 555 000 0000"}
                aria-label={link.target.kind === "url" ? "Link URL" : "Phone number"}
                value={link.target.value ?? ""}
                onChange={(e) =>
                  onChange({
                    label: link.label ?? "Learn more",
                    target: { kind: link.target?.kind, value: e.target.value },
                  })
                }
                className={inputClass}
              />
            )}
          </div>
        </div>
      );
    }

    case "binding-list": {
      const items = Array.isArray(value) ? value : value ? [value] : [];
      return (
        <div>
          {label}
          <Placeholder
            headline={
              items.length === 0
                ? "Nothing linked yet."
                : `${items.length} linked${control.maxItems ? ` of ${control.maxItems} max` : ""}.`
            }
            detail="A menu picker lands with the item browser. Prices, photos and availability are always pulled live — they are never stored on the page."
          />
        </div>
      );
    }

    case "image":
      return (
        <div>
          {label}
          <Placeholder detail="Image uploads arrive with the asset library. Sections reference an asset by id rather than a URL, so replacing a photo updates every page at once." />
        </div>
      );

    case "repeater": {
      const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      const atMax = control.maxItems != null && rows.length >= control.maxItems;

      return (
        <div>
          {label}
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={index} className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-400">#{index + 1}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${control.label} ${index + 1}`}
                    title="Remove"
                    onClick={() => onChange(rows.filter((_, i) => i !== index))}
                    className="flex size-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <div className="space-y-3">
                  {control.fields?.map((sub) => (
                    <Control
                      key={sub.name}
                      control={sub}
                      value={row[sub.name]}
                      onChange={(next) =>
                        onChange(rows.map((r, i) => (i === index ? { ...r, [sub.name]: next } : r)))
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={atMax}
            onClick={() => onChange([...rows, blankRow(control)])}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-300 py-2 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-40"
          >
            {atMax ? (
              `Maximum ${control.maxItems}`
            ) : (
              <>
                <Plus className="size-3.5" />
                Add {control.label.toLowerCase()}
              </>
            )}
          </button>
        </div>
      );
    }

    default:
      return null;
  }
}

/** Shared empty-state box for the controls whose backing feature is not built. */
function Placeholder({ headline, detail }: { headline?: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 p-3">
      {headline && <p className="text-xs font-medium text-zinc-600">{headline}</p>}
      <p className={cn("text-[11px] leading-relaxed text-zinc-400", headline && "mt-1")}>
        {detail}
      </p>
    </div>
  );
}

/** A new repeater row with every required sub-field present but empty. */
function blankRow(control: FieldControl): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const field of control.fields ?? []) {
    if (field.optional) continue;
    if (field.kind === "boolean") row[field.name] = false;
    else if (field.kind === "number") row[field.name] = 0;
    else if (field.kind === "link") row[field.name] = { kind: "order" };
    else if (field.kind === "select") row[field.name] = field.options?.[0]?.value ?? "";
    else row[field.name] = "New";
  }
  return row;
}

function SeoPanel({ store }: { store: BuilderStore }) {
  const doc = store((s) => s.doc);
  const updateSeo = store((s) => s.updateSeo);

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="border-b border-zinc-100 px-4 py-3.5">
        <h2 className="text-sm font-semibold text-zinc-900">Page settings</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
          Select a section to edit it, or set how this page appears in search.
        </p>
      </header>

      <div className="space-y-5 overflow-y-auto p-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-700">Search title</span>
          <input
            type="text"
            value={doc.seo.title ?? ""}
            onChange={(e) => updateSeo({ title: e.target.value || undefined })}
            className={inputClass}
          />
          <CharCount value={doc.seo.title} ideal={60} />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-700">
            Search description
          </span>
          <textarea
            rows={3}
            value={doc.seo.description ?? ""}
            onChange={(e) => updateSeo({ description: e.target.value || undefined })}
            className={cn(inputClass, "resize-y leading-relaxed")}
          />
          <CharCount value={doc.seo.description} ideal={160} min={50} />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 transition-colors hover:bg-zinc-50">
          <span className="text-xs font-medium text-zinc-700">Hide from search engines</span>
          <input
            type="checkbox"
            checked={doc.seo.noindex === true}
            onChange={(e) => updateSeo({ noindex: e.target.checked || undefined })}
            className="size-4 accent-zinc-900"
          />
        </label>
      </div>
    </div>
  );
}

function CharCount({ value, ideal, min = 0 }: { value?: string; ideal: number; min?: number }) {
  const length = value?.trim().length ?? 0;
  const bad = length > ideal || (length > 0 && length < min);
  return (
    <span className="mt-1.5 flex items-center justify-between text-[11px]">
      <span className={bad ? "text-amber-600" : "text-zinc-400"}>
        {length} / {ideal}
      </span>
    </span>
  );
}

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5";
