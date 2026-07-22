"use client";

import { useState, useEffect, useRef } from "react";
import TipTapEditor from "./TipTapEditor";
import { Section, SectionField, SectionType, SECTION_META, createSection } from "@/lib/cms/cms-sections";
import { CARD_ICONS, CARD_ICON_NAMES } from "@/lib/cms/card-icons";

interface SectionEditorProps {
  sections: Section[];
  onChange: (sections: Section[]) => void;
}

function SectionTypeIcon({ type }: { type: SectionType }) {
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
        return <><path d="M3 4h10M3 8h10M3 12h10" /><circle cx="6" cy="4" r="1.25" fill="var(--paper)" /><circle cx="10" cy="8" r="1.25" fill="var(--paper)" /><circle cx="7" cy="12" r="1.25" fill="var(--paper)" /></>;
      case "compare_strip":
        return <><rect x="2" y="4" width="12" height="8" rx="1.5" /><path d="M8 4v8M4.5 7h1.75M9.75 9h1.75M5.5 6l1 1-1 1M10.5 8l-1 1 1 1" /></>;
    }
  })();

  return (
    <svg
      aria-hidden="true"
      className="section-type-icon"
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

export default function SectionEditor({ sections, onChange }: SectionEditorProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const gripDrag = useRef(false);

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
    <div className="section-editor">
      <div className="section-list">
        {sections.map((section, i) => {
          const meta = SECTION_META[section.type];
          const isOpen = expanded === section.id;
          return (
            <div
              key={section.id}
              className={`section-block ${isOpen ? "is-open" : ""} ${dragIndex === i ? "dragging" : ""}`}
              draggable
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDragEnd={handleDragEnd}
            >
              <div className="section-block-header" onClick={() => setExpanded(isOpen ? null : section.id)}>
                <div className="section-block-grip" onMouseDown={() => { gripDrag.current = true; }}>⠿</div>
                <div className="section-block-type">{meta.icon} {meta.label}</div>
                <div className="section-block-preview">
                  {section.heading || section.body?.slice(0, 60) || "(empty)"}
                </div>
                <div className="section-block-actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="section-btn" onClick={() => moveSection(section.id, -1)} title="Move up">↑</button>
                  <button type="button" className="section-btn" onClick={() => moveSection(section.id, 1)} title="Move down">↓</button>
                  <button type="button" className="section-btn section-btn-danger" onClick={() => removeSection(section.id)} title="Delete">✕</button>
                </div>
              </div>
              {isOpen && (
                <div className="section-block-body">
                  {meta.fields.map((field) => (
                    <FieldRenderer
                      key={field.key}
                      section={section}
                      field={field}
                      onChange={(val) => updateSection(section.id, { [field.key]: val })}
                    />
                  ))}
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
                      onChangeColumns={(compare_columns) => updateSection(section.id, { compare_columns })}
                      onChangeRows={(compare_rows) => updateSection(section.id, { compare_rows })}
                    />
                  )}
                  <RawSectionEditor
                    key={`raw-${section.id}-${JSON.stringify(section)}`}
                    section={section}
                    onChange={(updated) => updateSection(section.id, updated)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="section-add">
        <span className="section-add-label">Add Section:</span>
        <div className="section-add-types">
          {(Object.entries(SECTION_META) as [SectionType, typeof SECTION_META[SectionType]][]).map(([type, meta]) => (
            <button key={type} type="button" className="section-add-btn" onClick={() => addSection(type)}>
              <SectionTypeIcon type={type} />
              <span>{meta.label}</span>
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
  onChange,
}: {
  section: Section;
  field: SectionField;
  onChange: (value: string | { text: string; link: string; style: string }[]) => void;
}) {
  const value = (section as unknown as Record<string, string>)[field.key] || "";
  const labelId = `field-${section.id}-${field.key}`;

  if (field.type === "richtext") {
    return (
      <div className="section-field">
        <label htmlFor={labelId}>{field.label}</label>
        <TipTapEditor content={value} onChange={(html) => onChange(html)} placeholder={`Enter ${field.label.toLowerCase()}...`} />
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="section-field">
        <label htmlFor={labelId}>{field.label}</label>
        <textarea id={labelId} value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={field.placeholder} />
      </div>
    );
  }

  if (field.type === "image") {
    return (
      <div className="section-field">
        <label>{field.label}</label>
        <ImagePicker value={value} onChange={(url) => onChange(url)} />
      </div>
    );
  }

  if (field.type === "buttons") {
    return (
      <ButtonsEditor
        label={field.label}
        buttons={section.buttons || []}
        onChange={(buttons) => onChange(buttons)}
      />
    );
  }

  if (field.type === "color") {
    return (
      <div className="section-field section-field-color">
        <label htmlFor={labelId}>{field.label}</label>
        <div className="color-picker-row">
          <input id={labelId} type="color" value={value || "#ffffff"} onChange={(e) => onChange(e.target.value)} />
          <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="#ffffff or var(--name)" />
        </div>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="section-field">
        <label htmlFor={labelId}>{field.label}</label>
        <select id={labelId} value={value} onChange={(e) => onChange(e.target.value)}>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="section-field">
      <label htmlFor={labelId}>{field.label}</label>
      <input
        id={labelId}
        type={field.type === "url" ? "url" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
      />
    </div>
  );
}

function ButtonsEditor({
  label,
  buttons,
  onChange,
}: {
  label: string;
  buttons: { text: string; link: string; style: string }[];
  onChange: (buttons: { text: string; link: string; style: string }[]) => void;
}) {
  const updateButton = (i: number, patch: Partial<{ text: string; link: string; style: string }>) => {
    onChange(buttons.map((button, idx) => (idx === i ? { ...button, ...patch } : button)));
  };

  const removeButton = (i: number) => {
    onChange(buttons.filter((_, idx) => idx !== i));
  };

  const addButton = () => {
    onChange([...buttons, { text: "", link: "", style: buttons.length === 0 ? "primary" : "secondary" }]);
  };

  return (
    <div className="buttons-sub-editor">
      <label>{label}</label>
      {buttons.map((button, i) => (
        <div key={i} className="button-item">
          <div className="button-item-row">
            <input
              type="text"
              value={button.text || ""}
              onChange={(e) => updateButton(i, { text: e.target.value })}
              placeholder="Button text"
            />
            <input
              type="text"
              value={button.link || ""}
              onChange={(e) => updateButton(i, { link: e.target.value })}
              placeholder="/contact"
            />
            <select value={button.style || "primary"} onChange={(e) => updateButton(i, { style: e.target.value })}>
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
              <option value="ghost-light">Light ghost</option>
            </select>
            <button type="button" className="section-btn section-btn-danger" onClick={() => removeButton(i)}>Delete</button>
          </div>
        </div>
      ))}
      <button type="button" className="section-add-card" onClick={addButton}>+ Add Button</button>
    </div>
  );
}

function ImagePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showGallery, setShowGallery] = useState(false);

  const handleUpload = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(true);
      setError("");
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/cms/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (data.url) {
          onChange(data.url);
        } else {
          setError(data.error || "Upload failed");
        }
      } catch {
        setError("Upload failed: network error");
      }
      setUploading(false);
    };
    input.click();
  };

  const handleReplace = () => {
    setMenuOpen(false);
    handleUpload();
  };

  const handleSelect = () => {
    setMenuOpen(false);
    setShowGallery(true);
  };

  const handleRemove = () => {
    setMenuOpen(false);
    onChange("");
  };

  return (
    <div className="image-picker">
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Paste image URL or upload..." />
      {error && <div className="upload-error">{error}</div>}
      {value ? (
        <div className="image-preview has-actions">
          <img src={value} alt="" />
          <div className="image-preview-overlay">
            <div className="image-menu-trigger" onClick={() => setMenuOpen(!menuOpen)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </div>
            {menuOpen && (
              <div className="image-menu">
                <button type="button" className="image-menu-item" onClick={handleReplace}>Replace</button>
                <button type="button" className="image-menu-item" onClick={handleSelect}>Select</button>
                <button type="button" className="image-menu-item image-menu-item-danger" onClick={handleRemove}>Remove</button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button type="button" className="section-btn" onClick={handleUpload} disabled={uploading}>
          {uploading ? "Uploading..." : "Upload image"}
        </button>
      )}
      {showGallery && (
        <ImageGallery
          onSelect={(url) => { onChange(url); setShowGallery(false); }}
          onClose={() => setShowGallery(false)}
        />
      )}
    </div>
  );
}

function ImageGallery({ onSelect, onClose }: { onSelect: (url: string) => void; onClose: () => void }) {
  const [images, setImages] = useState<{ name: string; url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/cms/images")
      .then((res) => res.json())
      .then((data) => {
        if (data.images) setImages(data.images);
        else setError(data.error || "Failed to load images");
      })
      .catch(() => setError("Failed to load images"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="image-gallery-backdrop" onClick={onClose}>
      <div className="image-gallery" onClick={(e) => e.stopPropagation()}>
        <div className="image-gallery-header">
          <span>Select an image</span>
          <button type="button" className="image-gallery-close" onClick={onClose}>✕</button>
        </div>
        <div className="image-gallery-body">
          {loading && <p style={{ padding: 24, textAlign: "center" }}>Loading...</p>}
          {error && <p style={{ padding: 24, textAlign: "center", color: "#dc2626" }}>{error}</p>}
          {!loading && !error && images.length === 0 && (
            <p style={{ padding: 24, textAlign: "center", color: "var(--slate-500)" }}>No images uploaded yet.</p>
          )}
          {!loading && images.length > 0 && (
            <div className="image-gallery-grid">
              {images.map((img) => (
                <button key={img.name} type="button" className="image-gallery-item" onClick={() => onSelect(img.url)}>
                  <img src={img.url} alt={img.name} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RawSectionEditor({
  section,
  onChange,
}: {
  section: Section;
  onChange: (section: Section) => void;
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(section, null, 2));
  const [error, setError] = useState("");

  const apply = () => {
    try {
      const parsed = JSON.parse(draft) as Section;
      if (!parsed.id || !parsed.type) {
        setError("Section JSON must include id and type.");
        return;
      }
      onChange(parsed);
      setError("");
    } catch {
      setError("Invalid JSON.");
    }
  };

  return (
    <details className="raw-section-editor">
      <summary>Advanced JSON</summary>
      <p className="raw-section-help">Edit any section field directly, including links, alt text, image sources, tags, form fields, and settings.</p>
      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={12} spellCheck={false} />
      {error && <p className="upload-error">{error}</p>}
      <button type="button" className="section-btn" onClick={apply}>Apply JSON</button>
    </details>
  );
}

function CardsSubEditor({
  items,
  onChange,
}: {
  items: { title?: string; description?: string; image?: string; image_alt?: string; icon?: string; link?: string; link_text?: string; tags?: string[] }[];
  onChange: (items: { title?: string; description?: string; image?: string; image_alt?: string; icon?: string; link?: string; link_text?: string; tags?: string[] }[]) => void;
}) {
  const updateItem = (i: number, patch: Record<string, string | string[]>) => {
    const copy = items.map((item, idx) => (idx === i ? { ...item, ...patch } : item));
    onChange(copy);
  };

  const removeItem = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i));
  };

  const addItem = () => {
    onChange([...items, { title: "", description: "", link: "", link_text: "", image_alt: "", tags: [] }]);
  };

  return (
    <div className="cards-sub-editor">
      <label>Cards</label>
      {items.map((item, i) => {
        const useIcon = !!item.icon;
        return (
          <div key={i} className="card-item">
            <div className="card-item-row">
              <input type="text" value={item.title || ""} onChange={(e) => updateItem(i, { title: e.target.value })} placeholder="Card title" />
              <button type="button" className="section-btn section-btn-danger" onClick={() => removeItem(i)}>✕</button>
            </div>
            <textarea value={item.description || ""} onChange={(e) => updateItem(i, { description: e.target.value })} placeholder="Description" rows={2} />
            <div className="card-item-row">
              <input type="text" value={item.link || ""} onChange={(e) => updateItem(i, { link: e.target.value })} placeholder="Link URL" />
              <input type="text" value={item.link_text || ""} onChange={(e) => updateItem(i, { link_text: e.target.value })} placeholder="Link text" />
            </div>
            <input type="text" value={(item.tags || []).join(", ")} onChange={(e) => updateItem(i, { tags: e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} placeholder="Tags, comma separated" />
            <div className="card-visual-toggle">
              <button
                type="button"
                className={`card-visual-opt ${useIcon ? "active" : ""}`}
                onClick={() => updateItem(i, { icon: item.icon || "checkmark", image: "" })}
              >
                Icon
              </button>
              <button
                type="button"
                className={`card-visual-opt ${!useIcon ? "active" : ""}`}
                onClick={() => updateItem(i, { image: item.image || "", icon: "" })}
              >
                Image
              </button>
            </div>
            {useIcon ? (
              <div className="icon-picker-grid">
                {CARD_ICON_NAMES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`icon-picker-item ${item.icon === name ? "active" : ""}`}
                    onClick={() => updateItem(i, { icon: name })}
                    title={name}
                  >
                    {CARD_ICONS[name]}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <ImagePicker value={item.image || ""} onChange={(v) => updateItem(i, { image: v })} />
                <input type="text" value={item.image_alt || ""} onChange={(e) => updateItem(i, { image_alt: e.target.value })} placeholder="Image alt text" />
              </>
            )}
          </div>
        );
      })}
      <button type="button" className="section-add-card" onClick={addItem}>+ Add Card</button>
    </div>
  );
}

function CompareEditor({
  columns,
  rows,
  onChangeColumns,
  onChangeRows,
}: {
  columns: string[];
  rows: string[][];
  onChangeColumns: (columns: string[]) => void;
  onChangeRows: (rows: string[][]) => void;
}) {
  const updateColumn = (colIdx: number, value: string) => {
    onChangeColumns(columns.map((column, idx) => (idx === colIdx ? value : column)));
  };

  const addColumn = () => {
    onChangeColumns([...columns, ""]);
    onChangeRows(rows.map((row) => [...row, ""]));
  };

  const removeColumn = (colIdx: number) => {
    onChangeColumns(columns.filter((_, idx) => idx !== colIdx));
    onChangeRows(rows.map((row) => row.filter((_, idx) => idx !== colIdx)));
  };

  const updateCell = (rowIdx: number, colIdx: number, value: string) => {
    const copy = rows.map((r, ri) =>
      ri === rowIdx ? r.map((c, ci) => (ci === colIdx ? value : c)) : r
    );
    onChangeRows(copy);
  };

  const addRow = () => {
    onChangeRows([...rows, columns.map(() => "")]);
  };

  const removeRow = (i: number) => {
    onChangeRows(rows.filter((_, idx) => idx !== i));
  };

  return (
    <div className="compare-sub-editor">
      <label>Comparison columns</label>
      <div className="compare-row-item">
        <div className="compare-row-cells">
          {columns.map((column, ci) => (
            <div key={ci} className="compare-cell">
              <label>{ci === 0 ? "Label column" : `Column ${ci + 1}`}</label>
              <input type="text" value={column} onChange={(e) => updateColumn(ci, e.target.value)} />
              {columns.length > 1 && (
                <button type="button" className="section-btn section-btn-danger" onClick={() => removeColumn(ci)}>Delete</button>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="section-add-card" onClick={addColumn}>+ Add Column</button>
      </div>
      <label>Comparison rows</label>
      {rows.length === 0 && (
        <button type="button" className="section-add-card" onClick={addRow}>+ Add Row</button>
      )}
      {rows.map((row, ri) => (
        <div key={ri} className="compare-row-item">
          <div className="compare-row-header">
            <span>Row {ri + 1}</span>
            <button type="button" className="section-btn section-btn-danger" onClick={() => removeRow(ri)}>✕</button>
          </div>
          <div className="compare-row-cells">
            {row.map((cell, ci) => (
              <div key={ci} className="compare-cell">
                <label>{columns[ci] || `Col ${ci + 1}`}</label>
                <input type="text" value={cell} onChange={(e) => updateCell(ri, ci, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
      ))}
      {rows.length > 0 && (
        <button type="button" className="section-add-card" onClick={addRow}>+ Add Row</button>
      )}
    </div>
  );
}
