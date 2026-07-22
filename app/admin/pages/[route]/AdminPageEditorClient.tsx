"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SectionEditor from "@/components/cms/SectionEditor";
import { Section } from "@/lib/cms/cms-sections";

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

interface PageData {
  route: string;
  cms_title: string;
  title: string;
  description: string;
  category: string;
  sections: Section[];
  published: boolean;
  isNew?: boolean;
}

export default function AdminPageEditorClient({
  data: initial,
}: {
  data: PageData;
}) {
  const [data, setData] = useState<PageData>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const router = useRouter();
  const isNewRef = useRef(initial.isNew);
  const originalRouteRef = useRef(initial.route);
  const latestData = useRef(data);

  useEffect(() => {
    fetch("/api/cms/categories")
      .then((r) => r.json())
      .then((d) => { if (d.categories) setCategories(d.categories); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    latestData.current = data;
  }, [data]);

  const executeSave = useCallback(async (publish: boolean) => {
    const d = latestData.current;
    const newRoute = d.route;
    if (!newRoute || newRoute === "/new") {
      setError("Page route is required");
      return false;
    }
    setSaving(true);
    setError("");
    try {
      // Always PUT to the original route so the API knows which page to migrate
      const originalSlug = originalRouteRef.current.replace(/^\/+/, "") || "root";
      const res = await fetch(`/api/cms/pages/${encodeURIComponent(originalSlug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cms_title: d.cms_title, title: d.title, description: d.description, category: d.category, sections: d.sections, published: publish, route: newRoute }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to save page");
      }

      await res.json();

      // If route changed, redirect to new editor URL
      if (!isNewRef.current && newRoute !== originalRouteRef.current) {
        originalRouteRef.current = newRoute;
        const newSlug = newRoute.replace(/^\/+/, "") || "root";
        router.push(`/admin/pages/${encodeURIComponent(newSlug)}`);
        router.refresh();
      } else if (isNewRef.current) {
        isNewRef.current = false;
        originalRouteRef.current = newRoute;
        const slug = newRoute.replace(/^\/+/, "") || "root";
        router.push(`/admin/pages/${encodeURIComponent(slug)}`);
        router.refresh();
      }

      setLastSaved(new Date().toLocaleTimeString());
      setData((prev) => ({ ...prev, published: publish }));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save page");
      return false;
    } finally {
      setSaving(false);
    }
  }, [router]);

  const update = (key: string, value: string | boolean | Section[]) => {
    setData((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const previewUrl = `${data.route === "/" ? "/" : data.route}?cmsPreview=1`;

  return (
    <div className="admin-editor">
      <div className="admin-editor-header">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/admin/pages">&larr; Pages</Link>
          <h1 style={{ margin: 0 }}>{data.isNew ? "New Page" : `Edit: ${data.route}`}</h1>
        </div>
        <div className="page-status-bar">
          <span className={`page-status-badge ${data.published ? "published" : "draft"}`}>
            {data.published ? "Published" : "Draft"}
          </span>
          {lastSaved && <span className="page-status-time">Saved {lastSaved}</span>}
        </div>
      </div>

      {error && <p className="error" style={{ marginBottom: 16 }}>{error}</p>}

      <div className="field">
        <label>Page Route</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "var(--slate-400)", fontSize: "0.9rem" }}>/</span>
          <input
            value={data.route.replace(/^\//, "")}
            onChange={(e) => update("route", "/" + e.target.value.replace(/^\//, ""))}
            placeholder="page-route"
          />
          {!data.isNew && (
            <span style={{ fontSize: "0.75rem", color: "var(--slate-400)" }}>
              Changing this will move the page to a new URL
            </span>
          )}
        </div>
      </div>

      <div className="field">
        <label>Title (admin only)</label>
        <input value={data.cms_title} onChange={(e) => update("cms_title", e.target.value)} placeholder="Internal reference name" />
      </div>

      <div className="field">
        <label>Title (SEO)</label>
        <input value={data.title} onChange={(e) => update("title", e.target.value)} />
      </div>

      <div className="field">
        <label>Meta Description (SEO)</label>
        <textarea
          value={data.description}
          onChange={(e) => update("description", e.target.value)}
        />
      </div>

      <div className="field">
        <label>Category</label>
        <select value={data.category} onChange={(e) => update("category", e.target.value)}>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.slug}>{cat.name}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Content Sections</label>
        <SectionEditor
          sections={data.sections || []}
          onChange={(sections) => update("sections", sections)}
        />
      </div>

      <div className="admin-actions">
        <div className="admin-actions-left">
          <button className="btn btn-secondary" onClick={() => executeSave(false)} disabled={saving}>
            {saving ? "Saving..." : "Save Draft"}
          </button>
          <button className="btn btn-primary" onClick={() => executeSave(true)} disabled={saving}>
            {saving ? "Publishing..." : "Publish"}
          </button>
        </div>
        <div className="admin-actions-right">
          {!data.isNew && (
            <Link href={previewUrl} target="_blank" className="btn-preview">
              Preview
            </Link>
          )}
          <Link href="/admin/pages" className="btn-cancel">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
