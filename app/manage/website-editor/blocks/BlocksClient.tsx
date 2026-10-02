"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";

import TipTapEditor from "@/components/cms/TipTapEditor";
import { Field } from "@/components/cms/cms-fields";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { Panel, PanelSection } from "@/components/dashboard/shell";
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
import { useClientPagination } from "@/lib/hooks/useClientPagination";
import { SiteSettingsEditor } from "./SiteSettingsEditor";

export interface Block {
  id: string;
  key: string;
  title: string;
  body_html: string;
  content_json?: unknown;
  published: boolean;
}

const SITE_SETTINGS_KEY = "site-settings";

/**
 * Reusable content blocks and the site-wide settings block. Each opens in a
 * centred editor dialog (UI-DESIGN-SYSTEM §12); a new block uses the same
 * dialog with its key still editable.
 */
export function BlocksClient({ initialBlocks }: { initialBlocks: Block[] }) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [editing, setEditing] = useState<Block | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [saving, setSaving] = useState(false);

  // Site settings first — it is the block that shapes every page.
  const ordered = useMemo(
    () =>
      [...blocks].sort(
        (a, b) => Number(b.key === SITE_SETTINGS_KEY) - Number(a.key === SITE_SETTINGS_KEY) || a.key.localeCompare(b.key)
      ),
    [blocks]
  );
  const { pageRows, pagination, setPage } = useClientPagination(ordered, 10);

  const openBlock = (block: Block) => {
    setEditing({ ...block });
    setIsNew(false);
    setKeyError("");
  };

  const openNew = () => {
    setEditing({ id: "", key: "", title: "", body_html: "", published: true });
    setIsNew(true);
    setKeyError("");
  };

  const save = async () => {
    if (!editing) return;
    const key = editing.key.trim();
    if (!key) {
      setKeyError("Enter a key for the block.");
      return;
    }
    if (isNew && blocks.some((b) => b.key === key)) {
      setKeyError("A block with this key already exists.");
      return;
    }
    setSaving(true);
    try {
      // A new block has no id yet; the API upserts on the key.
      const { id: _id, ...unsaved } = editing;
      const res = await fetch("/api/cms/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? { ...unsaved, key } : editing),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to save");
      }
      const saved = (await res.json()) as Block;
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.key === saved.key);
        if (idx === -1) return [...prev, saved];
        const next = [...prev];
        next[idx] = saved;
        return next;
      });
      toast.success(`Saved ${saved.key}`);
      setEditing(null);
    } catch (err) {
      toast.error("Couldn't save the block", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const isSiteSettings = editing?.key === SITE_SETTINGS_KEY && !isNew;

  return (
    <>
      <Panel>
        <PanelSection
          label="Content blocks"
          caption="Reusable content, plus the navigation and footer settings shared by every page"
          action={
            <Button className="h-9 px-4 text-[0.8125rem] font-medium" onClick={openNew}>
              <Plus className="h-4 w-4" aria-hidden />
              New block
            </Button>
          }
        >
          {ordered.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl bg-muted/30 px-4 text-center">
              <p className="text-sm font-medium">No content blocks yet</p>
              <p className="text-xs text-muted-foreground">Create one with New block.</p>
            </div>
          ) : (
            <ul className="min-w-0 space-y-2">
              {pageRows.map((block) => (
                <li key={block.key}>
                  <button
                    type="button"
                    onClick={() => openBlock(block)}
                    className="flex w-full min-w-0 items-center gap-3 rounded-2xl bg-muted/45 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-sm font-medium">{block.key}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {block.key === SITE_SETTINGS_KEY
                          ? "Logo, navigation, footer and organization details"
                          : block.title || "No title"}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="blocks" />
        </PanelSection>
      </Panel>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-h-[85vh] sm:max-w-3xl">
          <DialogHeader className="px-6 pt-6 pr-14 pb-4 text-left">
            <DialogTitle className={isNew ? undefined : "font-mono"}>
              {isNew ? "New content block" : editing?.key}
            </DialogTitle>
            <DialogDescription>
              {isSiteSettings
                ? "Navigation, footer and organization details used across the site"
                : "Reusable content that pages reference by its key"}
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="thin-scrollbar min-h-0 space-y-6 overflow-y-auto px-6 pb-4">
              {isNew && (
                <Field
                  label="Key"
                  htmlFor="block-key"
                  hint={keyError ? undefined : "How pages refer to this block. It can't be changed later."}
                >
                  <Input
                    id="block-key"
                    value={editing.key}
                    onChange={(e) => {
                      setEditing({ ...editing, key: e.target.value });
                      setKeyError("");
                    }}
                    placeholder="homepage-banner"
                    aria-invalid={!!keyError || undefined}
                    aria-describedby={keyError ? "block-key-error" : undefined}
                    className="font-mono"
                    autoFocus
                  />
                  {keyError && (
                    <p id="block-key-error" className="text-sm text-destructive">
                      {keyError}
                    </p>
                  )}
                </Field>
              )}

              <Field label="Title" htmlFor="block-title">
                <Input
                  id="block-title"
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </Field>

              {isSiteSettings ? (
                <SiteSettingsEditor editing={editing} setEditing={setEditing} />
              ) : (
                <Field label="Content">
                  <TipTapEditor
                    content={editing.body_html}
                    onChange={(html) => setEditing({ ...editing, body_html: html })}
                    placeholder="Write the block's content…"
                  />
                </Field>
              )}
            </div>
          )}

          <DialogFooter className="px-6 pt-2 pb-6">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create block" : "Save block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
