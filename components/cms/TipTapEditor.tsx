"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExt from "@tiptap/extension-image";
import LinkExt from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import CmsImageActions from "./CmsImageActions";

interface TipTapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export default function TipTapEditor({
  content,
  onChange,
  placeholder,
}: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      ImageExt,
      LinkExt.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder || "Start writing..." }),
    ],
    immediatelyRender: false,
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) return null;

  const toggle = (fn: () => void) => fn();

  return (
    <div className="tiptap-editor">
      <div className="tiptap-toolbar">
        <button
          type="button"
          onClick={() => toggle(() => editor.chain().focus().toggleBold().run())}
          className={editor.isActive("bold") ? "is-active" : ""}
          aria-label="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          onClick={() => toggle(() => editor.chain().focus().toggleItalic().run())}
          className={editor.isActive("italic") ? "is-active" : ""}
          aria-label="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          onClick={() => toggle(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}
          className={editor.isActive("heading", { level: 2 }) ? "is-active" : ""}
          aria-label="Heading"
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => toggle(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}
          className={editor.isActive("heading", { level: 3 }) ? "is-active" : ""}
          aria-label="Subheading"
        >
          H3
        </button>
        <button
          type="button"
          onClick={() => toggle(() => editor.chain().focus().toggleBulletList().run())}
          className={editor.isActive("bulletList") ? "is-active" : ""}
          aria-label="Bullet list"
        >
          • list
        </button>
        <button
          type="button"
          onClick={() => toggle(() => editor.chain().focus().toggleOrderedList().run())}
          className={editor.isActive("orderedList") ? "is-active" : ""}
          aria-label="Numbered list"
        >
          1. list
        </button>
        <button
          type="button"
          onClick={() => {
            const url = window.prompt("Link URL:");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
          className={editor.isActive("link") ? "is-active" : ""}
          aria-label="Link"
        >
          🔗
        </button>
        <CmsImageActions
          className="is-toolbar"
          uploadLabel="Upload image"
          libraryLabel="Image library"
          onSelect={(url) => {
            editor.chain().focus().setImage({ src: url }).run();
          }}
        />
        <button
          type="button"
          onClick={() => {
            const attrs = editor.getAttributes("image");
            if (!attrs.src) return;
            const alt = window.prompt("Image alt text:", attrs.alt || "") ?? attrs.alt;
            const title = window.prompt("Image title:", attrs.title || "") ?? attrs.title;
            editor.chain().focus().updateAttributes("image", { alt, title }).run();
          }}
          disabled={!editor.isActive("image")}
          aria-label="Edit image alt text"
        >
          Alt
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
