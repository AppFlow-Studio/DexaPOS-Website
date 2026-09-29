"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { AddButton, Field, IconAction, MutedSelect, MutedTextarea } from "@/components/cms/cms-fields";
import { SOCIAL_PLATFORMS } from "@/components/marketing/SocialIcons";
import { Input } from "@/components/ui/input";
import type { Block } from "./BlocksClient";

type NavLink = { href: string; label: string };
type FooterColumn = { heading: string; links: NavLink[] };
type SocialLink = { platform: string; url: string; label: string };
type OrgData = { name: string; url: string; description: string; sameAs: string[] };

type SiteSettingsData = Record<string, unknown> & {
  nav_links?: NavLink[];
  nav_cta?: NavLink;
  menu_label?: string;
  footer_columns?: FooterColumn[];
  footer_legal?: NavLink[];
  social_links?: SocialLink[];
  organization?: OrgData;
};

type ListKey = "nav_links" | "footer_columns" | "footer_legal" | "social_links";

function useSiteSettings(editing: Block, setEditing: (b: Block) => void) {
  const parsed = (editing.content_json || {}) as SiteSettingsData;

  const update = (patch: Partial<SiteSettingsData>) => {
    const updated = { ...parsed, ...patch };
    setEditing({ ...editing, body_html: JSON.stringify(updated, null, 2), content_json: updated });
  };

  const text = (key: string) => (parsed[key] as string) || "";

  const setNested = (key: "nav_cta" | "organization", field: string, value: string) => {
    const current = (parsed[key] as Record<string, unknown>) || {};
    update({ [key]: { ...current, [field]: value } });
  };

  const list = <T,>(key: ListKey) => ((parsed[key] as T[] | undefined) || []);

  const addItem = (key: ListKey, item: Record<string, unknown>) => {
    update({ [key]: [...list(key), item] });
  };

  const removeItem = (key: ListKey, index: number) => {
    update({ [key]: list(key).filter((_, i) => i !== index) });
  };

  const updateItem = (key: ListKey, index: number, field: string, value: string) => {
    update({
      [key]: list<Record<string, unknown>>(key).map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    });
  };

  const updateColumnLink = (colIdx: number, linkIdx: number, field: string, value: string) => {
    update({
      footer_columns: list<FooterColumn>("footer_columns").map((col, ci) =>
        ci === colIdx
          ? { ...col, links: col.links.map((link, li) => (li === linkIdx ? { ...link, [field]: value } : link)) }
          : col
      ),
    });
  };

  const addColumnLink = (colIdx: number) => {
    update({
      footer_columns: list<FooterColumn>("footer_columns").map((col, ci) =>
        ci === colIdx ? { ...col, links: [...col.links, { href: "", label: "" }] } : col
      ),
    });
  };

  const removeColumnLink = (colIdx: number, linkIdx: number) => {
    update({
      footer_columns: list<FooterColumn>("footer_columns").map((col, ci) =>
        ci === colIdx ? { ...col, links: col.links.filter((_, li) => li !== linkIdx) } : col
      ),
    });
  };

  return {
    parsed,
    text,
    update,
    setNested,
    list,
    addItem,
    removeItem,
    updateItem,
    updateColumnLink,
    addColumnLink,
    removeColumnLink,
  };
}

/** One group of settings, headed like a panel section (UI-DESIGN-SYSTEM §3.2). */
function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-4">
      <h3 className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">{title}</h3>
      {children}
    </section>
  );
}

/**
 * One value per line. Keeps its own text so a fresh line survives while it is
 * still empty — filtering on every keystroke swallowed the Enter key.
 */
function LinesTextarea({ id, value, onChange }: { id: string; value: string[]; onChange: (lines: string[]) => void }) {
  const [draft, setDraft] = useState(() => value.join("\n"));
  return (
    <MutedTextarea
      id={id}
      rows={3}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(e.target.value.split("\n").map((line) => line.trim()).filter(Boolean));
      }}
    />
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/**
 * A numbered label + URL pair. The two fields sit side by side from `sm`
 * and stack on phones; the remove button stays beside them.
 */
function LinkRow({
  n,
  label,
  href,
  what,
  onLabel,
  onHref,
  onRemove,
}: {
  n: number;
  label: string;
  href: string;
  what: string;
  onLabel: (v: string) => void;
  onHref: (v: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="mt-2.5 hidden w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums sm:block">{n}</span>
      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Input aria-label={`${what} ${n} label`} placeholder="Label" value={label} onChange={(e) => onLabel(e.target.value)} />
        <Input aria-label={`${what} ${n} URL`} placeholder="/path or https://" value={href} onChange={(e) => onHref(e.target.value)} />
      </div>
      <IconAction label={`Remove ${what.toLowerCase()} ${n}`} destructive onClick={onRemove}>
        <Trash2 className="h-4 w-4" aria-hidden />
      </IconAction>
    </div>
  );
}

export function SiteSettingsEditor({ editing, setEditing }: { editing: Block; setEditing: (b: Block) => void }) {
  const {
    parsed, text, update, setNested, list,
    addItem, removeItem, updateItem,
    updateColumnLink, addColumnLink, removeColumnLink,
  } = useSiteSettings(editing, setEditing);

  const navLinks = list<NavLink>("nav_links");
  const navCta = parsed.nav_cta || { href: "", label: "" };
  const footerColumns = list<FooterColumn>("footer_columns");
  const footerLegal = list<NavLink>("footer_legal");
  const socialLinks = list<SocialLink>("social_links");
  const org = parsed.organization || { name: "", url: "", description: "", sameAs: [] };

  return (
    <div className="min-w-0 space-y-10">
      <SettingsGroup title="Logo and brand">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field label="Logo URL" htmlFor="ss-logo-src" className="sm:col-span-2">
            <Input id="ss-logo-src" value={text("logo_src")} onChange={(e) => update({ logo_src: e.target.value })} placeholder="/dexapos-logo.png" />
          </Field>
          <Field label="Logo alt text" htmlFor="ss-logo-alt">
            <Input id="ss-logo-alt" value={text("logo_alt")} onChange={(e) => update({ logo_alt: e.target.value })} />
          </Field>
          <Field label="Logo aria label" htmlFor="ss-logo-aria">
            <Input id="ss-logo-aria" value={text("logo_aria")} onChange={(e) => update({ logo_aria: e.target.value })} />
          </Field>
          <Field label="Brand home aria label" htmlFor="ss-brand-aria">
            <Input id="ss-brand-aria" value={text("brand_home_aria")} onChange={(e) => update({ brand_home_aria: e.target.value })} />
          </Field>
          <Field label="Menu label" htmlFor="ss-menu-label">
            <Input id="ss-menu-label" value={text("menu_label")} onChange={(e) => update({ menu_label: e.target.value })} />
          </Field>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Navigation links">
        <div className="min-w-0 space-y-4 sm:space-y-2">
          {navLinks.length === 0 && <EmptyLine>No navigation links yet.</EmptyLine>}
          {navLinks.map((link, i) => (
            <LinkRow
              key={i}
              n={i + 1}
              what="Nav link"
              label={link.label}
              href={link.href}
              onLabel={(v) => updateItem("nav_links", i, "label", v)}
              onHref={(v) => updateItem("nav_links", i, "href", v)}
              onRemove={() => removeItem("nav_links", i)}
            />
          ))}
        </div>
        <AddButton onClick={() => addItem("nav_links", { href: "", label: "" })}>Add nav link</AddButton>
      </SettingsGroup>

      <SettingsGroup title="Navigation call to action">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field label="Label" htmlFor="ss-cta-label">
            <Input id="ss-cta-label" value={navCta.label} onChange={(e) => setNested("nav_cta", "label", e.target.value)} placeholder="Request a Demo" />
          </Field>
          <Field label="Link" htmlFor="ss-cta-href">
            <Input id="ss-cta-href" value={navCta.href} onChange={(e) => setNested("nav_cta", "href", e.target.value)} placeholder="/contact" />
          </Field>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Footer">
        <div className="grid min-w-0 gap-4">
          <Field label="Tagline" htmlFor="ss-footer-tagline">
            <MutedTextarea id="ss-footer-tagline" rows={2} value={text("footer_tagline")} onChange={(e) => update({ footer_tagline: e.target.value })} />
          </Field>
          <Field label="Copyright" htmlFor="ss-footer-copyright">
            <Input id="ss-footer-copyright" value={text("footer_copyright")} onChange={(e) => update({ footer_copyright: e.target.value })} placeholder="Copyright 2026 DEXA. All rights reserved." />
          </Field>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Footer columns">
        {footerColumns.length === 0 && <EmptyLine>No footer columns yet.</EmptyLine>}
        {footerColumns.map((col, ci) => (
          <div key={ci} className="min-w-0 space-y-3 rounded-2xl bg-muted/30 p-3 sm:p-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{ci + 1}</span>
              <Input
                aria-label={`Footer column ${ci + 1} heading`}
                placeholder="Column heading"
                value={col.heading}
                onChange={(e) => updateItem("footer_columns", ci, "heading", e.target.value)}
                className="font-medium"
              />
              <IconAction label={`Remove footer column ${ci + 1}`} destructive onClick={() => removeItem("footer_columns", ci)}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </IconAction>
            </div>
            <div className="min-w-0 space-y-4 sm:space-y-2 sm:pl-7">
              {col.links.length === 0 && <EmptyLine>No links in this column.</EmptyLine>}
              {col.links.map((link, li) => (
                <LinkRow
                  key={li}
                  n={li + 1}
                  what={`Column ${ci + 1} link`}
                  label={link.label}
                  href={link.href}
                  onLabel={(v) => updateColumnLink(ci, li, "label", v)}
                  onHref={(v) => updateColumnLink(ci, li, "href", v)}
                  onRemove={() => removeColumnLink(ci, li)}
                />
              ))}
              <AddButton onClick={() => addColumnLink(ci)}>Add link</AddButton>
            </div>
          </div>
        ))}
        <AddButton onClick={() => addItem("footer_columns", { heading: "", links: [{ href: "", label: "" }] })}>
          Add footer column
        </AddButton>
      </SettingsGroup>

      <SettingsGroup title="Footer legal links">
        <div className="min-w-0 space-y-4 sm:space-y-2">
          {footerLegal.length === 0 && <EmptyLine>No legal links yet.</EmptyLine>}
          {footerLegal.map((link, i) => (
            <LinkRow
              key={i}
              n={i + 1}
              what="Legal link"
              label={link.label}
              href={link.href}
              onLabel={(v) => updateItem("footer_legal", i, "label", v)}
              onHref={(v) => updateItem("footer_legal", i, "href", v)}
              onRemove={() => removeItem("footer_legal", i)}
            />
          ))}
        </div>
        <AddButton onClick={() => addItem("footer_legal", { href: "", label: "" })}>Add legal link</AddButton>
      </SettingsGroup>

      <SettingsGroup title="Social links">
        <div className="min-w-0 space-y-4 sm:space-y-2">
          {socialLinks.length === 0 && <EmptyLine>No social links yet.</EmptyLine>}
          {socialLinks.map((link, i) => (
            <div key={i} className="flex min-w-0 items-start gap-2">
              <span className="mt-2.5 hidden w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums sm:block">{i + 1}</span>
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[9rem_minmax(0,1.5fr)_minmax(0,1fr)]">
                <MutedSelect
                  ariaLabel={`Social link ${i + 1} platform`}
                  value={link.platform}
                  onValueChange={(v) => updateItem("social_links", i, "platform", v)}
                  options={SOCIAL_PLATFORMS.map((p) => ({ value: p.value, label: p.label }))}
                />
                <Input aria-label={`Social link ${i + 1} URL`} placeholder="https://…" value={link.url} onChange={(e) => updateItem("social_links", i, "url", e.target.value)} />
                <Input aria-label={`Social link ${i + 1} label`} placeholder="Label" value={link.label} onChange={(e) => updateItem("social_links", i, "label", e.target.value)} />
              </div>
              <IconAction label={`Remove social link ${i + 1}`} destructive onClick={() => removeItem("social_links", i)}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </IconAction>
            </div>
          ))}
        </div>
        <AddButton onClick={() => addItem("social_links", { platform: "twitter", url: "", label: "" })}>Add social link</AddButton>
      </SettingsGroup>

      <SettingsGroup title="Organization (JSON-LD)">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="ss-org-name">
            <Input id="ss-org-name" value={org.name} onChange={(e) => setNested("organization", "name", e.target.value)} placeholder="DEXA" />
          </Field>
          <Field label="URL" htmlFor="ss-org-url">
            <Input id="ss-org-url" value={org.url} onChange={(e) => setNested("organization", "url", e.target.value)} placeholder="https://dexa.com" />
          </Field>
          <Field label="Description" htmlFor="ss-org-description" className="sm:col-span-2">
            <MutedTextarea id="ss-org-description" rows={2} value={org.description} onChange={(e) => setNested("organization", "description", e.target.value)} />
          </Field>
          <Field label="Same as" htmlFor="ss-org-same-as" hint="One profile URL per line" className="sm:col-span-2">
            <LinesTextarea
              id="ss-org-same-as"
              value={org.sameAs || []}
              onChange={(sameAs) => update({ organization: { ...org, sameAs } })}
            />
          </Field>
        </div>
      </SettingsGroup>
    </div>
  );
}
