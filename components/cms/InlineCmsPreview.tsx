"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Section } from "@/lib/cms/cms-sections";
import { DEFAULT_SITE_SETTINGS, SiteSettings } from "@/lib/cms/site-settings-data";
import { sanitizeHtml } from "@/lib/cms/sanitize";
import CmsImageActions from "./CmsImageActions";

type SelectedField = {
  label: string;
  path: string;
  kind: string;
  value: string;
  hrefPath?: string;
  href?: string;
  altPath?: string;
  alt?: string;
  scope?: "page" | "site";
};

type CmsPageResponse = {
  cms_title?: string;
  title?: string;
  description?: string;
  sections?: Section[];
  published?: boolean;
};

function cloneSections(sections: Section[]) {
  return JSON.parse(JSON.stringify(sections)) as Section[];
}

function cloneSiteSettings(settings: SiteSettings) {
  return JSON.parse(JSON.stringify(settings)) as SiteSettings;
}

function valueAtObjectPath(source: unknown, fullPath: string) {
  let current = source;
  for (const part of fullPath.split(".")) {
    if (current == null) return "";
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : "";
}

function setValueAtObjectPath<T>(source: T, fullPath: string, value: string): T {
  const next = JSON.parse(JSON.stringify(source)) as T;
  let current = next as Record<string, unknown>;
  const parts = fullPath.split(".");
  parts.slice(0, -1).forEach((part) => {
    if (current[part] == null) current[part] = /^\d+$/.test(part) ? [] : {};
    current = current[part] as Record<string, unknown>;
  });
  current[parts[parts.length - 1]] = value;
  return next;
}

function valueAtSectionPath(sections: Section[], fullPath: string) {
  const [sectionId, ...parts] = fullPath.split(".");
  let current: unknown = sections.find((section) => section.id === sectionId);
  for (const part of parts) {
    if (current == null) return "";
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : "";
}

function setValueAtSectionPath(sections: Section[], fullPath: string, value: string) {
  const [sectionId, ...parts] = fullPath.split(".");
  const next = cloneSections(sections);
  const section = next.find((item) => item.id === sectionId);
  if (!section || parts.length === 0) return next;

  let current = section as unknown as Record<string, unknown>;
  parts.slice(0, -1).forEach((part) => {
    if (current[part] == null) current[part] = /^\d+$/.test(part) ? [] : {};
    current = current[part] as Record<string, unknown>;
  });
  current[parts[parts.length - 1]] = value;
  return next;
}

function toEmbedUrl(url: string) {
  let embed = url;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (yt) embed = `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) embed = `https://player.vimeo.com/video/${vm[1]}`;
  return embed;
}

// Reflect a panel edit onto the live (server-rendered, non-React) DOM node so the
// preview updates instantly, without waiting for a save + reload.
function applyFieldToDom(el: HTMLElement | null, field: SelectedField, patch: Partial<SelectedField>) {
  if (!el) return;
  if (patch.value !== undefined) {
    if (field.kind === "image") {
      if (el instanceof HTMLImageElement) {
        el.srcset = "";
        el.src = patch.value;
      } else {
        el.style.backgroundImage = patch.value ? `url(${JSON.stringify(patch.value)})` : "none";
      }
    } else if (field.kind === "url" && el instanceof HTMLIFrameElement) {
      el.src = toEmbedUrl(patch.value);
    } else if (field.kind === "richtext") {
      // Same sanitizer the server applies on save — keeps the preview honest and blocks XSS.
      el.innerHTML = sanitizeHtml(patch.value);
    } else if (el.textContent !== patch.value) {
      // text / link — only touched from the panel; inline typing is handled separately
      el.textContent = patch.value;
    }
  }
  if (patch.href !== undefined && field.hrefPath) el.setAttribute("href", patch.href);
  if (patch.alt !== undefined && field.altPath && el instanceof HTMLImageElement) el.setAttribute("alt", patch.alt);
}

export default function InlineCmsPreview({ route, sections }: { route: string; sections: Section[] }) {
  const searchParams = useSearchParams();
  const enabledByUrl = searchParams.get("cmsPreview") === "1";
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<SelectedField | null>(null);
  const [status, setStatus] = useState("Checking CMS session...");
  const [pageMeta, setPageMeta] = useState<CmsPageResponse>({});
  const sectionsRef = useRef(sections);
  const siteSettingsRef = useRef<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const selectedEl = useRef<HTMLElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const encodedRoute = useMemo(() => route === "/" ? "root" : encodeURIComponent(route.replace(/^\/+/, "")), [route]);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  const saveSiteSettings = useCallback(async (nextSettings: SiteSettings) => {
    siteSettingsRef.current = nextSettings;
    setStatus("Saving site settings...");
    try {
      const res = await fetch("/api/cms/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "site-settings",
          title: "Site settings",
          body_html: JSON.stringify(nextSettings, null, 2),
          content_json: nextSettings,
        }),
      });
      if (!res.ok) throw new Error();
      setStatus("Saved site settings.");
    } catch {
      setStatus("Site settings save failed. Check your CMS session.");
    }
  }, []);

  const saveSections = useCallback(async (nextSections: Section[]) => {
    sectionsRef.current = nextSections;
    setStatus("Saving...");
    try {
      const res = await fetch(`/api/cms/pages/${encodedRoute}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cms_title: pageMeta.cms_title || "",
          title: pageMeta.title || "",
          description: pageMeta.description || "",
          sections: nextSections,
          published: pageMeta.published ?? false,
        }),
      });
      if (!res.ok) throw new Error();
      setStatus("Saved.");
    } catch {
      setStatus("Save failed. Check your CMS session.");
    }
  }, [encodedRoute, pageMeta.cms_title, pageMeta.description, pageMeta.published, pageMeta.title]);

  const scheduleSave = useCallback((path: string, value: string) => {
    const nextSections = setValueAtSectionPath(sectionsRef.current, path, value);
    sectionsRef.current = nextSections;
    setSelected((current) => current && current.path === path ? { ...current, value } : current);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveSections(nextSections), 650);
  }, [saveSections]);

  useEffect(() => {
    if (!enabledByUrl) return;

    let cancelled = false;
    Promise.all([
      fetch(`/api/cms/pages/${encodedRoute}`, { cache: "no-store" }),
      fetch("/api/cms/blocks", { cache: "no-store" }),
    ])
      .then(async ([pageRes, blocksRes]) => {
        if (pageRes.status === 401) throw new Error("Sign in to the CMS to edit this preview.");
        if (!pageRes.ok) throw new Error("Could not load CMS page data.");
        return {
          page: await pageRes.json() as CmsPageResponse | null,
          blocks: blocksRes.ok
            ? await blocksRes.json() as { key: string; content_json?: unknown }[]
            : [],
          siteSettingsAvailable: blocksRes.ok,
        };
      })
      .then(({ page, blocks, siteSettingsAvailable }) => {
        const siteBlock = blocks.find((block) => block.key === "site-settings");
        siteSettingsRef.current = {
          ...DEFAULT_SITE_SETTINGS,
          ...((siteBlock?.content_json || {}) as Partial<SiteSettings>),
        };
        if (cancelled) return;
        if (page?.sections?.length) sectionsRef.current = page.sections;
        setPageMeta(page || {});
        setActive(true);
        setStatus(siteSettingsAvailable
          ? "Inline editing on. Click text, buttons, links, or images."
          : "Page editing on. Site settings are temporarily unavailable.");
      })
      .catch((err) => {
        if (cancelled) return;
        setActive(false);
        setStatus(err instanceof Error ? err.message : "Inline editing unavailable.");
      });

    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [enabledByUrl, encodedRoute]);

  useEffect(() => {
    if (!active) return;
    document.body.classList.add("cms-inline-active");

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const editable = target?.closest<HTMLElement>("[data-cms-editable='true']");
      if (!editable) return;

      event.preventDefault();
      event.stopPropagation();

      selectedEl.current?.removeAttribute("contenteditable");
      selectedEl.current = editable;

      const path = editable.dataset.cmsPath || "";
      const kind = editable.dataset.cmsKind || "text";
      const scope = editable.dataset.cmsScope === "site" ? "site" : "page";
      const valueSource = scope === "site" ? siteSettingsRef.current : sectionsRef.current;
      const field: SelectedField = {
        label: editable.dataset.cmsLabel || "Content",
        path,
        kind,
        scope,
        value: scope === "site"
          ? valueAtObjectPath(valueSource, path) || editable.textContent?.trim() || ""
          : valueAtSectionPath(sectionsRef.current, path) || editable.textContent?.trim() || "",
        hrefPath: editable.dataset.cmsHrefPath,
        href: editable.dataset.cmsHrefPath
          ? scope === "site"
            ? valueAtObjectPath(valueSource, editable.dataset.cmsHrefPath)
            : valueAtSectionPath(sectionsRef.current, editable.dataset.cmsHrefPath)
          : "",
        altPath: editable.dataset.cmsAltPath,
        alt: editable.dataset.cmsAltPath
          ? scope === "site"
            ? valueAtObjectPath(valueSource, editable.dataset.cmsAltPath)
            : valueAtSectionPath(sectionsRef.current, editable.dataset.cmsAltPath)
          : "",
      };
      setSelected(field);

      if (kind === "text" || kind === "link") {
        editable.setAttribute("contenteditable", "true");
        editable.focus();
        const range = document.createRange();
        range.selectNodeContents(editable);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    };

    const handleInput = (event: Event) => {
      const editable = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-cms-editable='true']");
      if (!editable || editable !== selectedEl.current) return;
      const path = editable.dataset.cmsPath;
      if (!path) return;
      if (editable.dataset.cmsScope === "site") {
        const nextSettings = setValueAtObjectPath(siteSettingsRef.current, path, editable.textContent || "");
        siteSettingsRef.current = nextSettings;
        setSelected((current) => current && current.path === path ? { ...current, value: editable.textContent || "" } : current);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => void saveSiteSettings(nextSettings), 650);
        return;
      }
      scheduleSave(path, editable.textContent || "");
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        selectedEl.current?.blur();
        selectedEl.current?.removeAttribute("contenteditable");
        selectedEl.current = null;
        setSelected(null);
      }
      if (event.key === "Enter" && selectedEl.current && !event.shiftKey) {
        event.preventDefault();
        selectedEl.current.blur();
      }
    };

    document.addEventListener("click", handleClick, true);
    document.addEventListener("input", handleInput, true);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.body.classList.remove("cms-inline-active");
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("input", handleInput, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [active, scheduleSave, saveSiteSettings]);

  // Live-update the on-page element + panel state as the user edits, before the debounced save.
  const reflect = (patch: Partial<SelectedField>) => {
    if (selected) applyFieldToDom(selectedEl.current, selected, patch);
    setSelected((current) => (current ? { ...current, ...patch } : current));
  };

  const saveSelected = async (patch: Partial<SelectedField>) => {
    if (!selected) return;
    applyFieldToDom(selectedEl.current, selected, patch);
    if (selected.scope === "site") {
      let nextSettings = cloneSiteSettings(siteSettingsRef.current);
      const nextSelected = { ...selected, ...patch };
      if (patch.value !== undefined) nextSettings = setValueAtObjectPath(nextSettings, selected.path, patch.value);
      if (selected.hrefPath && patch.href !== undefined) nextSettings = setValueAtObjectPath(nextSettings, selected.hrefPath, patch.href);
      if (selected.altPath && patch.alt !== undefined) nextSettings = setValueAtObjectPath(nextSettings, selected.altPath, patch.alt);
      setSelected(nextSelected);
      await saveSiteSettings(nextSettings);
      return;
    }

    let nextSections = sectionsRef.current;
    const nextSelected = { ...selected, ...patch };
    if (patch.value !== undefined) nextSections = setValueAtSectionPath(nextSections, selected.path, patch.value);
    if (selected.hrefPath && patch.href !== undefined) nextSections = setValueAtSectionPath(nextSections, selected.hrefPath, patch.href);
    if (selected.altPath && patch.alt !== undefined) nextSections = setValueAtSectionPath(nextSections, selected.altPath, patch.alt);
    setSelected(nextSelected);
    await saveSections(nextSections);
  };

  if (!enabledByUrl) return null;

  return (
    <>
      <div className={`cms-inline-toolbar ${active ? "is-active" : "is-locked"}`}>
        <strong>Inline CMS</strong>
        <span>{status}</span>
        {active && <a href={route}>Exit preview</a>}
      </div>

      {active && selected && (
        <aside className="cms-inline-panel" aria-label="Inline CMS field editor">
          <div className="cms-inline-panel-head">
            <strong>{selected.label}</strong>
            <button type="button" onClick={() => setSelected(null)}>Close</button>
          </div>
          {(selected.kind === "image" || selected.kind === "url" || selected.kind === "richtext") ? (
            <label>
              {selected.kind === "image" ? "Source URL" : selected.kind === "url" ? "URL" : "HTML"}
              <textarea value={selected.value} onChange={(e) => reflect({ value: e.target.value })} onBlur={(e) => void saveSelected({ value: e.target.value })} rows={selected.kind === "richtext" ? 8 : 3} />
            </label>
          ) : (
            <label>
              Text
              <textarea value={selected.value} onChange={(e) => reflect({ value: e.target.value })} onBlur={(e) => void saveSelected({ value: e.target.value })} rows={4} />
            </label>
          )}
          {selected.hrefPath && (
            <label>
              Link target
              <input value={selected.href || ""} onChange={(e) => reflect({ href: e.target.value })} onBlur={(e) => void saveSelected({ href: e.target.value })} />
            </label>
          )}
          {selected.altPath && (
            <label>
              Alt text
              <input value={selected.alt || ""} onChange={(e) => reflect({ alt: e.target.value })} onBlur={(e) => void saveSelected({ alt: e.target.value })} />
            </label>
          )}
          {selected.kind === "image" && (
            <CmsImageActions
              className="is-preview"
              onSelect={async (url) => {
                reflect({ value: url });
                await saveSelected({ value: url });
              }}
            />
          )}
          <button type="button" className="cms-inline-save" onClick={() => void saveSelected(selected)}>Save now</button>
        </aside>
      )}
    </>
  );
}
