"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExt from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
} from "lucide-react";

import { ImageLibraryDialog } from "./ImageLibraryDialog";
import { Field } from "./cms-fields";
import { CENTRED_DIALOG } from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TipTapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 min-w-7 items-center justify-center rounded-full px-1.5 text-xs sm:min-w-8 sm:px-2 font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
        // Neutral active state (UI-DESIGN-SYSTEM §4.5) — never a brand fill.
        active
          ? "bg-background text-foreground shadow-sm ring-1 ring-border"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

type DialogField = { key: string; label: string; placeholder?: string };

/**
 * The toolbar's small forms (link URL, image alt text) as a centred dialog
 * rather than `window.prompt` (UI-DESIGN-SYSTEM §12). Mounted only while open,
 * so each opening starts from the editor's current values.
 */
function ToolbarFieldsDialog({
  title,
  description,
  fields,
  initial,
  submitLabel,
  extraAction,
  onSubmit,
  onClose,
}: {
  title: string;
  description: string;
  fields: DialogField[];
  initial: Record<string, string>;
  submitLabel: string;
  extraAction?: { label: string; onClick: () => void };
  onSubmit: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState(initial);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* One or two fields: a centred card on phones too (§13.1). */}
      <DialogContent className={CENTRED_DIALOG}>
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            // React events bubble through the portal; keep this submit out of any outer form.
            e.stopPropagation();
            onSubmit(values);
          }}
        >
          <DialogHeader className="pr-10 text-left">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {fields.map((field, i) => (
              <Field key={field.key} label={field.label} htmlFor={`tiptap-${field.key}`}>
                <Input
                  id={`tiptap-${field.key}`}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                  placeholder={field.placeholder}
                  autoFocus={i === 0}
                />
              </Field>
            ))}
          </div>
          <DialogFooter className="sm:justify-center">
            {extraAction && (
              <Button type="button" variant="ghost" onClick={extraAction.onClick}>
                {extraAction.label}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Rich-text field for the website editor: a muted rounded field (§4.2) with
 * its toolbar inside. The toolbar is separated by spacing, not a rule (§5.5).
 */
export default function TipTapEditor({ content, onChange, placeholder }: TipTapEditorProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [toolbarDialog, setToolbarDialog] = useState<"link" | "image" | null>(null);

  const editor = useEditor({
    extensions: [
      // StarterKit v3 bundles Link; configure it here rather than registering
      // a second copy.
      StarterKit.configure({ link: { openOnClick: false } }),
      ImageExt,
      Placeholder.configure({ placeholder: placeholder || "Start writing…" }),
    ],
    immediatelyRender: false,
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // TipTap v3 no longer re-renders on every transaction, so subscribe to the
  // marks the toolbar reflects; otherwise moving the caret leaves them stale.
  const active = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            h2: editor.isActive("heading", { level: 2 }),
            h3: editor.isActive("heading", { level: 3 }),
            bulletList: editor.isActive("bulletList"),
            orderedList: editor.isActive("orderedList"),
            link: editor.isActive("link"),
            image: editor.isActive("image"),
          }
        : null,
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  return (
    <div className="min-w-0 rounded-2xl bg-muted/60 transition-colors focus-within:bg-background focus-within:ring-[3px] focus-within:ring-ring/50">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0 p-1.5 sm:gap-0.5">
        <ToolbarButton
          label="Bold"
          active={active?.bold}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={active?.italic}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Heading"
          active={active?.h2}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Subheading"
          active={active?.h3}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          active={active?.bulletList}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={active?.orderedList}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          active={active?.link}
          disabled={!editor}
          onClick={() => setToolbarDialog("link")}
        >
          <Link2 className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Insert image" disabled={!editor} onClick={() => setLibraryOpen(true)}>
          <ImagePlus className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Edit image alt text"
          disabled={!active?.image}
          onClick={() => {
            if (editor?.getAttributes("image").src) setToolbarDialog("image");
          }}
        >
          Alt
        </ToolbarButton>
      </div>

      {/* Rendered before the editor mounts too, so the field holds its height. */}
      <EditorContent
        editor={editor}
        className={cn(
          "min-h-32 text-sm leading-relaxed",
          "[&_.ProseMirror]:min-h-32 [&_.ProseMirror]:px-4 [&_.ProseMirror]:pt-1 [&_.ProseMirror]:pb-3 [&_.ProseMirror]:outline-none",
          "[&_.ProseMirror_p]:my-2",
          "[&_.ProseMirror_h2]:mt-4 [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:text-lg [&_.ProseMirror_h2]:font-semibold",
          "[&_.ProseMirror_h3]:mt-3 [&_.ProseMirror_h3]:mb-1.5 [&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:font-semibold",
          "[&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5",
          "[&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5",
          "[&_.ProseMirror_a]:underline [&_.ProseMirror_a]:underline-offset-2",
          "[&_.ProseMirror_img]:my-3 [&_.ProseMirror_img]:h-auto [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:rounded-2xl",
          "[&_.ProseMirror_img.ProseMirror-selectednode]:ring-2 [&_.ProseMirror_img.ProseMirror-selectednode]:ring-ring",
          "[&_.ProseMirror_p.is-editor-empty:first-child]:before:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child]:before:float-left [&_.ProseMirror_p.is-editor-empty:first-child]:before:h-0 [&_.ProseMirror_p.is-editor-empty:first-child]:before:text-muted-foreground [&_.ProseMirror_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]"
        )}
      />

      <ImageLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onSelect={(url) => editor?.chain().focus().setImage({ src: url }).run()}
      />

      {editor && toolbarDialog === "link" && (
        <ToolbarFieldsDialog
          title={active?.link ? "Edit link" : "Add link"}
          description="Links the selected text. Use a path such as /pricing, or a full URL."
          fields={[{ key: "href", label: "URL", placeholder: "/contact or https://" }]}
          initial={{ href: (editor.getAttributes("link").href as string | undefined) ?? "" }}
          submitLabel={active?.link ? "Save link" : "Add link"}
          extraAction={
            active?.link
              ? {
                  label: "Remove link",
                  onClick: () => {
                    editor.chain().focus().extendMarkRange("link").unsetLink().run();
                    setToolbarDialog(null);
                  },
                }
              : undefined
          }
          onSubmit={({ href }) => {
            const url = href.trim();
            const chain = editor.chain().focus().extendMarkRange("link");
            if (url) chain.setLink({ href: url }).run();
            else chain.unsetLink().run();
            setToolbarDialog(null);
          }}
          onClose={() => setToolbarDialog(null)}
        />
      )}

      {editor && toolbarDialog === "image" && (
        <ToolbarFieldsDialog
          title="Image details"
          description="Alt text describes the image for screen readers and search engines."
          fields={[
            { key: "alt", label: "Alt text" },
            { key: "title", label: "Title", placeholder: "Shown on hover" },
          ]}
          initial={{
            alt: (editor.getAttributes("image").alt as string | undefined) ?? "",
            title: (editor.getAttributes("image").title as string | undefined) ?? "",
          }}
          submitLabel="Save"
          onSubmit={({ alt, title }) => {
            editor.chain().focus().updateAttributes("image", { alt, title }).run();
            setToolbarDialog(null);
          }}
          onClose={() => setToolbarDialog(null)}
        />
      )}
    </div>
  );
}
