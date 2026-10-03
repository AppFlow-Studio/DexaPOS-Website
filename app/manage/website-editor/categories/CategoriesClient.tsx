"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Field, MutedSelect } from "@/components/cms/cms-fields";
import { ConfirmDialog, Panel, PanelSection } from "@/components/dashboard/shell";
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

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
}

export interface FlatCategory extends Category {
  depth: number;
}

const NO_PARENT = "none";
const EMPTY_FORM = { name: "", slug: "", parent_id: NO_PARENT, sort_order: "0" };

type Editing = { mode: "create" } | { mode: "edit"; category: Category };

/**
 * Page categories as an indented tree. Create and edit open a centred dialog
 * (UI-DESIGN-SYSTEM §12); delete confirms in a `ConfirmDialog`, which stays a
 * small centred card on phones (§13.1).
 */
export function CategoriesClient({
  categories,
  allCategories,
  pageCounts,
}: {
  categories: FlatCategory[];
  allCategories: Category[];
  pageCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setError("");
    setEditing({ mode: "create" });
  };

  const startEdit = (cat: Category) => {
    setForm({
      name: cat.name,
      slug: cat.slug,
      parent_id: cat.parent_id || NO_PARENT,
      sort_order: String(cat.sort_order),
    });
    setError("");
    setEditing({ mode: "edit", category: cat });
  };

  const save = async () => {
    if (!editing) return;
    if (!form.name.trim() || !form.slug) {
      setError("Name and slug are both required.");
      return;
    }
    setSaving(true);
    setError("");
    const id = editing.mode === "edit" ? editing.category.id : undefined;
    const body = {
      ...(id ? { id } : {}),
      name: form.name.trim(),
      slug: form.slug,
      parent_id: form.parent_id === NO_PARENT ? null : form.parent_id,
      sort_order: parseInt(form.sort_order) || 0,
    };
    try {
      const res = await fetch("/api/cms/categories", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || "Failed to save");
      }
      toast.success(id ? "Category updated" : "Category created");
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (cat: Category) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/cms/categories?id=${cat.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`Deleted ${cat.name}`);
      router.refresh();
    } catch {
      toast.error("Couldn't delete the category");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const editingId = editing?.mode === "edit" ? editing.category.id : null;
  const parentOptions = [
    { value: NO_PARENT, label: "No parent (top level)" },
    ...allCategories.filter((c) => c.id !== editingId).map((c) => ({ value: c.id, label: c.name })),
  ];
  const pendingCount = pendingDelete ? pageCounts[pendingDelete.slug] || 0 : 0;
  const pendingHasChildren = !!pendingDelete && allCategories.some((c) => c.parent_id === pendingDelete.id);

  return (
    <>
      <Panel>
        <PanelSection
          label="Categories"
          caption="Group pages in the editor. Lower sort numbers come first."
          action={
            <Button className="h-9 px-4 text-[0.8125rem] font-medium" onClick={startCreate}>
              <Plus className="h-4 w-4" aria-hidden />
              Add category
            </Button>
          }
        >
          {categories.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl bg-muted/30 px-4 text-center">
              <p className="text-sm font-medium">No categories yet</p>
              <p className="text-xs text-muted-foreground">Add one to start grouping pages.</p>
            </div>
          ) : (
            <ul className="min-w-0 space-y-2">
              {categories.map((cat) => {
                const count = pageCounts[cat.slug] || 0;
                return (
                  <li
                    key={cat.id}
                    className="flex min-w-0 items-center gap-3 rounded-2xl bg-muted/45 py-3 pr-2 pl-4"
                    // Indent by depth; capped so deep trees still fit a phone.
                    style={{ marginLeft: `${Math.min(cat.depth, 4) * 1.25}rem` }}
                  >
                    {cat.depth > 0 && (
                      <CornerDownRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{cat.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{cat.slug}</span>
                        <span className="tabular-nums">
                          {" · "}
                          {count === 0 ? "No pages" : `${count} ${count === 1 ? "page" : "pages"}`}
                        </span>
                      </p>
                    </div>
                    <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline" title="Sort order">
                      #{cat.sort_order}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label={`Edit ${cat.name}`}
                      title="Edit"
                      onClick={() => startEdit(cat)}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Delete ${cat.name}`}
                      title="Delete"
                      onClick={() => setPendingDelete(cat)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </PanelSection>
      </Panel>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <DialogHeader className="pr-10 text-left">
              <DialogTitle>{editing?.mode === "edit" ? "Edit category" : "New category"}</DialogTitle>
              <DialogDescription>
                {editing?.mode === "edit"
                  ? "Changing the slug does not move pages already filed under the old one."
                  : "Pages are filed under a category by its slug."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="category-name" className="sm:col-span-2">
                <Input
                  id="category-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Category name"
                  autoFocus
                />
              </Field>
              <Field label="Slug" htmlFor="category-slug" hint="Lowercase letters, numbers and hyphens">
                <Input
                  id="category-slug"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.replace(/[^a-z0-9-]/g, "") })}
                  placeholder="slug"
                  className="font-mono"
                />
              </Field>
              <Field label="Sort order" htmlFor="category-order">
                <Input
                  id="category-order"
                  type="number"
                  inputMode="numeric"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                  className="tabular-nums"
                />
              </Field>
              <Field label="Parent" htmlFor="category-parent" className="sm:col-span-2">
                <MutedSelect
                  id="category-parent"
                  value={form.parent_id}
                  onValueChange={(v) => setForm({ ...form, parent_id: v })}
                  options={parentOptions}
                  // The last field: opening upward keeps the list over the form, not past the dialog.
                  side="top"
                />
              </Field>
            </div>

            {error && (
              <p role="alert" className="rounded-2xl bg-muted/60 px-4 py-3 text-sm">
                {error}
              </p>
            )}

            <DialogFooter className="sm:justify-center">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editing?.mode === "edit" ? "Save changes" : "Create category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.name ?? "this category"}?`}
        description={
          <>
            {pendingCount === 0
              ? "No pages are filed under it."
              : `${pendingCount} ${pendingCount === 1 ? "page stays" : "pages stay"} on the site and keep${pendingCount === 1 ? "s" : ""} the slug “${pendingDelete?.slug}” until you move ${pendingCount === 1 ? "it" : "them"}.`}
            {pendingHasChildren && " Its subcategories move to the top level."}
          </>
        }
        confirmLabel="Delete category"
        pendingLabel="Deleting…"
        destructive
        pending={deleting}
        onConfirm={() => {
          if (pendingDelete) void remove(pendingDelete);
        }}
      />
    </>
  );
}
