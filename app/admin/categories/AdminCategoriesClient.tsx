"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
}

interface FlatCategory extends Category {
  depth: number;
}

export default function AdminCategoriesClient({
  categories,
  allCategories,
}: {
  categories: FlatCategory[];
  allCategories: Category[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", parent_id: "", sort_order: "0" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => setForm({ name: "", slug: "", parent_id: "", sort_order: "0" });

  const startCreate = () => {
    resetForm();
    setCreating(true);
    setEditing(null);
    setError("");
  };

  const startEdit = (cat: Category) => {
    setForm({ name: cat.name, slug: cat.slug, parent_id: cat.parent_id || "", sort_order: String(cat.sort_order) });
    setEditing(cat.id);
    setCreating(false);
    setError("");
  };

  const save = async (id?: string) => {
    if (!form.name || !form.slug) { setError("Name and slug are required"); return; }
    setSaving(true);
    setError("");
    const body = {
      ...(id ? { id } : {}),
      name: form.name,
      slug: form.slug,
      parent_id: form.parent_id || null,
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
      setEditing(null);
      setCreating(false);
      resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete category "${name}"? Pages in this category will remain but their category will be cleared.`)) return;
    try {
      const res = await fetch(`/api/cms/categories?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.refresh();
    } catch {
      setError("Failed to delete category");
    }
  };

  return (
    <div>
      {error && <p className="admin-error">{error}</p>}

      <div className="admin-cat-list">
        {categories.map((cat) => (
          <div key={cat.id} className="admin-cat-row" style={{ paddingLeft: 20 + cat.depth * 24 }}>
            {editing === cat.id ? (
              <div className="admin-cat-edit">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" />
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.replace(/[^a-z0-9-]/g, "") })} placeholder="slug" />
                <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
                  <option value="">No parent</option>
                  {allCategories.filter((c) => c.id !== cat.id).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} placeholder="Order" className="admin-cat-order" />
                <div className="admin-cat-actions">
                  <button className="admin-cat-btn" onClick={() => save(cat.id)} disabled={saving}>{saving ? "..." : "Save"}</button>
                  <button className="admin-cat-btn admin-cat-cancel" onClick={() => { setEditing(null); setError(""); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <span className={`admin-cat-depth-indicator ${cat.depth === 0 ? "root" : ""}`}>
                  {cat.depth > 0 && <span className="admin-cat-connector">└─</span>}
                  <span className="admin-cat-name">{cat.name}</span>
                  <span className="admin-cat-slug">{cat.slug}</span>
                </span>
                <div className="admin-cat-actions">
                  <button className="admin-cat-btn" onClick={() => startEdit(cat)}>Edit</button>
                  <button className="admin-cat-btn admin-cat-danger" onClick={() => remove(cat.id, cat.name)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
        {categories.length === 0 && !creating && (
          <p style={{ color: "var(--slate-500)", padding: 24 }}>No categories yet.</p>
        )}
      </div>

      {creating ? (
        <div className="admin-cat-create">
          <h3>New Category</h3>
          <div className="admin-cat-edit">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Category name" />
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.replace(/[^a-z0-9-]/g, "") })} placeholder="slug" />
            <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
              <option value="">No parent (top-level)</option>
              {allCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} placeholder="Sort order" className="admin-cat-order" />
            <div className="admin-cat-actions">
              <button className="admin-cat-btn" onClick={() => save()} disabled={saving}>{saving ? "Saving..." : "Create"}</button>
              <button className="admin-cat-btn admin-cat-cancel" onClick={() => { setCreating(false); setError(""); }}>Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <button className="admin-cat-add-btn" onClick={startCreate}>+ Add Category</button>
      )}
    </div>
  );
}
