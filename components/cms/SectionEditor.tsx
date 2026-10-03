"use client";

import { useId, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  GripVertical,
  Images,
  MoreHorizontal,
  Trash2,
  Upload,
} from "lucide-react";

import TipTapEditor from "./TipTapEditor";
import { ImageLibraryDialog, useCmsImageUpload } from "./ImageLibraryDialog";
import { AddButton, Field, IconAction, MutedSelect, MutedTextarea } from "./cms-fields";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Section, SectionField, SectionType, SECTION_META, createSection } from "@/lib/cms/cms-sections";
import { CARD_ICONS, CARD_ICON_NAMES } from "@/lib/cms/card-icons";
import { cn } from "@/lib/utils";

interface SectionEditorProps {
  sections: Section[];
  onChange: (sections: Section[]) => void;
}

type ButtonItem = { text: string; link: string; style: string };
type CardItem = {
  title?: string;
  description?: string;
  image?: string;
  image_alt?: string;
  icon?: string;
  link?: string;
  link_text?: string;
  tags?: string[];
};

export function SectionTypeIcon({ type, className }: { type: SectionType; className?: string }) {
  const paths = (() => {
    switch (type) {
      case "hero":
        return <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M5 6h6M5 8.5h4M5 11h2" /></>;
      case "rich_text":
        return <><path d="M3 3.5h10M8 3.5v9M5.5 12.5h5" /><path d="M3 7h2.5" /></>;
      case "image":
        return <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><circle cx="10.5" cy="6" r="1" /><path d="m3.5 11 3-3 2.25 2 1.5-1.5 2.25 2.5" /></>;
      case "video":
        return <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="m6.5 6 4 2-4 2Z" /></>;
      case "cards":
        return <><rect x="2.5" y="3" width="5" height="4" rx="1" /><rect x="8.5" y="3" width="5" height="4" rx="1" /><rect x="2.5" y="8" width="5" height="5" rx="1" /><rect x="8.5" y="8" width="5" height="5" rx="1" /></>;
      case "cta":
        return <><path d="M3 4.5h6.5v5H3zM9.5 6l3-1.5v5l-3-1.5M4.5 9.5v3" /><path d="M6.5 9.5v2" /></>;
      case "stats":
        return <><path d="M3 13V9h2.5v4M6.75 13V5.5h2.5V13M10.5 13V3h2.5v10M2 13h12" /></>;
      case "compare":
        return <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11M7.75 3v10M4.5 9h1.25M9.75 9h1.25" /></>;
      case "industries":
        return <><path d="M2.5 13h11M3.5 13V6.5h9V13M2.5 6.5 4 3h8l1.5 3.5M6 9v4M10 9v4" /><path d="M2.5 6.5c.5.75 1 1.1 1.5 1.1s1-.35 1.5-1.1c.5.75 1 1.1 1.5 1.1s1-.35 1.5-1.1c.5.75 1 1.1 1.5 1.1s1-.35 1.5-1.1c.5.75 1 1.1 1.5 1.1" /></>;
      case "pricing_calculator":
        return <><rect x="3" y="2.5" width="10" height="11" rx="1.5" /><path d="M5 4.5h6v2H5zM5 8.5h1M8 8.5h1M11 8.5h.01M5 11h1M8 11h1M11 11h.01" /></>;
      case "demo_frame":
        return <><rect x="2" y="3" width="12" height="9" rx="1.5" /><path d="m6.5 6 4 2-4 2ZM6 14h4M8 12v2" /></>;
      case "contact_form":
        return <><path d="M5 3.5H3.5v10h9v-10H11M6 2.5h4v2H6z" /><circle cx="8" cy="7" r="1.25" /><path d="M5.5 11c.35-1.15 1.2-1.75 2.5-1.75s2.15.6 2.5 1.75" /></>;
      case "faq":
        return <><path d="M3 3h10v8H7l-3.5 2v-2H3z" /><path d="M6.25 6.25a1.75 1.75 0 1 1 2.4 1.62c-.45.2-.65.5-.65.88M8 10h.01" /></>;
      case "annotations":
        return <><path d="M3 2.75h8.5L13 4.25v9H3zM11.5 2.75v2h1.5M5 7h6M5 9.5h4" /><circle cx="5" cy="12" r=".5" fill="currentColor" stroke="none" /></>;
      case "core_features":
        return <><circle cx="8" cy="8" r="2" /><circle cx="3" cy="4" r="1.25" /><circle cx="13" cy="4" r="1.25" /><circle cx="3" cy="12" r="1.25" /><circle cx="13" cy="12" r="1.25" /><path d="m4 5 2.5 2M12 5 9.5 7M4 11l2.5-2M12 11 9.5 9" /></>;
      case "capabilities":
        return <><path d="M3 4h10M3 8h10M3 12h10" /><circle cx="6" cy="4" r="1.25" fill="currentColor" /><circle cx="10" cy="8" r="1.25" fill="currentColor" /><circle cx="7" cy="12" r="1.25" fill="currentColor" /></>;
      case "compare_strip":
        return <><rect x="2" y="4" width="12" height="8" rx="1.5" /><path d="M8 4v8M4.5 7h1.75M9.75 9h1.75M5.5 6l1 1-1 1M10.5 8l-1 1 1 1" /></>;
    }
  })();

  return (
    <svg
      aria-hidden="true"
      className={cn("h-4 w-4 shrink-0", className)}
      focusable="false"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.35"
    >
      {paths}
    </svg>
  );
}

/** A group heading inside a section: one step above a field label (`text-sm font-medium`). */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[0.9375rem] font-semibold">{children}</h4>;
}

/** Field types that take the full width of a section's two-column field grid. */
const WIDE_FIELD_TYPES = new Set<SectionField["type"]>(["richtext", "textarea", "image", "buttons"]);

/**
 * Splits a section's fields into Content (words), Buttons and Appearance
 * (images, alt text, colours, alignment), keeping their order within each
 * group. Alt text travels with the images it describes.
 */
function groupFields(fields: SectionField[]) {
  const content: SectionField[] = [];
  const buttons: SectionField[] = [];
  const appearance: SectionField[] = [];
  for (const field of fields) {
    if (field.type === "buttons") buttons.push(field);
    else if (
      field.type === "image" ||
      field.type === "color" ||
      field.type === "select" ||
      field.key === "alt" ||
      field.key.endsWith("_alt")
    )
      appearance.push(field);
    else content.push(field);
  }
  return [
    { title: "Content", fields: content },
    { title: "Buttons", fields: buttons },
    { title: "Appearance", fields: appearance },
  ].filter((group) => group.fields.length > 0);
}

function sectionPreview(section: Section) {
  const text = section.heading || (section.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, 80) || "No heading yet";
}

/**
 * The page's content sections: a reorderable list of tier-2 cards
 * (UI-DESIGN-SYSTEM §3.1), each opening in place into its fields.
 */
export default function SectionEditor({ sections, onChange }: SectionEditorProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const gripDrag = useRef(false);
  const baseId = useId();

  const updateSection = (id: string, patch: Partial<Section>) => {
    onChange(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeSection = (id: string) => {
    onChange(sections.filter((s) => s.id !== id));
  };

  const addSection = (type: SectionType) => {
    const s = createSection(type);
    onChange([...sections, s]);
    setExpanded(s.id);
  };

  const moveSection = (id: string, dir: -1 | 1) => {
    const i = sections.findIndex((s) => s.id === id);
    if (i === -1) return;
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const copy = [...sections];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };

  const handleDragStart = (e: React.DragEvent, i: number) => {
    if (!gripDrag.current) { e.preventDefault(); return; }
    setDragIndex(i);
  };

  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) return;
    const copy = [...sections];
    const [moved] = copy.splice(dragIndex, 1);
    copy.splice(i, 0, moved);
    onChange(copy);
    setDragIndex(i);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    gripDrag.current = false;
  };

  return (
    <div className="min-w-0 space-y-6">
      {sections.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-muted/30 px-4 py-10 text-center">
          <p className="text-sm font-medium">No sections yet</p>
          <p className="text-xs text-muted-foreground">Add one below to start building this page.</p>
        </div>
      ) : (
        <ol className="min-w-0 space-y-3">
          {sections.map((section, i) => {
            const meta = SECTION_META[section.type];
            const isOpen = expanded === section.id;
            const bodyId = `${baseId}-${section.id}`;
            return (
              <li
                key={section.id}
                className={cn(
                  "min-w-0 rounded-2xl border bg-card transition-opacity",
                  dragIndex === i && "opacity-50"
                )}
                draggable
                onDragStart={(e) => handleDragStart(e, i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDragEnd={handleDragEnd}
              >
                <div className="flex min-w-0 items-center gap-1 p-2">
                  <span
                    aria-hidden
                    title="Drag to reorder"
                    className="hidden size-8 shrink-0 cursor-grab items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing sm:inline-flex"
                    onMouseDown={() => { gripDrag.current = true; }}
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={bodyId}
                    onClick={() => setExpanded(isOpen ? null : section.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-full px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                  >
                    {/* The type icon drops on phones to leave the width to the name. */}
                    <SectionTypeIcon type={section.type} className="text-muted-foreground max-sm:hidden" />
                    {/* The label truncates rather than pushing past the button;
                        from `sm` it keeps most of the room and the preview gets the rest. */}
                    <span className="min-w-0 truncate text-sm font-medium sm:max-w-[60%] sm:shrink-0">{meta.label}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground max-sm:hidden">
                      {sectionPreview(section)}
                    </span>
                    {/* Phones drop the chevron: the row is narrow, and tapping the name opens it. */}
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform max-sm:hidden",
                        isOpen && "rotate-180"
                      )}
                    />
                  </button>

                  {/* Move and delete stay one tap away at every width (§7). */}
                  <div className="flex shrink-0 items-center gap-1">
                    <IconAction label="Move section up" disabled={i === 0} onClick={() => moveSection(section.id, -1)}>
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </IconAction>
                    <IconAction
                      label="Move section down"
                      disabled={i === sections.length - 1}
                      onClick={() => moveSection(section.id, 1)}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </IconAction>
                    <IconAction label="Delete section" destructive onClick={() => removeSection(section.id)}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </IconAction>
                  </div>
                </div>

                {isOpen && (
                  <div
                    id={bodyId}
                    // Below `md` the base Input and Textarea are 16px; here they take
                    // the 14px they use from `md`, so a section's many fields fit a phone.
                    className="min-w-0 space-y-8 px-3 pt-3 pb-4 max-md:[&_input]:text-sm max-md:[&_textarea]:text-sm sm:px-5 sm:pb-5"
                  >
                    {(() => {
                      const groups = groupFields(meta.fields);
                      // One group needs no heading; the section's own name says what it is.
                      const titled = groups.length > 1;
                      return groups.map((group) => (
                        <div key={group.title} className="min-w-0 space-y-4">
                          {titled && <GroupLabel>{group.title}</GroupLabel>}
                          <div className="grid min-w-0 gap-4 md:grid-cols-2">
                            {group.fields.map((field) => (
                              <FieldRenderer
                                key={field.key}
                                section={section}
                                field={field}
                                // A buttons group carries its own heading.
                                hideLabel={field.type === "buttons" && titled}
                                className={WIDE_FIELD_TYPES.has(field.type) ? "md:col-span-2" : undefined}
                                onChange={(val) => updateSection(section.id, { [field.key]: val })}
                              />
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
                    {hasEditableItems(section.type) && (
                      <CardsSubEditor
                        items={section.items || []}
                        onChange={(items) => updateSection(section.id, { items })}
                      />
                    )}
                    {section.type === "compare" && (
                      <CompareEditor
                        columns={section.compare_columns || ["Capability", "DEXA", "Toast", "Square", "Clover"]}
                        rows={section.compare_rows || []}
                        onChange={(patch) => updateSection(section.id, patch)}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="min-w-0 space-y-3">
        <GroupLabel>Add a section</GroupLabel>
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {(Object.entries(SECTION_META) as [SectionType, typeof SECTION_META[SectionType]][]).map(([type, meta]) => (
            <button
              key={type}
              type="button"
              onClick={() => addSection(type)}
              className="flex min-w-0 items-center gap-2.5 rounded-2xl bg-muted/45 px-3 py-2.5 text-left text-sm leading-snug transition-colors hover:bg-muted"
            >
              {/* Phones drop the icon and let the name wrap, so no name is cut off. */}
              <SectionTypeIcon type={type} className="text-muted-foreground max-sm:hidden" />
              <span className="min-w-0 sm:truncate">{meta.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function hasEditableItems(type: SectionType) {
  return [
    "hero",
    "cards",
    "stats",
    "pricing_calculator",
    "faq",
    "annotations",
    "core_features",
    "capabilities",
    "compare_strip",
  ].includes(type);
}

function FieldRenderer({
  section,
  field,
  hideLabel = false,
  className,
  onChange,
}: {
  section: Section;
  field: SectionField;
  /** Buttons only: the group heading already names them. */
  hideLabel?: boolean;
  className?: string;
  onChange: (value: string | ButtonItem[]) => void;
}) {
  const value = (section as unknown as Record<string, string>)[field.key] || "";
  const id = `field-${section.id}-${field.key}`;

  if (field.type === "buttons") {
    return (
      <ButtonsEditor
        label={hideLabel ? undefined : field.label}
        buttons={section.buttons || []}
        className={className}
        onChange={(buttons) => onChange(buttons)}
      />
    );
  }

  if (field.type === "richtext") {
    return (
      <Field label={field.label} className={className}>
        <TipTapEditor content={value} onChange={(html) => onChange(html)} placeholder={`Enter ${field.label.toLowerCase()}…`} />
      </Field>
    );
  }

  if (field.type === "textarea") {
    return (
      <Field label={field.label} htmlFor={id} className={className}>
        <MutedTextarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={field.placeholder} />
      </Field>
    );
  }

  if (field.type === "image") {
    return (
      <Field label={field.label} htmlFor={id} className={className}>
        <ImagePicker id={id} value={value} onChange={(url) => onChange(url)} />
      </Field>
    );
  }

  if (field.type === "color") {
    return (
      <Field label={field.label} htmlFor={id} className={className}>
        {/* The text field leads so it starts at the left edge like every other
            field. The swatch follows it with a ring, so an unset (white) colour
            is still visible. */}
        <div className="flex min-w-0 items-center gap-2">
          <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#ffffff"
            className="font-mono"
          />
          {/* The native swatch stays a raw input — `Input` cannot style it (§11.1). */}
          <input
            type="color"
            aria-label={`${field.label} swatch`}
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
            onChange={(e) => onChange(e.target.value)}
            className="size-9 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0 ring-1 ring-border [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
          />
        </div>
      </Field>
    );
  }

  if (field.type === "select") {
    return (
      <Field label={field.label} htmlFor={id} className={className}>
        <MutedSelect
          id={id}
          value={value}
          onValueChange={(v) => onChange(v)}
          options={field.options || []}
          placeholder="Choose…"
        />
      </Field>
    );
  }

  return (
    <Field label={field.label} htmlFor={id} className={className}>
      <Input
        id={id}
        type={field.type === "url" ? "url" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
      />
    </Field>
  );
}

const BUTTON_STYLES = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "ghost-light", label: "Light ghost" },
];

/**
 * One entry in a repeatable list (a button, a card, a comparison row): an
 * inset well headed by its name and number, with its remove action beside
 * it, so every list in the editor reads the same way at every width.
 */
function ItemCard({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-3 rounded-2xl bg-muted/30 p-3 sm:p-4">
      <div className="-my-1 flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted-foreground tabular-nums">{title}</span>
        <IconAction label={`Remove ${title.toLowerCase()}`} destructive onClick={onRemove}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </IconAction>
      </div>
      {children}
    </div>
  );
}

/**
 * A small caption above a control inside an `ItemCard`. Placeholders alone
 * vanish once a field is filled, which left "Link" and "Link text" unlabelled.
 * The control carries its own `aria-label`, so this line is visual only.
 */
function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <span aria-hidden className="block text-xs text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function ButtonsEditor({
  label,
  buttons,
  className,
  onChange,
}: {
  /** Omitted when a group heading already names the buttons. */
  label?: string;
  buttons: ButtonItem[];
  className?: string;
  onChange: (buttons: ButtonItem[]) => void;
}) {
  const updateButton = (i: number, patch: Partial<ButtonItem>) => {
    onChange(buttons.map((button, idx) => (idx === i ? { ...button, ...patch } : button)));
  };

  const removeButton = (i: number) => {
    onChange(buttons.filter((_, idx) => idx !== i));
  };

  const addButton = () => {
    onChange([...buttons, { text: "", link: "", style: buttons.length === 0 ? "primary" : "secondary" }]);
  };

  return (
    <div className={cn("min-w-0 space-y-3", className)}>
      {label && <GroupLabel>{label}</GroupLabel>}
      {buttons.length === 0 && <p className="text-sm text-muted-foreground">No buttons yet.</p>}
      {buttons.map((button, i) => (
        <ItemCard key={i} title={`Button ${i + 1}`} onRemove={() => removeButton(i)}>
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9.5rem]">
            <Input
              aria-label={`Button ${i + 1} text`}
              value={button.text || ""}
              onChange={(e) => updateButton(i, { text: e.target.value })}
              placeholder="Button text"
            />
            <Input
              aria-label={`Button ${i + 1} link`}
              value={button.link || ""}
              onChange={(e) => updateButton(i, { link: e.target.value })}
              placeholder="Link, e.g. /contact"
            />
            <MutedSelect
              ariaLabel={`Button ${i + 1} style`}
              value={button.style || "primary"}
              onValueChange={(style) => updateButton(i, { style })}
              options={BUTTON_STYLES}
            />
          </div>
        </ItemCard>
      ))}
      <AddButton onClick={addButton}>Add button</AddButton>
    </div>
  );
}

/**
 * An image URL field with upload and library actions. With an image set, a
 * preview carries a menu (Replace, Choose from library, Remove) whose trigger
 * is visible at rest — never a hover reveal (§7).
 */
function ImagePicker({ id, value, onChange }: { id?: string; value: string; onChange: (v: string) => void }) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const { input, uploading, openPicker } = useCmsImageUpload(onChange);

  return (
    <div className="min-w-0 space-y-3">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Image URL"
      />
      {value ? (
        <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-muted/45">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary CMS bucket URLs */}
          <img src={value} alt="" className="max-h-56 w-full object-contain" />
          <div className="absolute top-2 right-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label="Image actions"
                  className="shadow-sm"
                  disabled={uploading}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={openPicker}>
                  <Upload aria-hidden /> Replace…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setLibraryOpen(true)}>
                  <Images aria-hidden /> Choose from library
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => onChange("")}>
                  <Trash2 aria-hidden /> Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ) : (
        // Two equal halves on phones, so neither label wraps or is cut off.
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {/* Icons drop on phones; the words are enough there. */}
          <Button type="button" variant="outline" size="sm" onClick={openPicker} disabled={uploading}>
            <Upload className="h-4 w-4 max-sm:hidden" aria-hidden />
            {uploading ? "Uploading…" : "Upload"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setLibraryOpen(true)}>
            <Images className="h-4 w-4 max-sm:hidden" aria-hidden />
            From library
          </Button>
        </div>
      )}
      {input}
      <ImageLibraryDialog open={libraryOpen} onOpenChange={setLibraryOpen} onSelect={onChange} />
    </div>
  );
}

function CardsSubEditor({
  items,
  onChange,
}: {
  items: CardItem[];
  onChange: (items: CardItem[]) => void;
}) {
  const updateItem = (i: number, patch: Record<string, string | string[]>) => {
    onChange(items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  };

  const removeItem = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i));
  };

  const addItem = () => {
    onChange([...items, { title: "", description: "", link: "", link_text: "", image_alt: "", tags: [] }]);
  };

  return (
    <div className="min-w-0 space-y-3">
      <GroupLabel>Cards</GroupLabel>
      {items.length === 0 && <p className="text-sm text-muted-foreground">No cards yet.</p>}
      {items.map((item, i) => {
        const useIcon = !!item.icon;
        const n = i + 1;
        return (
          <ItemCard key={i} title={`Card ${n}`} onRemove={() => removeItem(i)}>
            <MiniField label="Title">
              <Input
                aria-label={`Card ${n} title`}
                value={item.title || ""}
                onChange={(e) => updateItem(i, { title: e.target.value })}
              />
            </MiniField>
            <MiniField label="Description">
              <MutedTextarea
                aria-label={`Card ${n} description`}
                value={item.description || ""}
                onChange={(e) => updateItem(i, { description: e.target.value })}
                rows={2}
              />
            </MiniField>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <MiniField label="Link">
                <Input
                  aria-label={`Card ${n} link`}
                  value={item.link || ""}
                  onChange={(e) => updateItem(i, { link: e.target.value })}
                  placeholder="/features"
                />
              </MiniField>
              <MiniField label="Link text">
                <Input
                  aria-label={`Card ${n} link text`}
                  value={item.link_text || ""}
                  onChange={(e) => updateItem(i, { link_text: e.target.value })}
                />
              </MiniField>
            </div>
            <MiniField label="Tags">
              <Input
                aria-label={`Card ${n} tags`}
                value={(item.tags || []).join(", ")}
                onChange={(e) => updateItem(i, { tags: e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })}
                placeholder="Comma separated"
              />
            </MiniField>

            <MiniField label="Visual">
              <div
                role="radiogroup"
                aria-label={`Card ${n} visual`}
                className="inline-flex gap-0.5 rounded-full bg-muted/70 p-1"
              >
                {[
                  { label: "Icon", checked: useIcon, onSelect: () => updateItem(i, { icon: item.icon || "checkmark", image: "" }) },
                  { label: "Image", checked: !useIcon, onSelect: () => updateItem(i, { image: item.image || "", icon: "" }) },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    role="radio"
                    aria-checked={opt.checked}
                    onClick={opt.onSelect}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-[0.8125rem] font-medium transition-colors",
                      opt.checked
                        ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </MiniField>

            {useIcon ? (
              // 36px targets on phones fit six to a row, so 22 icons take four rows, not five.
              <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] sm:gap-1.5">
                {CARD_ICON_NAMES.map((name) => {
                  const selected = item.icon === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-label={name}
                      aria-pressed={selected}
                      title={name}
                      onClick={() => updateItem(i, { icon: name })}
                      className={cn(
                        "flex size-9 items-center justify-center justify-self-center rounded-full transition-colors sm:size-10 [&_svg]:size-5",
                        selected
                          ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {CARD_ICONS[name]}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="min-w-0 space-y-3">
                <ImagePicker value={item.image || ""} onChange={(v) => updateItem(i, { image: v })} />
                <MiniField label="Image alt text">
                  <Input
                    aria-label={`Card ${n} image alt text`}
                    value={item.image_alt || ""}
                    onChange={(e) => updateItem(i, { image_alt: e.target.value })}
                  />
                </MiniField>
              </div>
            )}
          </ItemCard>
        );
      })}
      <AddButton onClick={addItem}>Add card</AddButton>
    </div>
  );
}

/** A row with exactly one cell per column: missing cells padded, extra cells dropped. */
function fitRow(row: string[], width: number) {
  return Array.from({ length: width }, (_, i) => row[i] ?? "");
}

/**
 * The comparison table. Columns and rows change together, so every edit is
 * one `onChange` with both: two separate section updates each start from the
 * same props, and the second would overwrite the first. Every row is kept
 * exactly as wide as the column list, because the public table renders every
 * cell a row holds.
 */
function CompareEditor({
  columns,
  rows,
  onChange,
}: {
  columns: string[];
  rows: string[][];
  onChange: (patch: { compare_columns: string[]; compare_rows: string[][] }) => void;
}) {
  const commit = (nextColumns: string[], nextRows: string[][]) => {
    onChange({
      compare_columns: nextColumns,
      compare_rows: nextRows.map((row) => fitRow(row, nextColumns.length)),
    });
  };

  const updateColumn = (colIdx: number, value: string) => {
    commit(columns.map((column, idx) => (idx === colIdx ? value : column)), rows);
  };

  const addColumn = () => {
    commit([...columns, ""], rows);
  };

  const removeColumn = (colIdx: number) => {
    commit(
      columns.filter((_, idx) => idx !== colIdx),
      rows.map((row) => fitRow(row, columns.length).filter((_, idx) => idx !== colIdx))
    );
  };

  const updateCell = (rowIdx: number, colIdx: number, value: string) => {
    commit(
      columns,
      rows.map((row, ri) => (ri === rowIdx ? fitRow(row, columns.length).map((c, ci) => (ci === colIdx ? value : c)) : row))
    );
  };

  const addRow = () => {
    commit(columns, [...rows, columns.map(() => "")]);
  };

  const removeRow = (i: number) => {
    commit(columns, rows.filter((_, idx) => idx !== i));
  };

  return (
    <div className="min-w-0 space-y-6">
      <div className="min-w-0 space-y-3">
        <GroupLabel>Comparison columns</GroupLabel>
        <div className="grid min-w-0 gap-3 rounded-2xl bg-muted/30 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3">
          {columns.map((column, ci) => (
            <label key={ci} className="block min-w-0 space-y-1.5">
              <span className="text-xs text-muted-foreground">{ci === 0 ? "Label column" : `Column ${ci + 1}`}</span>
              <span className="flex min-w-0 items-center gap-1">
                <Input value={column} onChange={(e) => updateColumn(ci, e.target.value)} />
                {columns.length > 1 && (
                  <IconAction label={`Remove column ${ci + 1}`} destructive onClick={() => removeColumn(ci)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </IconAction>
                )}
              </span>
            </label>
          ))}
        </div>
        <AddButton onClick={addColumn}>Add column</AddButton>
      </div>

      <div className="min-w-0 space-y-3">
        <GroupLabel>Comparison rows</GroupLabel>
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No rows yet.</p>}
        {rows.map((row, ri) => (
          <ItemCard key={ri} title={`Row ${ri + 1}`} onRemove={() => removeRow(ri)}>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fitRow(row, columns.length).map((cell, ci) => (
                <label key={ci} className="block min-w-0 space-y-1.5">
                  <span className="block truncate text-xs text-muted-foreground">{columns[ci] || `Column ${ci + 1}`}</span>
                  <Input value={cell} onChange={(e) => updateCell(ri, ci, e.target.value)} />
                </label>
              ))}
            </div>
          </ItemCard>
        ))}
        <AddButton onClick={addRow}>Add row</AddButton>
      </div>
    </div>
  );
}
