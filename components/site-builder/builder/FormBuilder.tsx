"use client";

import { ChevronDown, ChevronUp, Inbox, Pencil, Plus, Rocket, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PublishForm, SaveFormDraft } from "@/app/dashboard/website/actions/forms";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { FormDocument } from "@/lib/site-builder/forms/document";
import {
  FIELD_REGISTRY,
  FORM_FIELD_KINDS,
  fieldLabel,
  type FormField,
  type FormFieldKind,
} from "@/lib/site-builder/forms/fields";
import {
  addField,
  moveFieldBy,
  removeField,
  updateFieldProps,
  updateFormMeta,
} from "@/lib/site-builder/forms/mutations";
import { cn } from "@/lib/utils";
import PublicForm from "../forms/PublicForm";
import { googleFontsHref } from "@/lib/site-builder/fonts";
import { themeToCssVars, type ThemeTokens } from "@/lib/site-builder/render-context";
import { websiteRoutes } from "../routes";
import OverlayChrome, { OverlayRail, OverlayStage } from "../shell/OverlayChrome";
import {
  FORM_INPUT_CLASS as INPUT_CLASS,
  FormTextInput as TextInput,
  useTextDraft,
} from "./FormTextInput";
import { SectionIcon } from "./section-icons";

/**
 * The form builder.
 *
 * **It is the page builder**, and that is the point rather than a coincidence:
 * the same `OverlayChrome`, the same left rail, the same gutter controls, the
 * same single `Publish`. A merchant who has edited one page already knows how
 * to operate this. If the form builder looked different we would have
 * duplicated the work *and* doubled what they have to learn.
 *
 * Each field is a "section" in exactly the sense the page editor means it —
 * pick it in the rail, edit it in a drawer, move it with the arrows.
 *
 * The preview is the **real** `PublicForm`, the same component a visitor gets,
 * with `interactive={false}` so the merchant cannot post a fake lead into their
 * own inbox while laying it out. One implementation of the markup, which cannot
 * drift from what is served.
 *
 * **And now the real theme with it.** `PublicForm` styles itself entirely from
 * `--site-brand`, `--site-radius` and the rest, and nothing in this screen
 * defined them — so the preview rendered in the dashboard's own theme with
 * square inputs, and the Send button, whose background is `var(--site-brand)`,
 * came out as grey text on white and read as disabled. The tokens are applied
 * here rather than by importing `SiteChrome`, which would drag the whole
 * server-rendered section graph into this client bundle.
 */
export default function FormBuilder({
  clerkOrgId,
  formId,
  locationId,
  initialDoc,
  initialRevision,
  initialPublishedAt,
  submissionCount,
  theme,
}: {
  clerkOrgId: string;
  formId: string;
  locationId: string;
  initialDoc: FormDocument;
  initialRevision: number;
  initialPublishedAt: string | null;
  submissionCount: number;
  /** The site's resolved design tokens, for the preview. */
  theme: ThemeTokens;
}) {
  const [doc, setDoc] = useState(initialDoc);
  const [revision, setRevision] = useState(initialRevision);
  const [publishedAt, setPublishedAt] = useState(initialPublishedAt);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const dirty = useAutosave({ clerkOrgId, formId, doc, revision, setRevision });

  const apply = useCallback(
    (result: ReturnType<typeof addField>) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setDoc(result.doc);
    },
    [],
  );

  const selected = doc.fields.find((field) => field.id === selectedId) ?? null;
  const fontsHref = googleFontsHref([theme.fontFamily, theme.headingFont]);

  const publish = async () => {
    setPublishing(true);
    try {
      const result = await PublishForm(clerkOrgId, formId);
      if (!result.data) {
        toast.error(result.error ?? "Could not publish the form.");
        return;
      }
      setPublishedAt(result.data.publishedAt);
      toast.success(
        // What publishing a form actually means is not obvious, so it is said
        // rather than assumed: the definition visitors fill in is now this one.
        "Published. Guests now see this version of the form.",
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <OverlayChrome
      title={doc.title}
      onTitleClick={() => {
        setSelectedId(null);
        setMetaOpen(true);
      }}
      closeHref={websiteRoutes.forms(locationId)}
      aside={
        <Button variant="outline" size="sm" asChild>
          <a href={websiteRoutes.formSubmissions(formId, locationId)}>
            <Inbox className="size-4" />
            {submissionCount > 0 ? `Responses (${submissionCount})` : "Responses"}
          </a>
        </Button>
      }
      action={
        <Button size="sm" disabled={publishing} onClick={publish}>
          {publishing ? "Publishing…" : publishedAt ? "Publish changes" : "Publish"}
          <Rocket className="size-4" />
        </Button>
      }
    >
      <div className="flex h-full min-h-0">
        {selected ? (
          <FieldSettings
            key={selected.id}
            field={selected}
            onChange={(patch) => apply(updateFieldProps(doc, selected.id, patch))}
            onDone={() => setSelectedId(null)}
          />
        ) : metaOpen ? (
          <FormSettings
            doc={doc}
            onChange={(patch) => setDoc(updateFormMeta(doc, patch))}
            onDone={() => setMetaOpen(false)}
          />
        ) : (
          <FieldList
            doc={doc}
            onSelect={setSelectedId}
            onAdd={() => setAddOpen(true)}
            onRemove={(id) => apply(removeField(doc, id))}
            onMove={(id, delta) => apply(moveFieldBy(doc, id, delta))}
          />
        )}

        <OverlayStage>
          {/* The typefaces the theme actually names, so the specimen is not a
              lie about the shape of the words. */}
          {fontsHref && (
            <link rel="stylesheet" href={fontsHref} precedence="site-form-preview-fonts" />
          )}
          <div
            style={{
              ...themeToCssVars(theme),
              background: "var(--site-surface)",
              color: "var(--site-text)",
              fontFamily: "var(--site-font)",
            }}
            className="mx-auto max-w-xl rounded-xl border p-6 shadow-sm"
          >
            <h2
              className="text-xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--site-heading-font)" }}
            >
              {doc.title}
            </h2>
            {doc.intro && (
              <p className="mt-2 text-sm" style={{ color: "var(--site-text-muted)" }}>
                {doc.intro}
              </p>
            )}
            <div className="mt-6">
              <PublicForm formId={formId} siteId="" doc={doc} interactive={false} />
            </div>
          </div>

          {!publishedAt && (
            <p className="mx-auto mt-4 max-w-xl text-center text-xs text-muted-foreground">
              This form has never been published, so it collects nothing yet — even on a page that is
              live.
            </p>
          )}
          {dirty && (
            <p className="mx-auto mt-2 max-w-xl text-center text-xs text-muted-foreground">
              Saving your changes…
            </p>
          )}
        </OverlayStage>
      </div>

      <AddFieldDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        present={new Set(doc.fields.map((f) => f.kind))}
        onAdd={(kind) => {
          const result = addField(doc, kind);
          apply(result);
          setAddOpen(false);
          if (result.ok) {
            const added = result.doc.fields.find((f) => !doc.fields.some((o) => o.id === f.id));
            if (added) setSelectedId(added.id);
          }
        }}
      />
    </OverlayChrome>
  );
}

/**
 * Debounced draft saving, on the same optimistic-concurrency contract as the
 * page editor: a stale `revision` matches zero rows rather than clobbering
 * another tab, and the merchant is told rather than left to discover it.
 */
function useAutosave({
  clerkOrgId,
  formId,
  doc,
  revision,
  setRevision,
}: {
  clerkOrgId: string;
  formId: string;
  doc: FormDocument;
  revision: number;
  setRevision: (revision: number) => void;
}): boolean {
  const [dirty, setDirty] = useState(false);
  const first = useRef(true);

  /**
   * The revision is the one value the timer cannot read from its own closure:
   * it changes when a *save completes*, not when the merchant edits, so a
   * closure captured at edit time would post a stale one and be refused.
   *
   * Mirrored through an effect rather than assigned during render — writing a
   * ref while rendering is the rules-of-React violation React's own lint rule
   * objects to, and it makes the value depend on when a re-render happened to
   * occur.
   */
  const revisionRef = useRef(revision);
  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);

  useEffect(() => {
    // The first render is the document as loaded; saving it straight back would
    // burn a revision and make merely opening the form look like an edit.
    if (first.current) {
      first.current = false;
      return;
    }

    setDirty(true);
    // `doc` comes from this effect's own closure, which is always the latest —
    // the effect re-runs on every document change, which is what schedules the
    // debounce in the first place.
    const timer = setTimeout(async () => {
      const result = await SaveFormDraft(clerkOrgId, formId, doc, revisionRef.current);

      if (result.data) {
        setRevision(result.data.revision);
      } else if (result.code === "stale_revision") {
        toast.error(result.error ?? "This form was changed somewhere else.");
      } else if (result.error) {
        toast.error(result.error);
      }
      setDirty(false);
    }, 800);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, clerkOrgId, formId]);

  return dirty;
}

function FieldList({
  doc,
  onSelect,
  onAdd,
  onRemove,
  onMove,
}: {
  doc: FormDocument;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: number) => void;
}) {
  return (
    <OverlayRail
      footer={
        <Button variant="outline" size="sm" className="w-full" onClick={onAdd}>
          <Plus className="size-4" />
          Add Field
        </Button>
      }
    >
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Fields</h2>
        <p className="text-xs text-muted-foreground">The questions guests answer, in order.</p>
      </div>

      {doc.fields.length === 0 ? (
        <p className="px-4 py-6 text-xs text-muted-foreground">
          No fields yet. Add one to start collecting answers.
        </p>
      ) : (
        <ul className="divide-y">
          {doc.fields.map((field, index) => (
            <li key={field.id} className="group flex items-center gap-1.5 px-2 py-2">
              <SectionIcon
                name={FIELD_REGISTRY[field.kind].icon}
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => onSelect(field.id)}
                className="min-w-0 flex-1 truncate text-left text-xs hover:underline"
              >
                {fieldLabel(field)}
                {(field.props as { required?: boolean }).required && (
                  <span aria-hidden className="ml-0.5 text-destructive">
                    *
                  </span>
                )}
              </button>

              <GutterButton
                label={`Edit ${fieldLabel(field)}`}
                onClick={() => onSelect(field.id)}
                icon={<Pencil className="size-3" />}
              />
              <GutterButton
                label={`Move ${fieldLabel(field)} up`}
                disabled={index === 0}
                onClick={() => onMove(field.id, -1)}
                icon={<ChevronUp className="size-3" />}
              />
              <GutterButton
                label={`Move ${fieldLabel(field)} down`}
                disabled={index === doc.fields.length - 1}
                onClick={() => onMove(field.id, 1)}
                icon={<ChevronDown className="size-3" />}
              />
              <GutterButton
                label={`Remove ${fieldLabel(field)}`}
                onClick={() => onRemove(field.id)}
                icon={<Trash2 className="size-3" />}
                destructive
              />
            </li>
          ))}
        </ul>
      )}
    </OverlayRail>
  );
}

function GutterButton({
  label,
  icon,
  onClick,
  disabled,
  destructive,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30",
        destructive && "hover:text-destructive",
      )}
    >
      {icon}
    </button>
  );
}

/** One field's own settings. Generated from the kind, like the page editor's drawer. */
function FieldSettings({
  field,
  onChange,
  onDone,
}: {
  field: FormField;
  onChange: (patch: Record<string, unknown>) => void;
  onDone: () => void;
}) {
  const def = FIELD_REGISTRY[field.kind];
  const props = field.props as Record<string, unknown>;
  const isLayout = def.role === "layout";
  const isChoice = field.kind === "single-choice" || field.kind === "multiple-choice";

  return (
    <OverlayRail
      footer={
        <Button size="sm" className="w-full" onClick={onDone}>
          Done
        </Button>
      }
    >
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{def.label}</h2>
        <p className="text-xs text-muted-foreground">{def.description}</p>
      </div>

      <div className="space-y-4 p-4">
        {isLayout ? (
          <TextInput
            label={field.kind === "heading" ? "Heading" : "Text"}
            value={String(props.text ?? "")}
            multiline={field.kind === "paragraph"}
            maxLength={field.kind === "paragraph" ? 300 : 100}
            onChange={(text) => onChange({ text })}
          />
        ) : (
          <>
            <TextInput
              label="Question"
              value={String(props.label ?? "")}
              maxLength={100}
              onChange={(label) => onChange({ label })}
            />

            <TextInput
              label="Help text"
              value={String(props.help ?? "")}
              optional
              maxLength={300}
              onChange={(help) => onChange({ help: help || undefined })}
            />

            {!isChoice && (
              <TextInput
                label="Placeholder"
                value={String(props.placeholder ?? "")}
                optional
                maxLength={100}
                onChange={(placeholder) => onChange({ placeholder: placeholder || undefined })}
              />
            )}

            {isChoice && (
              <OptionsEditor
                options={Array.isArray(props.options) ? (props.options as string[]) : []}
                onChange={(options) => onChange({ options })}
              />
            )}

            {field.kind === "text" && (
              <ToggleRow
                label="Long answer"
                description="Shows a box several lines tall instead of one."
                checked={props.multiline === true}
                onChange={(multiline) => onChange({ multiline })}
              />
            )}

            {field.kind === "datetime" && (
              <ToggleRow
                label="Include a time"
                description="Ask for a time of day as well as a date."
                checked={props.mode === "datetime"}
                onChange={(on) => onChange({ mode: on ? "datetime" : "date" })}
              />
            )}

            <ToggleRow
              label="Required"
              description="Guests cannot send the form without answering."
              checked={props.required === true}
              onChange={(required) => onChange({ required })}
            />
          </>
        )}
      </div>
    </OverlayRail>
  );
}

/** The form's own title, intro, button label, confirmation and notifications. */
function FormSettings({
  doc,
  onChange,
  onDone,
}: {
  doc: FormDocument;
  onChange: (patch: Partial<FormDocument>) => void;
  onDone: () => void;
}) {
  return (
    <OverlayRail
      footer={
        <Button size="sm" className="w-full" onClick={onDone}>
          Done
        </Button>
      }
    >
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Form settings</h2>
        <p className="text-xs text-muted-foreground">Its heading, and what happens after sending.</p>
      </div>

      <div className="space-y-4 p-4">
        <TextInput
          label="Form name"
          value={doc.title}
          maxLength={100}
          onChange={(title) => onChange({ title })}
        />
        <TextInput
          label="Intro"
          value={doc.intro ?? ""}
          multiline
          optional
          maxLength={500}
          onChange={(intro) => onChange({ intro: intro || undefined })}
        />
        <TextInput
          label="Button label"
          value={doc.settings.submitLabel}
          maxLength={40}
          onChange={(submitLabel) =>
            onChange({ settings: { ...doc.settings, submitLabel: submitLabel || "Send" } })
          }
        />
        <TextInput
          label="Thank-you message"
          value={doc.confirmation.message}
          multiline
          maxLength={500}
          onChange={(message) => onChange({ confirmation: { message } })}
        />

        <div>
          <TextInput
            label="Notify these addresses"
            value={doc.settings.notifyEmails.join(", ")}
            optional
            maxLength={1274}
            onChange={(value) =>
              onChange({
                settings: {
                  ...doc.settings,
                  notifyEmails: value
                    .split(",")
                    .map((email) => email.trim())
                    .filter(Boolean)
                    .slice(0, 5),
                },
              })
            }
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            Separate addresses with commas. With none, responses wait in the inbox until you look —
            which is how a catering enquiry gets missed.
          </p>
        </div>
      </div>
    </OverlayRail>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium">Options</span>
      <div className="space-y-1.5">
        {options.map((option, index) => (
          <div key={index} className="flex gap-1.5">
            <OptionTextInput
              value={option}
              index={index}
              onChange={(next) =>
                onChange(options.map((current, i) => (i === index ? next : current)))
              }
            />
            <button
              type="button"
              aria-label={`Remove ${option}`}
              // The last option is not removable: a choice field with no
              // options renders as a question nobody can answer, and the
              // schema refuses it anyway — better to not offer the button.
              disabled={options.length <= 1}
              onClick={() => onChange(options.filter((_, i) => i !== index))}
              className="rounded p-1.5 text-muted-foreground hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 h-7 w-full text-[11px]"
        disabled={options.length >= 20}
        onClick={() => onChange([...options, `Option ${options.length + 1}`])}
      >
        <Plus className="size-3" />
        Add option
      </Button>
    </div>
  );
}

function OptionTextInput({
  value,
  index,
  onChange,
}: {
  value: string;
  index: number;
  onChange: (value: string) => void;
}) {
  const draft = useTextDraft(value, onChange);
  return (
    <input
      type="text"
      aria-label={`Option ${index + 1}`}
      value={draft.value}
      maxLength={80}
      onFocus={draft.onFocus}
      onBlur={draft.onBlur}
      onChange={(event) => draft.onChange(event.target.value)}
      className={INPUT_CLASS}
    />
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-xs font-medium">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

/**
 * The field catalogue.
 *
 * The same two-column grid as Add Section, with a singleton already on the form
 * shown as unavailable and saying why — the merchant learns the rule rather
 * than hitting it.
 */
function AddFieldDialog({
  open,
  onOpenChange,
  present,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  present: Set<FormFieldKind>;
  onAdd: (kind: FormFieldKind) => void;
}) {
  const [chosen, setChosen] = useState<FormFieldKind>("name");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Field</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FORM_FIELD_KINDS.map((kind) => {
            const def = FIELD_REGISTRY[kind];
            const blocked = def.singleton && present.has(kind);

            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={chosen === kind}
                disabled={blocked}
                title={
                  blocked
                    ? `This form already asks for a ${def.label.toLowerCase()}.`
                    : def.description
                }
                onClick={() => setChosen(kind)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  blocked && "cursor-not-allowed opacity-50",
                  !blocked && chosen === kind && "border-primary/40 bg-accent font-medium",
                  !blocked && chosen !== kind && "hover:border-foreground/25 hover:bg-accent/40",
                )}
              >
                <SectionIcon name={def.icon} className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{def.label}</span>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button onClick={() => onAdd(chosen)}>
            Add
            <Plus className="size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

