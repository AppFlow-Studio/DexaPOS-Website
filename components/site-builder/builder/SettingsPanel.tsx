"use client";

import {
  ArrowUpRight,
  Copy,
  EyeOff,
  MoreHorizontal,
  Palette,
  Plus,
  RotateCcw,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { checkPagePath } from "@/lib/site-builder/reserved-paths";
import { describeSchema, humanize, type FieldControl } from "@/lib/site-builder/schema-introspect";
import type { Binding } from "@/lib/site-builder/bindings/types";
import { SECTION_REGISTRY, sectionTitle } from "@/lib/site-builder/sections/registry";
import type { Section } from "@/lib/site-builder/sections/types";
import { cn } from "@/lib/utils";
import MenuItemPicker from "./MenuItemPicker";
import { deleteSectionWithUndo } from "./delete-section";
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
 *
 * **Content and Style are separated** because they are answers to different
 * questions — "what does this say?" and "how does it look?" — and mixing them
 * makes a nine-field panel feel like thirty. The split is derived from field
 * names below rather than from the schema, which is a deliberate stopgap: the
 * real home for it is a `style` object on every section (`sectionStyleSchema`
 * already exists and `section-shell.tsx` already knows how to render one), and
 * that is a contract change rather than a UI one.
 */

/** Fields that answer "how does it look?" rather than "what does it say?". */
const STYLE_FIELDS = new Set([
  "layout",
  "columns",
  "variant",
  "imagePosition",
  "overlayOpacity",
  "mapStyle",
  "logoAlign",
  "sticky",
  "transparentOverHero",
  "defaultOpenFirst",
]);

export default function SettingsPanel({
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
  const section = doc.sections.find((s) => s.id === selectedId);

  if (!section) return <PageSettings store={store} clerkOrgId={clerkOrgId} />;

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
  const closeInspector = store((s) => s.closeInspector);
  const toggleHidden = store((s) => s.toggleHidden);
  const duplicateSection = store((s) => s.duplicateSection);

  const controls = useMemo(() => describeSchema(def.schema), [def.schema]);
  const defaults = useMemo(() => def.defaults() as Record<string, unknown>, [def]);
  const props = section.props as Record<string, unknown>;

  const contentControls = controls.filter((c) => !STYLE_FIELDS.has(c.name));
  const styleControls = controls.filter((c) => STYLE_FIELDS.has(c.name));

  const renderControls = (list: FieldControl[]) => (
    <div className="space-y-5 p-4">
      {list.map((control) => (
        <ControlRow
          key={control.name}
          control={control}
          value={props[control.name]}
          defaultValue={defaults[control.name]}
          store={store}
          onChange={(value) => updateProps(section.id, { [control.name]: value })}
        />
      ))}
      {list.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Nothing to adjust here.
        </p>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex shrink-0 items-start gap-2.5 border-b px-3 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <SectionIcon name={def.icon} className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{sectionTitle(section)}</h2>
          <p className="truncate text-xs text-muted-foreground">{def.label}</p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Section options"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => toggleHidden(section.id)}>
              <EyeOff />
              {section.hidden ? "Show on the page" : "Hide from the page"}
            </DropdownMenuItem>
            {!def.singleton && (
              <DropdownMenuItem onSelect={() => duplicateSection(section.id)}>
                <Copy />
                Duplicate
              </DropdownMenuItem>
            )}
            {def.deletable && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => deleteSectionWithUndo(store, section.id)}
                >
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={closeInspector}
          aria-label="Close section settings"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <X className="size-4" />
        </button>
      </header>

      {def.liveFields.length > 0 && (
        // Decision D6, said out loud. Merchants otherwise assume everything on
        // the page is something they typed and must maintain.
        <div className="flex shrink-0 gap-2 border-b bg-muted/50 px-3 py-2.5">
          <Zap className="mt-px size-3.5 shrink-0 text-muted-foreground" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Updates on its own.</span>{" "}
            {def.liveFields.map(humanize).join(", ").toLowerCase()} always show your current
            data — you never need to republish to keep them right.
          </p>
        </div>
      )}

      {styleControls.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto">{renderControls(contentControls)}</div>
      ) : (
        <Tabs defaultValue="content" className="flex min-h-0 flex-1 flex-col gap-0">
          {/* "Appearance", not "Style": merchants read Style as "my brand
              colours", which live in the site-wide Design workspace, not here.
              Appearance is only ever this section's own layout choices. */}
          <TabsList className="mx-3 mt-3 grid w-auto shrink-0 grid-cols-2">
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="style">Appearance</TabsTrigger>
          </TabsList>
          <TabsContent value="content" className="min-h-0 flex-1 overflow-y-auto">
            {renderControls(contentControls)}
          </TabsContent>
          <TabsContent value="style" className="min-h-0 flex-1 overflow-y-auto">
            {renderControls(styleControls)}
            <InheritsSiteDesign locationId={locationId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/**
 * Says where the colours and type actually come from.
 *
 * Without it, a merchant looking for "make this heading bigger" reasonably
 * concludes the editor cannot do it — the controls are one screen away in the
 * site-wide Design workspace, and per-section brand overrides are deliberately
 * not offered because nine sections each with their own palette is how a
 * restaurant site stops looking like one site.
 */
function InheritsSiteDesign({ locationId }: { locationId: string }) {
  return (
    <div className="mx-4 mb-4 rounded-lg border border-dashed px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium">
        <Palette className="size-3 text-muted-foreground" />
        Uses your website design
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        Colours, fonts, and corner style come from your site-wide design so every page matches.
      </p>
      <Link
        href={`/dashboard/website/design?location=${encodeURIComponent(locationId)}`}
        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium underline underline-offset-2"
      >
        Change site-wide design
        <ArrowUpRight className="size-3" />
      </Link>
    </div>
  );
}

/**
 * One field, with a reset that appears only when there is something to reset.
 *
 * Generated forms let people paint themselves into corners — a merchant who has
 * changed six things and made it worse needs a way back that does not involve
 * guessing what the original value was. Every mature editor surveyed ships one.
 */
function ControlRow({
  control,
  value,
  defaultValue,
  store,
  onChange,
}: {
  control: FieldControl;
  value: unknown;
  defaultValue: unknown;
  store: BuilderStore;
  onChange: (value: unknown) => void;
}) {
  const [resetToken, setResetToken] = useState(0);
  // Bindings are excluded: their "default" is an empty list, so a reset would
  // read as "clear everything I chose" — a destructive action wearing the label
  // of a safe one.
  const resettable =
    control.kind !== "binding-list" &&
    defaultValue !== undefined &&
    JSON.stringify(value ?? null) !== JSON.stringify(defaultValue ?? null);

  return (
    <div className="group/field">
      <Control
          control={control}
          value={value}
          store={store}
          resetToken={resetToken}
          onChange={onChange}
        action={
          resettable && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Reset ${control.label.toLowerCase()}`}
                  onClick={() => {
                    setResetToken((token) => token + 1);
                    onChange(defaultValue);
                  }}
                  className="flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:outline-none focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 group-hover/field:opacity-100"
                >
                  <RotateCcw className="size-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Reset to default</TooltipContent>
            </Tooltip>
          )
        }
      />
    </div>
  );
}

function FieldLabel({
  control,
  action,
  className,
}: {
  control: FieldControl;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("flex min-h-5 items-center gap-1", className)}>
      <span className="text-xs font-medium">{control.label}</span>
      {!control.optional && (
        <span className="text-muted-foreground/60" title="Required">
          *
        </span>
      )}
      <span className="ml-auto">{action}</span>
    </span>
  );
}

function Control({
  control,
  value,
  store,
  resetToken = 0,
  onChange,
  action,
}: {
  control: FieldControl;
  value: unknown;
  store: BuilderStore;
  resetToken?: number;
  onChange: (value: unknown) => void;
  action?: React.ReactNode;
}) {
  const label = <FieldLabel control={control} action={action} className="mb-1.5" />;

  switch (control.kind) {
    case "text":
    case "richtext": {
      return (
        <TextControl
          key={`${control.name}:${resetToken}`}
          control={control}
          value={value}
          label={label}
          onChange={onChange}
        />
      );
    }

    case "boolean":
      return (
        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors hover:bg-accent/40">
          <FieldLabel control={control} action={action} className="flex-1" />
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
          <span className="mb-1.5 flex items-center gap-1">
            <span className="text-xs font-medium">{control.label}</span>
            <span className="ml-auto flex items-center gap-1">
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {String(value ?? 0)}
              </span>
              {action}
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
      // every option is visible, and choosing is one click rather than two.
      if (options.length > 0 && options.length <= 3 && !control.optional) {
        return (
          <div>
            {label}
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
                      "flex-1 rounded-sm px-2 py-1 text-[11px] font-medium capitalize transition-colors",
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
          {label}
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
          {label}
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
                    // different link type. Changing their mind should not
                    // destroy work.
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
      return <BindingControl control={control} value={value} store={store} onChange={onChange} />;

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
 * Keep a small local draft for text fields. The document is intentionally
 * schema-valid at every mutation, but that must not make a required field feel
 * frozen when someone selects its text and starts over. Empty intermediate
 * input stays local; the next valid keystroke is committed normally.
 */
function TextControl({
  control,
  value,
  label,
  onChange,
}: {
  control: FieldControl;
  value: unknown;
  label: React.ReactNode;
  onChange: (value: unknown) => void;
}) {
  const savedValue = String(value ?? "");
  const [draft, setDraft] = useState(savedValue);
  const isLong = control.kind === "richtext" || control.max === Number.MAX_SAFE_INTEGER;

  const update = (next: string) => {
    setDraft(next);
    if (next || control.optional) onChange(next || undefined);
  };

  const resetEmptyDraft = () => {
    if (!draft && !control.optional) setDraft(savedValue);
  };

  return (
    <label className="block">
      {label}
      {isLong ? (
        <textarea
          rows={control.kind === "richtext" ? 6 : 3}
          value={draft}
          onChange={(e) => update(e.target.value)}
          onBlur={resetEmptyDraft}
          className={cn(inputClass, "resize-y leading-relaxed")}
        />
      ) : (
        <input
          type="text"
          value={draft}
          onChange={(e) => update(e.target.value)}
          onBlur={resetEmptyDraft}
          className={inputClass}
        />
      )}
      {control.kind === "richtext" && (
        <span className="mt-1.5 block text-[11px] text-muted-foreground">
          Use simple formatting where needed. Unsafe HTML is removed automatically.
        </span>
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
  onChange,
}: {
  control: FieldControl;
  value: unknown;
  store: BuilderStore;
  onChange: (value: unknown) => void;
}) {
  const catalog = store((s) => s.catalog);
  const showPrices = store((s) => s.catalogShowPrices);
  const catalogError = store((s) => s.catalogError);
  const editorLocationId = store((s) => s.locationId);

  if (control.bindingType === "menu_item") {
    const bindings = (Array.isArray(value) ? value : value ? [value] : []) as Binding[];
    return (
      <div>
        <FieldLabel control={control} className="mb-1.5" />
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
  // option — worse than a sentence explaining that it is already correct.
  //
  // That explanation is only honest while the binding *is* set. An unset one is
  // a blocking validation error, and describing it as already correct left the
  // review sheet's "Fix" button pointing at a field with nothing to fix.
  if (control.bindingType === "location") {
    const bound = (value as Binding | undefined)?.id;
    return (
      <div>
        <FieldLabel control={control} className="mb-1.5" />
        {bound ? (
          <p className="flex gap-1.5 rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <Zap className="mt-px size-3 shrink-0" />
            <span>
              Address, phone and opening hours come from this restaurant&rsquo;s record. Change
              them once in your location settings and every page updates — no republishing.
            </span>
          </p>
        ) : (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              This section is not linked to a restaurant yet, so it has nothing to show and the
              page cannot be published.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 h-7 text-[11px]"
              disabled={!editorLocationId}
              onClick={() => onChange({ type: "location", id: editorLocationId })}
            >
              Link to the restaurant you are editing
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <FieldLabel control={control} className="mb-1.5" />
      <Placeholder detail="A picker for this reference type has not been built yet." />
    </div>
  );
}

/** Shared empty-state box for the controls whose backing feature is not built. */
function Placeholder({ headline, detail }: { headline?: string; detail: string }) {
  return (
    <div className="rounded-md border border-dashed border-input bg-muted/30 p-3">
      {headline && <p className="text-xs font-medium">{headline}</p>}
      <p className={cn("text-[11px] leading-relaxed text-muted-foreground", headline && "mt-1")}>
        {detail}
      </p>
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

function PageSettings({ store, clerkOrgId }: { store: BuilderStore; clerkOrgId: string }) {
  const doc = store((s) => s.doc);
  const updateSeo = store((s) => s.updateSeo);
  const closeInspector = store((s) => s.closeInspector);

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex shrink-0 items-start gap-2 border-b px-3 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Page settings</h2>
          <p className="text-xs text-muted-foreground">This page&rsquo;s name, address and search listing.</p>
        </div>
        <button
          type="button"
          onClick={closeInspector}
          aria-label="Close page settings"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <PageIdentity store={store} clerkOrgId={clerkOrgId} />

        <div className="border-t pt-5">
          <p className="mb-1 text-xs font-semibold">Search listing</p>
          <p className="mb-4 text-[11px] leading-relaxed text-muted-foreground">
            How this page appears in Google. Left empty, the page name is used.
          </p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium">Search title</span>
          <input
            type="text"
            value={doc.seo.title ?? ""}
            onChange={(e) => updateSeo({ title: e.target.value || undefined })}
            className={inputClass}
          />
          <CharCount value={doc.seo.title} ideal={60} />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium">Search description</span>
          <textarea
            rows={3}
            value={doc.seo.description ?? ""}
            onChange={(e) => updateSeo({ description: e.target.value || undefined })}
            className={cn(inputClass, "resize-y leading-relaxed")}
          />
          <CharCount value={doc.seo.description} ideal={160} min={50} />
        </label>

        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
          <span className="text-xs font-medium">Hide from search engines</span>
          <Switch
            checked={doc.seo.noindex === true}
            onCheckedChange={(checked) => updateSeo({ noindex: checked || undefined })}
            aria-label="Hide from search engines"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The page's name and address — the two facts that live on the row rather than
 * in the document.
 *
 * Saved on blur, not on keystroke, and not through the draft autosave. The
 * document and the row are two different stores with two different failure
 * modes: an address that is already taken has to be reported to the merchant,
 * which the silent autosave has no way to do. Blur is also when a half-typed
 * address stops being half-typed.
 */
function PageIdentity({ store, clerkOrgId }: { store: BuilderStore; clerkOrgId: string }) {
  const page = store((s) => s.page);
  const patchPage = store((s) => s.patchPage);

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
    <div className="space-y-4">
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
        <span className="mt-1.5 block text-[11px] text-muted-foreground">
          Shown in your page list and used as the search title if you leave one blank.
        </span>
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
            className="h-7 w-full text-[11px] text-destructive hover:text-destructive"
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
                    // A full navigation rather than a router push: the editor is
                    // now holding a document whose page no longer exists.
                    window.location.href = "/dashboard/website#pages";
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
  );
}

function CharCount({ value, ideal, min = 0 }: { value?: string; ideal: number; min?: number }) {
  const length = value?.trim().length ?? 0;
  const bad = length > ideal || (length > 0 && length < min);
  return (
    <span
      className={cn(
        "mt-1.5 block text-[11px] tabular-nums",
        bad ? "text-amber-600" : "text-muted-foreground",
      )}
    >
      {length} / {ideal}
    </span>
  );
}

const inputClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
