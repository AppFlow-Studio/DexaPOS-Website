"use client";

import { Plus, Trash2, Zap } from "lucide-react";
import { useMemo, useState } from "react";

import { DeletePage, RenamePage } from "@/app/dashboard/website/actions/pages";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Binding } from "@/lib/site-builder/bindings/types";
import { checkPagePath } from "@/lib/site-builder/reserved-paths";
import { describeSchema, type FieldControl } from "@/lib/site-builder/schema-introspect";
import { SECTION_REGISTRY, sectionTitle } from "@/lib/site-builder/sections/registry";
import type { Section } from "@/lib/site-builder/sections/types";
import { cn } from "@/lib/utils";
import { websiteRoutes } from "../routes";
import { OverlayRail } from "../shell/OverlayChrome";
import MenuItemPicker from "./MenuItemPicker";
import type { BuilderStore } from "./store";

/**
 * The drawer, generated from each section's Zod schema.
 *
 * There is no per-section form anywhere in this codebase. Add a field to a
 * schema and a control appears here; change its type and the control changes.
 * That is the whole payoff of the registry design, and it survived the rebuild
 * untouched — section kind #10 still costs a schema file and a renderer.
 *
 * What the rebuild removed was everything wrapped *around* the generated
 * fields: a Content/Appearance tab split derived from a hardcoded list of field
 * names, a reset-to-default button on every row, a banner explaining live
 * fields, a link to the site-wide design workspace, and a section overflow menu
 * duplicating controls that now live in the canvas gutter. Nine fields felt
 * like thirty. They are now nine fields and a `Done` button.
 */
export default function SectionDrawer({
  store,
  locationId,
  clerkOrgId,
}: {
  store: BuilderStore;
  locationId: string;
  clerkOrgId: string;
}) {
  const doc = store((s) => s.doc);
  const selectedId = store((s) => s.selectedId);
  const pageSettingsOpen = store((s) => s.pageSettingsOpen);

  if (pageSettingsOpen) return <PageSettings store={store} clerkOrgId={clerkOrgId} />;

  const section = doc.sections.find((s) => s.id === selectedId);
  if (!section) return null;

  return (
    <SectionSettings key={section.id} section={section} store={store} locationId={locationId} />
  );
}

function SectionSettings({
  section,
  store,
  locationId,
}: {
  section: Section;
  store: BuilderStore;
  locationId: string;
}) {
  const def = SECTION_REGISTRY[section.kind];
  const updateProps = store((s) => s.updateProps);
  const closeDrawer = store((s) => s.closeDrawer);

  const controls = useMemo(() => describeSchema(def.schema), [def.schema]);
  const props = section.props as Record<string, unknown>;

  return (
    <OverlayRail footer={<DoneButton onClick={closeDrawer} />}>
      <div className="border-b px-4 py-3">
        <h2 className="truncate text-sm font-semibold">{sectionTitle(section)}</h2>
        <p className="truncate text-xs text-muted-foreground">{def.label}</p>
      </div>

      <div className="space-y-5 p-4">
        {controls.map((control) => (
          <Control
            key={control.name}
            control={control}
            value={props[control.name]}
            store={store}
            locationId={locationId}
            onChange={(value) => updateProps(section.id, { [control.name]: value })}
          />
        ))}
        {controls.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">Nothing to adjust here.</p>
        )}
      </div>
    </OverlayRail>
  );
}

function DoneButton({ onClick }: { onClick: () => void }) {
  return (
    <Button className="w-full" onClick={onClick}>
      Done
    </Button>
  );
}

/**
 * A field's label row.
 *
 * The character counter sits here rather than under the input, which is where
 * Owner puts it and where it belongs: a merchant writing a headline wants to
 * know the budget *before* they run out of it, not after.
 */
function FieldLabel({
  control,
  value,
  className,
}: {
  control: FieldControl;
  value?: unknown;
  className?: string;
}) {
  const max = countableMax(control);
  const length = typeof value === "string" ? value.length : 0;

  return (
    <span className={cn("mb-1.5 flex items-baseline gap-1", className)}>
      <span className="text-xs font-medium">{control.label}</span>
      {!control.optional && (
        <span className="text-muted-foreground/60" title="Required">
          *
        </span>
      )}
      {max !== null && (
        <span
          className={cn(
            "ml-auto text-[11px] tabular-nums",
            length > max ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {length}/{max}
        </span>
      )}
    </span>
  );
}

/**
 * A counter is only honest when the limit is real. `MAX_SAFE_INTEGER` is how the
 * introspector spells "no limit", and a rich-text body has no meaningful one.
 */
function countableMax(control: FieldControl): number | null {
  if (control.kind !== "text") return null;
  if (control.max == null || control.max === Number.MAX_SAFE_INTEGER) return null;
  return control.max;
}

function Control({
  control,
  value,
  store,
  locationId,
  onChange,
}: {
  control: FieldControl;
  value: unknown;
  store: BuilderStore;
  locationId: string;
  onChange: (value: unknown) => void;
}) {
  switch (control.kind) {
    case "text":
    case "richtext":
      return <TextControl control={control} value={value} onChange={onChange} />;

    case "boolean":
      return (
        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
          <span className="text-xs font-medium">{control.label}</span>
          <Switch
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked)}
            aria-label={control.label}
          />
        </div>
      );

    case "number":
      return (
        <label className="block">
          <span className="mb-1.5 flex items-baseline gap-1">
            <span className="text-xs font-medium">{control.label}</span>
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
              {String(value ?? 0)}
            </span>
          </span>
          <input
            type="range"
            min={control.min ?? 0}
            max={control.max ?? 100}
            value={Number(value ?? 0)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-foreground"
          />
        </label>
      );

    case "select": {
      const options = control.options ?? [];
      // Two or three choices read better as a segmented control than a dropdown:
      // every option is visible, and choosing is one click rather than two. It
      // is also the shape Owner uses for every small enum.
      if (options.length > 0 && options.length <= 3 && !control.optional) {
        return (
          <div>
            <FieldLabel control={control} />
            <div
              role="radiogroup"
              aria-label={control.label}
              className="flex gap-0.5 rounded-md bg-muted p-0.5"
            >
              {options.map((option) => {
                const active = String(value ?? "") === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChange(coerce(option.value))}
                    className={cn(
                      "flex-1 rounded-sm px-2 py-1.5 text-[11px] font-medium capitalize transition-colors",
                      active
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      }

      return (
        <label className="block">
          <FieldLabel control={control} />
          <select
            value={String(value ?? "")}
            onChange={(e) => onChange(coerce(e.target.value))}
            className={inputClass}
          >
            {control.optional && <option value="">—</option>}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    }

    case "link": {
      const link = (value ?? {}) as { label?: string; target?: { kind?: string; value?: string } };
      return (
        <div>
          <FieldLabel control={control} />
          <div className="space-y-2 rounded-md border p-3">
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
                onChange({
                  label: link.label ?? "Order Now",
                  // Keep a typed URL/phone around when the merchant tries a
                  // different link type. Changing their mind should not destroy
                  // work.
                  target: { kind: e.target.value, value: link.target?.value },
                })
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

    case "binding-list":
      return (
        <BindingControl
          control={control}
          value={value}
          store={store}
          locationId={locationId}
          onChange={onChange}
        />
      );

    case "image":
      return (
        <div>
          <FieldLabel control={control} />
          <Placeholder detail="Photo uploads arrive with the asset library." />
        </div>
      );

    case "repeater": {
      const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      const atMax = control.maxItems != null && rows.length >= control.maxItems;

      return (
        <div>
          <FieldLabel control={control} />
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={index} className="rounded-md border bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    #{index + 1}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${control.label} ${index + 1}`}
                    onClick={() => onChange(rows.filter((_, i) => i !== index))}
                    className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
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
                      store={store}
                      locationId={locationId}
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
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-input py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-ring hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
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

/**
 * Keeps a small local draft for text fields.
 *
 * The document is intentionally schema-valid at every mutation, but that must
 * not make a required field feel frozen when someone selects its text and
 * starts over. Empty intermediate input stays local; the next valid keystroke is
 * committed normally.
 */
function TextControl({
  control,
  value,
  onChange,
}: {
  control: FieldControl;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const savedValue = String(value ?? "");
  const [draft, setDraft] = useState(savedValue);
  const isLong = control.kind === "richtext" || control.max === Number.MAX_SAFE_INTEGER;

  const update = (next: string) => {
    setDraft(next);
    if (next || control.optional) onChange(next || undefined);
  };

  return (
    <label className="block">
      <FieldLabel control={control} value={draft} />
      {isLong ? (
        <textarea
          rows={control.kind === "richtext" ? 6 : 3}
          value={draft}
          onChange={(e) => update(e.target.value)}
          onBlur={() => {
            if (!draft && !control.optional) setDraft(savedValue);
          }}
          className={cn(inputClass, "resize-y leading-relaxed")}
        />
      ) : (
        <input
          type="text"
          value={draft}
          onChange={(e) => update(e.target.value)}
          onBlur={() => {
            if (!draft && !control.optional) setDraft(savedValue);
          }}
          className={inputClass}
        />
      )}
    </label>
  );
}

/**
 * A binding field. Which picker appears is decided by the binding's declared
 * record type, read off the schema — not by the field's name.
 */
function BindingControl({
  control,
  value,
  store,
  locationId,
  onChange,
}: {
  control: FieldControl;
  value: unknown;
  store: BuilderStore;
  locationId: string;
  onChange: (value: unknown) => void;
}) {
  const catalog = store((s) => s.catalog);
  const showPrices = store((s) => s.catalogShowPrices);
  const catalogError = store((s) => s.catalogError);

  if (control.bindingType === "menu_item") {
    const bindings = (Array.isArray(value) ? value : value ? [value] : []) as Binding[];
    return (
      <div>
        <FieldLabel control={control} />
        <MenuItemPicker
          bindings={bindings}
          onChange={(next) => onChange(next)}
          maxItems={control.maxItems}
          catalog={catalog}
          showPrices={showPrices}
          error={catalogError}
        />
      </div>
    );
  }

  // A location binding points at the restaurant this page is about. There is
  // exactly one candidate in v1, so a picker would be a dropdown with one
  // option — worse than a sentence explaining that it is already correct. That
  // explanation is only honest while the binding *is* set: an unset one is a
  // publish blocker, and the gate's "Fix it" link lands here.
  if (control.bindingType === "location") {
    const bound = (value as Binding | undefined)?.id;
    return (
      <div>
        <FieldLabel control={control} />
        {bound ? (
          <p className="flex gap-1.5 rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <Zap className="mt-px size-3 shrink-0" />
            <span>
              Address, phone and opening hours come from this restaurant&rsquo;s record. Change them
              once in your location settings and every page updates.
            </span>
          </p>
        ) : (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              This section is not linked to a restaurant yet, so it has nothing to show and the page
              cannot be published.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 h-7 text-[11px]"
              onClick={() => onChange({ type: "location", id: locationId })}
            >
              Link to this restaurant
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <FieldLabel control={control} />
      <Placeholder detail="A picker for this reference type has not been built yet." />
    </div>
  );
}

function Placeholder({ detail }: { detail: string }) {
  return (
    <div className="rounded-md border border-dashed border-input bg-muted/30 p-3">
      <p className="text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

/** Column counts are literal numbers in the schema, not strings. */
function coerce(raw: string): string | number {
  const numeric = Number(raw);
  return raw !== "" && !Number.isNaN(numeric) ? numeric : raw;
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

/**
 * The page's own name and address.
 *
 * Saved on blur, and not through the draft's autosave: these live on the row
 * rather than in the document, and they have a failure mode the silent autosave
 * cannot report — an address someone else already used.
 *
 * The search-listing fields that used to sit below this are gone (decision
 * D-B). `doc.seo` still exists and still defaults from the page title, so the
 * SEO surface keeps working; there is simply no longer a control for it here.
 */
function PageSettings({ store, clerkOrgId }: { store: BuilderStore; clerkOrgId: string }) {
  const page = store((s) => s.page);
  const patchPage = store((s) => s.patchPage);
  const closeDrawer = store((s) => s.closeDrawer);

  const [title, setTitle] = useState(page.title);
  const [path, setPath] = useState(page.path);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const commit = async (patch: { title?: string; path?: string }) => {
    setError(null);
    setSaving(true);
    try {
      const result = await RenamePage(clerkOrgId, page.id, patch);
      if (result.error) {
        setError(result.error);
        // Put the stored values back: leaving a rejected address in the field
        // shows the merchant a page address that does not exist.
        setTitle(page.title);
        setPath(page.path);
        return;
      }
      if (result.data) patchPage({ title: result.data.title, path: result.data.path });
    } finally {
      setSaving(false);
    }
  };

  const pathCheck = checkPagePath(path);

  return (
    <OverlayRail footer={<DoneButton onClick={closeDrawer} />}>
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Page settings</h2>
        <p className="text-xs text-muted-foreground">This page&rsquo;s name and address.</p>
      </div>

      <div className="space-y-4 p-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium">Page name</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              const next = title.trim();
              if (!next) {
                setTitle(page.title);
                return;
              }
              if (next !== page.title) void commit({ title: next });
            }}
            className={inputClass}
          />
        </label>

        {page.isHome ? (
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-[11px] font-medium">Web address</p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">/</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              This is your home page, so it sits at the root of your website. Its address cannot be
              changed — every link and search result you have points here.
            </p>
          </div>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium">Web address</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">/</span>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                onBlur={() => {
                  const next = path.trim();
                  if (next === page.path) return;
                  if (next === "" || !checkPagePath(next).ok) {
                    setPath(page.path);
                    return;
                  }
                  void commit({ path: next });
                }}
                className={cn(inputClass, "font-mono")}
              />
            </div>
            {path !== "" && !pathCheck.ok ? (
              <span className="mt-1.5 block text-[11px] text-destructive">{pathCheck.message}</span>
            ) : (
              <span className="mt-1.5 block text-[11px] text-muted-foreground">
                Changing this breaks links that already point at this page.
              </span>
            )}
          </label>
        )}

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-[11px] text-destructive">
            {error}
          </p>
        )}
        {saving && <p className="text-[11px] text-muted-foreground">Saving…</p>}

        {!page.isHome && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full text-[11px] text-destructive hover:text-destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="size-3" />
              Remove this page
            </Button>

            <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove &ldquo;{page.title}&rdquo;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {page.publishedAt
                      ? "This page is live. Removing it takes it off your website, and anyone following a link to it will find nothing there. Its version history is kept."
                      : "This page has never been published, so no guest has seen it. Its version history is kept."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async (e) => {
                      e.preventDefault();
                      const result = await DeletePage(clerkOrgId, page.id);
                      if (result.error) {
                        setError(result.error);
                        setConfirmingDelete(false);
                        return;
                      }
                      // A full navigation rather than a router push: the editor
                      // is now holding a document whose page no longer exists.
                      window.location.href = websiteRoutes.pages(store.getState().locationId ?? undefined);
                    }}
                  >
                    Remove the page
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </OverlayRail>
  );
}

const inputClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
