"use client";

import { Plus, Star, Trash2, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import type { NavItem } from "@/lib/site-builder/nav";
import { checkPagePath } from "@/lib/site-builder/reserved-paths";
import { describeSchema, type FieldControl } from "@/lib/site-builder/schema-introspect";
import { SECTION_REGISTRY, sectionTitle } from "@/lib/site-builder/sections/registry";
import {
  PROVIDER_SPECS,
  resolveIntegrationEmbed,
  type IntegrationProvider,
} from "@/lib/site-builder/sections/schemas/integrations";
import { parseVideoRef } from "@/lib/site-builder/sections/schemas/video";
import type { Section } from "@/lib/site-builder/sections/types";
import { cn } from "@/lib/utils";
import { websiteRoutes } from "../routes";
import { OverlayRail } from "../shell/OverlayChrome";
import AssetPicker, { AssetListPicker } from "./AssetPicker";
import EventPicker from "./EventPicker";
import FormPicker from "./FormPicker";
import MenuItemPicker from "./MenuItemPicker";
import NavEditor, {
  NavDoneButton,
  useNavDraft,
  type NavDraft,
  type NavPageOption,
} from "./NavEditor";
import type { BuilderStore } from "./store";
import { FieldLabel, countableMax, inputClass } from "./field-chrome";
import { LinkControl } from "./LinkControl";

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
/** What the header section's editor needs, which is site-wide rather than page-wide. */
export interface DrawerSite {
  id: string;
  nav: NavItem[];
  pages: NavPageOption[];
}

export default function SectionDrawer({
  store,
  locationId,
  clerkOrgId,
  site,
}: {
  store: BuilderStore;
  locationId: string;
  clerkOrgId: string;
  site: DrawerSite;
}) {
  const doc = store((s) => s.doc);
  const selectedId = store((s) => s.selectedId);
  const pageSettingsOpen = store((s) => s.pageSettingsOpen);

  /**
   * Held here rather than inside `SectionSettings`, which is keyed on the
   * section id and therefore remounts on every selection change. A merchant who
   * arranged their navigation and then clicked another section to check
   * something would have lost the arrangement without being told.
   */
  const navDraft = useNavDraft({ siteId: site.id, clerkOrgId, initialItems: site.nav });

  if (pageSettingsOpen) return <PageSettings store={store} clerkOrgId={clerkOrgId} />;

  const section = doc.sections.find((s) => s.id === selectedId);
  if (!section) return null;

  return (
    <SectionSettings
      key={section.id}
      section={section}
      store={store}
      locationId={locationId}
      clerkOrgId={clerkOrgId}
      site={site}
      navDraft={navDraft}
    />
  );
}

function SectionSettings({
  section,
  store,
  locationId,
  clerkOrgId,
  site,
  navDraft,
}: {
  section: Section;
  store: BuilderStore;
  locationId: string;
  clerkOrgId: string;
  site: DrawerSite;
  navDraft: NavDraft;
}) {
  const def = SECTION_REGISTRY[section.kind];
  const updateProps = store((s) => s.updateProps);
  const closeDrawer = store((s) => s.closeDrawer);

  const props = section.props as Record<string, unknown>;

  // Recomputed as the merchant chooses, so switching Background to Photo makes
  // the picker appear in the same interaction rather than the next one.
  const controls = useMemo(() => {
    const overrides = def.fieldOverrides?.(props) ?? {};
    const hidden = new Set(def.hiddenFields?.(props) ?? []);
    return describeSchema(def.schema)
      .filter((control) => !hidden.has(control.name))
      .map((control) =>
        overrides[control.name] ? { ...control, ...overrides[control.name] } : control,
      );
  }, [def, props]);

  const isHeader = section.kind === "header";

  return (
    <OverlayRail
      footer={
        isHeader ? (
          <NavDoneButton draft={navDraft} onClose={closeDrawer} />
        ) : (
          <DoneButton onClick={closeDrawer} />
        )
      }
    >
      <div className="border-b px-4 py-3">
        <h2 className="truncate text-sm font-semibold">
          {isHeader ? "Navigation" : sectionTitle(section)}
        </h2>
        <p className="truncate text-xs text-muted-foreground">{def.label}</p>
      </div>

      {/* The navigation is the reason a merchant opens the header, so it comes
          first; the header's own presentation settings sit under it. */}
      {isHeader && <NavEditor draft={navDraft} pages={site.pages} />}

      <div className={cn("space-y-5 p-4", isHeader && "border-t")}>
        {isHeader && (
          <p className="text-xs font-medium text-muted-foreground">Header appearance</p>
        )}
        {controls.map((control) => (
          <Control
            key={control.name}
            control={control}
            value={props[control.name]}
            store={store}
            locationId={locationId}
            clerkOrgId={clerkOrgId}
            pages={site.pages}
            sectionProps={props}
            onPatch={(patch) => updateProps(section.id, patch)}
            onChange={(value, opts) =>
              updateProps(section.id, { [control.name]: value }, opts)
            }
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
 * How long a field waits after the last keystroke before committing.
 *
 * Long enough that an ordinary run of typing produces one commit rather than
 * one per character; short enough that the canvas still updates while the
 * merchant is looking at it, on the natural pauses between words and phrases.
 */
const COMMIT_DELAY_MS = 250;

/**
 * How a control describes the edit it is making, rather than just its value.
 *
 * Only `TextControl` sets `coalesce`, and only the store reads it. It is what
 * lets a run of typing be one undo step while a run of clicks through a
 * segmented control stays one step per click — both of which arrive here as a
 * sequence of single-key patches and are otherwise indistinguishable.
 */
export interface CommitOptions {
  coalesce?: boolean;
}

function Control({
  control,
  value,
  store,
  locationId,
  clerkOrgId,
  pages,
  sectionProps,
  onPatch,
  onChange,
}: {
  control: FieldControl;
  value: unknown;
  store: BuilderStore;
  locationId: string;
  clerkOrgId: string;
  pages: NavPageOption[];
  sectionProps?: Record<string, unknown>;
  onPatch?: (patch: Record<string, unknown>) => void;
  onChange: (value: unknown, opts?: CommitOptions) => void;
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

    case "rating": {
      const current = typeof value === "number" ? value : 0;
      const minimum = control.min ?? 1;
      const maximum = control.max ?? 5;

      return (
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium">{control.label}</legend>
          <div className="flex items-center gap-1" role="radiogroup" aria-label={control.label}>
            {Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index).map(
              (rating) => {
                const selected = rating <= current;
                return (
                  <button
                    key={rating}
                    type="button"
                    role="radio"
                    aria-checked={rating === current}
                    aria-label={`${rating} ${rating === 1 ? "star" : "stars"}`}
                    onClick={() => onChange(rating)}
                    className="flex size-9 items-center justify-center rounded-md transition-transform hover:scale-110 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    style={{ color: selected ? "var(--primary)" : "var(--muted-foreground)" }}
                  >
                    <Star
                      aria-hidden
                      className={cn("size-6", selected && "fill-current")}
                      strokeWidth={1.8}
                    />
                  </button>
                );
              },
            )}
          </div>
        </fieldset>
      );
    }

    case "select": {
      const options = control.options ?? [];
      /*
        A choice that invalidates a sibling has to clear it in the *same* patch.
        `updateSectionProps` re-parses the whole props object and refuses it
        outright when the schema fails, so two patches would mean the first one
        is rejected and the panel simply stops responding — which is exactly
        what switching the integrations provider used to do.
      */
      const choose = (raw: string) => {
        if (String(value ?? "") === raw) return;
        const next = coerce(raw);
        if (!control.clears?.length || !onPatch) return onChange(next);
        onPatch({
          [control.name]: next,
          ...Object.fromEntries(control.clears.map((field) => [field, ""])),
        });
      };
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
                    onClick={() => choose(option.value)}
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
            onChange={(e) => choose(e.target.value)}
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

    case "link":
      return <LinkControl control={control} value={value} pages={pages} onChange={onChange} />;

    case "embed":
      return (
        <EmbedControl
          control={control}
          value={value}
          provider={(sectionProps?.provider as IntegrationProvider) ?? "google-maps"}
          onChange={onChange}
        />
      );

    case "video":
      return (
        <VideoLinkControl
          control={control}
          value={value}
          provider={sectionProps?.provider === "vimeo" ? "vimeo" : "youtube"}
          onChange={(provider, videoId) =>
            onPatch ? onPatch({ provider, videoId }) : onChange(videoId)
          }
        />
      );

    case "form":
      return (
        <FormPicker
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          locationId={locationId}
          clerkOrgId={clerkOrgId}
        />
      );

    case "event":
      return (
        <EventPicker
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          locationId={locationId}
          clerkOrgId={clerkOrgId}
        />
      );

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
      // A gallery is an array of assets; a hero or a content background is one.
      // Both come through the same control kind, told apart by `maxItems`.
      return control.maxItems === undefined ? (
        <AssetPicker
          label={control.label}
          clerkOrgId={clerkOrgId}
          value={value as { assetId: string; alt?: string } | undefined}
          onChange={onChange}
        />
      ) : (
        <AssetListPicker
          label={control.label}
          clerkOrgId={clerkOrgId}
          maxItems={control.maxItems}
          value={(value as { assetId: string; alt?: string }[] | undefined) ?? []}
          onChange={onChange}
        />
      );

    case "file":
      // The PDF section's document. Same control, a different library and a
      // different gate — see `AssetPicker`'s `KIND_COPY`.
      return (
        <AssetPicker
          label={control.label}
          clerkOrgId={clerkOrgId}
          kind="document"
          value={value as { assetId: string; alt?: string } | undefined}
          onChange={onChange}
        />
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
                      clerkOrgId={clerkOrgId}
                      pages={pages}
                      sectionProps={row}
                      // Forwarded, so text typed into a repeater row coalesces
                      // into one undo step exactly as a top-level field does.
                      onChange={(next, opts) =>
                        onChange(
                          rows.map((r, i) => (i === index ? { ...r, [sub.name]: next } : r)),
                          opts,
                        )
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

function VideoLinkControl({
  control,
  value,
  provider,
  onChange,
}: {
  control: FieldControl;
  value: unknown;
  provider: "youtube" | "vimeo";
  onChange: (provider: "youtube" | "vimeo", videoId: string) => void;
}) {
  const savedValue = typeof value === "string" ? value : "";
  const initialLink = savedValue
    ? provider === "vimeo"
      ? `https://vimeo.com/${savedValue}`
      : `https://youtu.be/${savedValue}`
    : "";
  const [draft, setDraft] = useState(initialLink);
  const [error, setError] = useState<string | null>(null);

  const update = (next: string) => {
    setDraft(next);
    if (!next.trim()) {
      setError(null);
      onChange(provider, "");
      return;
    }

    const parsed = parseVideoRef(next);
    if (!parsed) {
      setError("Paste a valid YouTube or Vimeo link.");
      return;
    }

    setError(null);
    onChange(parsed.provider, parsed.videoId);
  };

  return (
    <label className="block">
      <FieldLabel control={{ ...control, label: "Video link" }} />
      <input
        type="text"
        inputMode="url"
        placeholder="https://youtube.com/watch?v=…"
        value={draft}
        onChange={(event) => update(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "video-link-error" : undefined}
        className={cn(inputClass, error && "border-destructive focus-visible:border-destructive")}
      />
      <p
        id={error ? "video-link-error" : undefined}
        className={cn(
          "mt-1.5 text-[11px] leading-relaxed",
          error ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {error ?? `Paste a YouTube or Vimeo link. Current provider: ${provider === "vimeo" ? "Vimeo" : "YouTube"}.`}
      </p>
    </label>
  );
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
  onChange: (value: unknown, opts?: CommitOptions) => void;
}) {
  const savedValue = String(value ?? "");
  const [draft, setDraft] = useState(savedValue);
  const isLong = control.kind === "richtext" || control.multiline === true;
  const max = countableMax(control);

  // Held in a ref so the debounce timer and the unmount flush always call the
  // current handler without either being torn down on every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The value waiting to be committed, if any. `undefined` is a legal value. */
  const pending = useRef<{ value: string | undefined } | null>(null);
  /** What the document holds, so a discarded draft has somewhere true to go back to. */
  const committed = useRef(savedValue);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (next) onChangeRef.current(next.value, { coalesce: true });
  }, []);

  /**
   * Nothing is lost by waiting, because nothing may outlive the wait: leaving
   * the field, closing the drawer and selecting another section all unmount or
   * blur this control, and both paths commit first.
   */
  useEffect(() => flush, [flush]);

  /**
   * Adopt a value the document grew somewhere else — an undo, or a document
   * replaced from the server — but never on top of keystrokes not yet committed.
   */
  useEffect(() => {
    committed.current = savedValue;
    if (!pending.current) setDraft(savedValue);
  }, [savedValue]);

  /**
   * The cap is enforced here, on the way in.
   *
   * Owner's fields simply stop accepting characters at the limit rather than
   * accepting them and refusing the save. That matters because our mutation
   * layer *rejects* invalid props rather than repairing them: a merchant who
   * pasted 60 characters into a 50-character title would otherwise watch the
   * canvas stop updating with no explanation, because every keystroke after the
   * cap was being silently refused.
   *
   * **The keystroke stays local; only the pause reaches the document.** Every
   * commit re-renders the canvas, and a text change that crosses the
   * empty/non-empty boundary — the first character typed into a blank heading —
   * cannot use the local patching fast path at all, so it costs a full server
   * render of the page. Per keystroke that is what made typing lag and the
   * preview rebuild under the cursor. `draft` is what the input shows, so
   * waiting costs the typist nothing.
   */
  const update = (raw: string) => {
    const next = max !== null ? raw.slice(0, max) : raw;
    setDraft(next);
    // Emptying a required field is not an edit; it is a draft on its way
    // somewhere, and `onBlur` decides what to do with it.
    if (!next && !control.optional) {
      cancel();
      return;
    }

    pending.current = { value: next || undefined };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, COMMIT_DELAY_MS);
  };

  const onBlur = () => {
    if (!draft && !control.optional) {
      cancel();
      setDraft(committed.current);
      return;
    }
    flush();
  };

  return (
    <label className="block">
      <FieldLabel control={control} value={draft} />
      {isLong ? (
        <textarea
          rows={control.kind === "richtext" ? 6 : 3}
          maxLength={max ?? undefined}
          value={draft}
          onChange={(e) => update(e.target.value)}
          onBlur={onBlur}
          className={cn(inputClass, "resize-y leading-relaxed")}
        />
      ) : (
        <input
          type="text"
          maxLength={max ?? undefined}
          value={draft}
          onChange={(e) => update(e.target.value)}
          onBlur={onBlur}
          className={inputClass}
        />
      )}
    </label>
  );
}

/**
 * The integrations paste field.
 *
 * Alone among the text-ish controls, this one never commits what was typed. It
 * commits what `resolveIntegrationEmbed` *rebuilt* from it, and only once that
 * succeeds — which is the entire reason the field can invite a merchant to
 * paste an `<iframe>` snippet without a byte of markup reaching the document.
 * Owner says the same thing in one line under the box: only the verified ids
 * are saved.
 *
 * Refusing to commit until it resolves is also the only workable behaviour
 * here. `updateSectionProps` re-parses and *rejects* invalid props rather than
 * repairing them, so committing a half-typed URL per keystroke would leave the
 * canvas frozen with nothing on screen to explain why. A draft that does not
 * resolve yet stays local, next to the reason it does not.
 *
 * The resolved ids underneath are read back out of the rebuilt URL rather than
 * stored alongside it. There is no second copy, so there is nothing to drift.
 */
function EmbedControl({
  control,
  value,
  provider,
  onChange,
}: {
  control: FieldControl;
  value: unknown;
  provider: IntegrationProvider;
  onChange: (value: unknown, opts?: CommitOptions) => void;
}) {
  const saved = String(value ?? "");
  const [draft, setDraft] = useState(saved);

  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  const providerRef = useRef(provider);
  useEffect(() => {
    onChangeRef.current = onChange;
    providerRef.current = provider;
  });

  const commit = useCallback((raw: string) => {
    pending.current = null;
    const resolved = resolveIntegrationEmbed(providerRef.current, raw);
    // Emptying the field is a real edit. Text on its way to being valid is not.
    if (resolved) onChangeRef.current(resolved.src);
    else if (!raw.trim()) onChangeRef.current("");
  }, []);

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /** Nothing may outlive the debounce: closing the drawer unmounts this. */
  useEffect(
    () => () => {
      cancelTimer();
      if (pending.current !== null) commit(pending.current);
    },
    [commit],
  );

  /**
   * Adopt a value the document grew elsewhere — an undo, or the provider
   * selector clearing the stranded link — but never on top of a paste the
   * merchant is still working on.
   */
  useEffect(() => {
    if (!focused.current) setDraft(saved);
  }, [saved]);

  const spec = PROVIDER_SPECS[provider];
  const embed = resolveIntegrationEmbed(provider, draft);
  const unresolved = draft.trim().length > 0 && !embed;

  const update = (raw: string) => {
    setDraft(raw);
    pending.current = raw;
    cancelTimer();
    timer.current = setTimeout(() => commit(raw), COMMIT_DELAY_MS);
  };

  const onBlur = () => {
    focused.current = false;
    cancelTimer();
    const resolved = resolveIntegrationEmbed(provider, draft);
    pending.current = null;

    // Snap to the stored form, so what the merchant reads back is what was
    // actually kept rather than the snippet it was extracted from. Text that
    // has not resolved survives instead: it is their only copy of the mistake,
    // and it is sitting directly above the sentence explaining it.
    if (resolved) {
      onChangeRef.current(resolved.src);
      setDraft(resolved.src);
    } else if (!draft.trim()) {
      onChangeRef.current("");
      setDraft("");
    }
  };

  return (
    <div>
      <FieldLabel control={control} />
      <textarea
        rows={3}
        value={draft}
        placeholder={control.placeholder}
        maxLength={control.max}
        spellCheck={false}
        aria-invalid={unresolved || undefined}
        aria-describedby={`${control.name}-note`}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => update(e.target.value)}
        onBlur={onBlur}
        className={cn(
          inputClass,
          "resize-y break-all font-mono text-[11px] leading-relaxed",
          unresolved && "border-destructive focus-visible:border-destructive",
        )}
      />

      <p
        id={`${control.name}-note`}
        className={cn(
          "mt-1.5 text-[11px] leading-relaxed",
          unresolved ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {unresolved ? spec.error : control.help}
      </p>

      {/*
        The read-back. Present only once something resolved, and only for
        providers whose ids mean something to a person — Google Maps' `pb` blob
        is not a thing a merchant can check, and showing it would be a
        confirmation that confirms nothing.
      */}
      {embed && embed.identifiers.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-2">
          {embed.identifiers.map((identifier) => (
            <div key={identifier.label}>
              <dt className="mb-1.5 text-xs font-medium">{identifier.label}</dt>
              <dd
                className={cn(
                  inputClass,
                  "truncate bg-muted/40 font-mono text-[11px] text-muted-foreground",
                )}
                title={identifier.value}
              >
                {identifier.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
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

/**
 * A new repeater row with every required sub-field present but empty.
 *
 * Text starts **blank**, not as the literal `"New"`. That word was real content
 * — an FAQ whose question and answer both read "New" is publishable, and reads
 * as a mistake on a live site rather than as an empty slot. The sub-field
 * schemas admit blank text so the row is still storable while it is being
 * written, and `validate` refuses to publish a section that still holds one.
 * §U4.
 */
function blankRow(control: FieldControl): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const field of control.fields ?? []) {
    if (field.optional) continue;
    if (field.kind === "boolean") row[field.name] = false;
    else if (field.kind === "number" || field.kind === "rating") row[field.name] = 0;
    else if (field.kind === "link") row[field.name] = { kind: "order" };
    else if (field.kind === "select") row[field.name] = field.options?.[0]?.value ?? "";
    else row[field.name] = "";
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

        <PageSeoFields store={store} clerkOrgId={clerkOrgId} />

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

/**
 * How this page appears in a search result and when someone shares its link.
 *
 * A deliberate divergence from Owner, who has no SEO surface anywhere in their
 * Website tab — and it is the divergence easiest to justify, because we sell to
 * restaurants who are found through search and through a link pasted into a
 * group chat. The cost is four optional fields; the benefit is that a merchant
 * can write "Sunday roast in Camden — booking recommended" instead of shipping
 * a page whose preview says "About us".
 *
 * **Collapsed by default**, because none of it is required and a merchant who
 * came here to rename a page should not have to scroll past it. It is part of
 * the document, so it autosaves and versions with the page — unlike the name
 * and address above it, which live on the row.
 *
 * The placeholders show what the page will use if these are left empty, which
 * is the whole reason a merchant can safely ignore the section: the page name
 * already becomes the title, and there is no state in which a page has no
 * title at all.
 */
function PageSeoFields({ store, clerkOrgId }: { store: BuilderStore; clerkOrgId: string }) {
  const seo = store((s) => s.doc.seo);
  const updateSeo = store((s) => s.updateSeo);
  const page = store((s) => s.page);

  const DESCRIPTION_MAX = 160;

  return (
    <details className="rounded-md border">
      <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-medium [&::-webkit-details-marker]:hidden">
        Search &amp; sharing
        <span className="ml-1 font-normal text-muted-foreground">optional</span>
      </summary>

      <div className="space-y-4 border-t p-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium">Search title</span>
          <input
            type="text"
            value={seo.title ?? ""}
            maxLength={70}
            placeholder={page.title}
            onChange={(e) => updateSeo({ title: e.target.value || undefined })}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium">
            Description{" "}
            <span className="font-normal text-muted-foreground">
              {(seo.description ?? "").length}/{DESCRIPTION_MAX}
            </span>
          </span>
          <textarea
            rows={3}
            value={seo.description ?? ""}
            maxLength={DESCRIPTION_MAX}
            placeholder="One or two sentences, as they should read under your link."
            onChange={(e) => updateSeo({ description: e.target.value || undefined })}
            className={cn(inputClass, "resize-y")}
          />
        </label>

        <div>
          <AssetPicker
            label="Sharing image"
            clerkOrgId={clerkOrgId}
            value={seo.ogImageAssetId ? { assetId: seo.ogImageAssetId } : undefined}
            onChange={(value) => updateSeo({ ogImageAssetId: value?.assetId })}
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            Shown when this page&rsquo;s link is posted. Without one, your logo is used.
          </p>
        </div>

        <label className="flex cursor-pointer items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-xs font-medium">Hide from search engines</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
              The page stays live and anyone with the link can open it. It simply stops appearing in
              results — for a page you only share directly.
            </span>
          </span>
          <Switch
            checked={seo.noindex === true}
            onCheckedChange={(next) => updateSeo({ noindex: next || undefined })}
            aria-label="Hide from search engines"
          />
        </label>
      </div>
    </details>
  );
}

