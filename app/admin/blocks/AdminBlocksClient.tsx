"use client";

import { useState } from "react";
import TipTapEditor from "@/components/cms/TipTapEditor";
import { SOCIAL_PLATFORMS } from "@/components/marketing/SocialIcons";

interface Block {
  id: string;
  key: string;
  title: string;
  body_html: string;
  content_json?: unknown;
  published: boolean;
}

export default function AdminBlocksClient({
  initialBlocks,
}: {
  initialBlocks: Block[];
}) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [editing, setEditing] = useState<Block | null>(null);
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState("");

  const saveBlock = async (block: Block) => {
    setSaving(true);
    const res = await fetch("/api/cms/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(block),
    });
    if (res.ok) {
      const saved = await res.json();
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.key === saved.key);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      setEditing(null);
    }
    setSaving(false);
  };

  const createNew = async () => {
    if (!newKey.trim()) return;
    const block = { key: newKey.trim(), title: "", body_html: "", published: true } as Block;
    setEditing(block);
    setNewKey("");
  };

  return (
    <div>
      <div className="admin-head">
        <h1>Content Blocks</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <input
            placeholder="New block key..."
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            style={{
              background: "var(--paper)",
              border: "1px solid var(--slate-200)",
              borderRadius: "var(--radius-md)",
              padding: "10px 14px",
              color: "var(--ink)",
              fontSize: "0.9rem",
              fontFamily: "var(--font)",
              width: 200,
              minHeight: 44,
            }}
          />
          <button
            onClick={createNew}
            style={{
              background: "var(--ink)",
              color: "var(--paper)",
              border: "1px solid var(--ink)",
              borderRadius: 2,
              padding: "10px 20px",
              minHeight: 44,
              fontFamily: "var(--font-display)",
              fontSize: "0.75rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              cursor: "pointer",
            }}
          >
            + New
          </button>
        </div>
      </div>

      {editing && !blocks.find((b) => b.key === editing.key) && (
        <div className="admin-page-row" style={{ flexDirection: "column", gap: 12, alignItems: "stretch", marginBottom: 12 }}>
          <div className="field">
            <label>Key</label>
            <input value={editing.key} disabled style={{ opacity: 0.6 }} />
          </div>
          <div className="field">
            <label>Title</label>
            <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          </div>
          <BlockContentEditor editing={editing} setEditing={setEditing} />
          <div className="admin-actions">
            <button className="btn-save" onClick={() => saveBlock(editing)} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button className="btn-cancel" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="admin-block-list">
        {blocks.map((block) => (
          <div key={block.key} className="admin-page-row" style={{ cursor: "pointer" }}>
            {editing?.key === block.key ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="field">
                  <label>Title</label>
                  <input
                    value={editing.title}
                    onChange={(e) =>
                      setEditing({ ...editing, title: e.target.value })
                    }
                  />
                </div>
                <BlockContentEditor editing={editing} setEditing={setEditing} />
                <div className="admin-actions">
                  <button
                    className="btn-save"
                    onClick={() => saveBlock(editing)}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    className="btn-cancel"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                onClick={() => setEditing({ ...block })}
              >
                <div>
                  <h3 style={{ margin: 0, fontFamily: "'Geist Mono','SF Mono',monospace", fontSize: "0.9rem", color: "var(--ink)" }}>
                    {block.key}
                  </h3>
                  <span className="route">
                    {block.title || "(no title)"}
                  </span>
                </div>
                <span style={{ color: "var(--slate-400)", fontSize: "0.8rem" }}>Click to edit</span>
              </div>
            )}
          </div>
        ))}
        {blocks.length === 0 && <p style={{ color: "var(--slate-500)" }}>No blocks yet.</p>}
      </div>
    </div>
  );
}

type NavLink = { href: string; label: string };
type FooterColumn = { heading: string; links: NavLink[] };
type SocialLink = { platform: string; url: string; label: string };
type OrgData = { name: string; url: string; description: string; sameAs: string[] };

type SiteSettingsData = Record<string, unknown> & {
  nav_links: NavLink[];
  nav_cta: { href: string; label: string };
  menu_label: string;
  footer_columns: FooterColumn[];
  footer_legal: NavLink[];
  social_links: SocialLink[];
  organization: OrgData;
};

function useSiteSettings(editing: Block, setEditing: (b: Block) => void) {
  const parsed = (editing.content_json || {}) as SiteSettingsData;

  const update = (patch: Partial<SiteSettingsData>) => {
    const updated = { ...parsed, ...patch };
    setEditing({ ...editing, body_html: JSON.stringify(updated, null, 2), content_json: updated });
  };

  const setNested = (key: string, field: string, value: string) => {
    const current = (parsed[key] as Record<string, string>) || {};
    update({ [key]: { ...current, [field]: value } as never });
  };

  const addArrayItem = (key: string, item: Record<string, unknown>) => {
    const arr = (parsed[key] as Record<string, unknown>[]) || [];
    update({ [key]: [...arr, item] as never });
  };

  const removeArrayItem = (key: string, index: number) => {
    const arr = (parsed[key] as Record<string, unknown>[]) || [];
    update({ [key]: arr.filter((_, i) => i !== index) as never });
  };

  const updateArrayItem = (key: string, index: number, field: string, value: string) => {
    const arr = (parsed[key] as Record<string, unknown>[]) || [];
    const next = arr.map((item, i) => (i === index ? { ...item, [field]: value } : item));
    update({ [key]: next as never });
  };

  const updateColumnLink = (colIdx: number, linkIdx: number, field: string, value: string) => {
    const cols = (parsed.footer_columns || []) as SiteSettingsData["footer_columns"];
    const next = cols.map((col, ci) =>
      ci === colIdx
        ? { ...col, links: col.links.map((link, li) => (li === linkIdx ? { ...link, [field]: value } : link)) }
        : col
    );
    update({ footer_columns: next as never });
  };

  const addColumnLink = (colIdx: number) => {
    const cols = (parsed.footer_columns || []) as SiteSettingsData["footer_columns"];
    const next = cols.map((col, ci) =>
      ci === colIdx ? { ...col, links: [...col.links, { href: "", label: "" }] } : col
    );
    update({ footer_columns: next as never });
  };

  const removeColumnLink = (colIdx: number, linkIdx: number) => {
    const cols = (parsed.footer_columns || []) as SiteSettingsData["footer_columns"];
    const next = cols.map((col, ci) =>
      ci === colIdx ? { ...col, links: col.links.filter((_, li) => li !== linkIdx) } : col
    );
    update({ footer_columns: next as never });
  };

  const socialLinks = (parsed.social_links || []) as { platform: string; url: string; label: string }[];

  const updateSocialLink = (i: number, field: string, value: string) => {
    updateArrayItem("social_links", i, field, value);
  };

  const addSocialLink = () => {
    addArrayItem("social_links", { platform: "twitter", url: "", label: "" });
  };

  const removeSocialLink = (i: number) => {
    removeArrayItem("social_links", i);
  };

  return {
    parsed,
    update,
    setNested,
    addArrayItem,
    removeArrayItem,
    updateArrayItem,
    updateColumnLink,
    addColumnLink,
    removeColumnLink,
    socialLinks,
    updateSocialLink,
    addSocialLink,
    removeSocialLink,
  };
}

const card: React.CSSProperties = {
  background: "var(--paper)", border: "1px solid var(--slate-200)",
  borderRadius: "var(--radius-lg)", padding: 24, marginBottom: 20,
};
const cardTitle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: "0.8rem", fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--slate-500)",
  margin: "0 0 16px", paddingBottom: 12,
  borderBottom: "1px solid var(--slate-200)",
};
const itemRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  marginBottom: 8, padding: "8px 10px",
  border: "1px solid var(--slate-200)",
  borderRadius: "var(--radius-md)",
  background: "var(--slate-50)",
};
const indexBadge: React.CSSProperties = {
  flexShrink: 0, width: 24, height: 24,
  display: "flex", alignItems: "center", justifyContent: "center",
  borderRadius: "50%", background: "var(--slate-100)",
  color: "var(--slate-500)", fontSize: "0.7rem", fontWeight: 600,
  fontFamily: "var(--font-display)",
};
const removeBtn: React.CSSProperties = {
  background: "none", border: "1px solid transparent", cursor: "pointer",
  color: "var(--red)", fontSize: "1.1rem", lineHeight: 1,
  width: 32, height: 32, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  borderRadius: "var(--radius-sm)",
  transition: "all 0.15s",
};

function IndexBadge({ n }: { n: number }) {
  return <span style={indexBadge}>{n}</span>;
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={removeBtn}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#fecaca"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "transparent"; }}
      title="Remove">&times;</button>
  );
}

function LinkFields({ label, href, onLabel, onHref }: {
  label: string; href: string;
  onLabel: (v: string) => void; onHref: (v: string) => void;
}) {
  return (
    <>
      <input placeholder="Label" value={label} onChange={(e) => onLabel(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
      <input placeholder="/path or https://" value={href} onChange={(e) => onHref(e.target.value)} style={{ flex: 1.5, minWidth: 0 }} />
    </>
  );
}

function SiteSettingsEditor({ editing, setEditing }: { editing: Block; setEditing: (b: Block) => void }) {
  const {
    parsed, update, setNested,
    addArrayItem, removeArrayItem, updateArrayItem,
    updateColumnLink, addColumnLink, removeColumnLink,
    socialLinks, updateSocialLink, addSocialLink, removeSocialLink,
  } = useSiteSettings(editing, setEditing);

  const navLinks = (parsed.nav_links || []) as { href: string; label: string }[];
  const navCta = (parsed.nav_cta || { href: "", label: "" }) as { href: string; label: string };
  const footerColumns = (parsed.footer_columns || []) as SiteSettingsData["footer_columns"];
  const footerLegal = (parsed.footer_legal || []) as { href: string; label: string }[];
  const org = (parsed.organization || { name: "", url: "", description: "", sameAs: [] }) as SiteSettingsData["organization"];

  return (
    <div className="admin-editor">
      {/* ── Logo & Brand ── */}
      <div style={card}>
        <h4 style={cardTitle}>Logo &amp; Brand</h4>
        <div className="field"><label>Logo URL</label>
          <input value={parsed.logo_src as string || ""} onChange={(e) => update({ logo_src: e.target.value })} placeholder="/dexapos-logo.png" /></div>
        <div className="field"><label>Logo Alt Text</label>
          <input value={parsed.logo_alt as string || ""} onChange={(e) => update({ logo_alt: e.target.value })} /></div>
        <div className="field"><label>Logo Aria Label</label>
          <input value={parsed.logo_aria as string || ""} onChange={(e) => update({ logo_aria: e.target.value })} /></div>
        <div className="field"><label>Brand Home Aria</label>
          <input value={parsed.brand_home_aria as string || ""} onChange={(e) => update({ brand_home_aria: e.target.value })} /></div>
        <div className="field"><label>Menu Label</label>
          <input value={parsed.menu_label as string || ""} onChange={(e) => update({ menu_label: e.target.value })} /></div>
      </div>

      {/* ── Navigation ── */}
      <div style={card}>
        <h4 style={cardTitle}>Navigation Links</h4>
        {navLinks.map((link, i) => (
          <div key={i} style={itemRow}>
            <IndexBadge n={i + 1} />
            <LinkFields label={link.label} href={link.href}
              onLabel={(v) => updateArrayItem("nav_links", i, "label", v)}
              onHref={(v) => updateArrayItem("nav_links", i, "href", v)} />
            <RemoveBtn onClick={() => removeArrayItem("nav_links", i)} />
          </div>
        ))}
        <button className="add-btn" onClick={() => addArrayItem("nav_links", { href: "", label: "" })}>+ Add Nav Link</button>
      </div>

      {/* ── Nav CTA ── */}
      <div style={card}>
        <h4 style={cardTitle}>Nav CTA</h4>
        <div className="field"><label>CTA Label</label>
          <input value={navCta.label} onChange={(e) => setNested("nav_cta", "label", e.target.value)} placeholder="Request a Demo" /></div>
        <div className="field"><label>CTA Href</label>
          <input value={navCta.href} onChange={(e) => setNested("nav_cta", "href", e.target.value)} placeholder="/contact" /></div>
      </div>

      {/* ── Footer ── */}
      <div style={card}>
        <h4 style={cardTitle}>Footer</h4>
        <div className="field"><label>Tagline</label>
          <textarea rows={2} value={parsed.footer_tagline as string || ""} onChange={(e) => update({ footer_tagline: e.target.value })} /></div>
        <div className="field"><label>Copyright</label>
          <input value={parsed.footer_copyright as string || ""} onChange={(e) => update({ footer_copyright: e.target.value })} placeholder="Copyright 2026 DEXA. All rights reserved." /></div>
      </div>

      {/* ── Footer Columns ── */}
      <div style={card}>
        <h4 style={cardTitle}>Footer Columns</h4>
        {footerColumns.map((col, ci) => (
          <div key={ci} style={{
            marginBottom: 12, padding: 16,
            border: "1px solid var(--slate-200)",
            borderRadius: "var(--radius-lg)",
            background: "var(--slate-50)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <IndexBadge n={ci + 1} />
              <input placeholder="Column heading" value={col.heading}
                onChange={(e) => updateArrayItem("footer_columns", ci, "heading", e.target.value)}
                style={{ flex: 1 }} />
              <RemoveBtn onClick={() => removeArrayItem("footer_columns", ci)} />
            </div>
            <div style={{ marginLeft: 32 }}>
              {col.links.map((link, li) => (
                <div key={li} style={{ ...itemRow, marginBottom: 6 }}>
                  <span style={{ ...indexBadge, width: 20, height: 20, fontSize: "0.6rem" }}>{li + 1}</span>
                  <LinkFields label={link.label} href={link.href}
                    onLabel={(v) => updateColumnLink(ci, li, "label", v)}
                    onHref={(v) => updateColumnLink(ci, li, "href", v)} />
                  <RemoveBtn onClick={() => removeColumnLink(ci, li)} />
                </div>
              ))}
              <button className="add-btn" onClick={() => addColumnLink(ci)}>+ Add Link</button>
            </div>
          </div>
        ))}
        <button className="add-btn" onClick={() => addArrayItem("footer_columns", { heading: "", links: [{ href: "", label: "" }] })}>+ Add Footer Column</button>
      </div>

      {/* ── Footer Legal ── */}
      <div style={card}>
        <h4 style={cardTitle}>Footer Legal Links</h4>
        {footerLegal.map((link, i) => (
          <div key={i} style={itemRow}>
            <IndexBadge n={i + 1} />
            <LinkFields label={link.label} href={link.href}
              onLabel={(v) => updateArrayItem("footer_legal", i, "label", v)}
              onHref={(v) => updateArrayItem("footer_legal", i, "href", v)} />
            <RemoveBtn onClick={() => removeArrayItem("footer_legal", i)} />
          </div>
        ))}
        <button className="add-btn" onClick={() => addArrayItem("footer_legal", { href: "", label: "" })}>+ Add Legal Link</button>
      </div>

      {/* ── Social Links ── */}
      <div style={card}>
        <h4 style={cardTitle}>Social Links</h4>
        {socialLinks.map((link, i) => (
          <div key={i} style={itemRow}>
            <IndexBadge n={i + 1} />
            <select value={link.platform} onChange={(e) => updateSocialLink(i, "platform", e.target.value)}>
              {SOCIAL_PLATFORMS.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
            </select>
            <input placeholder="https://..." value={link.url}
              onChange={(e) => updateSocialLink(i, "url", e.target.value)} style={{ flex: 1.5, minWidth: 0 }} />
            <input placeholder="Label" value={link.label}
              onChange={(e) => updateSocialLink(i, "label", e.target.value)} style={{ width: 130 }} />
            <RemoveBtn onClick={() => removeSocialLink(i)} />
          </div>
        ))}
        <button className="add-btn" onClick={addSocialLink}>+ Add Social Link</button>
      </div>

      {/* ── Organization ── */}
      <div style={card}>
        <h4 style={cardTitle}>Organization (JSON-LD)</h4>
        <div className="field"><label>Name</label>
          <input value={org.name} onChange={(e) => setNested("organization", "name", e.target.value)} placeholder="DEXA" /></div>
        <div className="field"><label>URL</label>
          <input value={org.url} onChange={(e) => setNested("organization", "url", e.target.value)} placeholder="https://dexa.com" /></div>
        <div className="field"><label>Description</label>
          <textarea rows={2} value={org.description} onChange={(e) => setNested("organization", "description", e.target.value)} /></div>
        <div className="field">
          <label>Same As (one URL per line)</label>
          <textarea rows={3} value={(org.sameAs || []).join("\n")}
            onChange={(e) => update({ organization: { ...org, sameAs: e.target.value.split("\n").filter(s => s.trim()) } })} />
        </div>
      </div>
    </div>
  );
}

function BlockContentEditor({
  editing,
  setEditing,
}: {
  editing: Block;
  setEditing: (block: Block) => void;
}) {
  if (editing.key === "site-settings") {
    return <SiteSettingsEditor editing={editing} setEditing={setEditing} />;
  }

  return (
    <div className="field">
      <label>Content</label>
      <TipTapEditor
        content={editing.body_html}
        onChange={(html) => setEditing({ ...editing, body_html: html })}
        placeholder="Edit block content..."
      />
    </div>
  );
}
