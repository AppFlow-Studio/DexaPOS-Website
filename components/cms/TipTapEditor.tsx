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
        "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
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

/**
 * Rich-text field for the website editor: a muted rounded field (§4.2) with
 * its toolbar inside. The toolbar is separated by spacing, not a rule (§5.5).
 */
export default function TipTapEditor({ content, onChange, placeholder }: TipTapEditorProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);

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
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 p-1.5">
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
          onClick={() => {
            const url = window.prompt("Link URL:");
            if (url) editor?.chain().focus().setLink({ href: url }).run();
          }}
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
            if (!editor) return;
            const attrs = editor.getAttributes("image");
            if (!attrs.src) return;
            const alt = window.prompt("Image alt text:", attrs.alt || "") ?? attrs.alt;
            const title = window.prompt("Image title:", attrs.title || "") ?? attrs.title;
            editor.chain().focus().updateAttributes("image", { alt, title }).run();
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
    </div>
  );
}
