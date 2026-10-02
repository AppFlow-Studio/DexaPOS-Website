"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

import SectionEditor from "@/components/cms/SectionEditor";
import { Field, MutedSelect, MutedTextarea } from "@/components/cms/cms-fields";
import { PageHeader, PageShell, Panel, PanelSection } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section } from "@/lib/cms/cms-sections";
import { pageEditorHref, pagePreviewHref, pagesListHref, routeToSlug } from "../../lib/paths";

export interface EditorCategory {
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
  updated_at?: string | null;
  isNew?: boolean;
}

function formatSavedDay(value: string) {
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function PageEditorClient({
  data: initial,
  categories,
  back,
}: {
  data: PageData;
  categories: EditorCategory[];
  /** The pages list's query, carried so Back returns to the same page of 10 (§5.9). */
  back?: string;
}) {
  const backHref = pagesListHref(back);
  const [data, setData] = useState<PageData>(initial);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [routeError, setRouteError] = useState("");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const router = useRouter();
  const isNewRef = useRef(initial.isNew);
  const originalRouteRef = useRef(initial.route);
  const latestData = useRef(data);

  useEffect(() => {
    latestData.current = data;
  }, [data]);

  const executeSave = useCallback(async (publish: boolean) => {
    const d = latestData.current;
    const newRoute = d.route;
    // An emptied route field reads as `/`, which is only valid for the home
    // page itself — anything else would overwrite it.
    const isHome = originalRouteRef.current === "/";
    if (!newRoute || newRoute === "/new" || (newRoute === "/" && !isHome)) {
      setRouteError("Enter a route for the page.");
      toast.error("Page route is required");
      return false;
    }
    setSaving(publish ? "publish" : "draft");
    setRouteError("");
    try {
      // Always PUT to the original route so the API knows which page to migrate
      const originalSlug = routeToSlug(originalRouteRef.current);
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

      // A new page, or a renamed one, now lives at a different editor URL.
      if (isNewRef.current || newRoute !== originalRouteRef.current) {
        isNewRef.current = false;
        originalRouteRef.current = newRoute;
        router.push(pageEditorHref(newRoute, back));
        router.refresh();
      }

      setLastSaved(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
      setData((prev) => ({ ...prev, published: publish, isNew: false }));
      toast.success(publish ? "Page published" : "Draft saved");
      return true;
    } catch (err) {
      toast.error("Couldn't save the page", {
        description: err instanceof Error ? err.message : undefined,
      });
      return false;
    } finally {
      setSaving(null);
    }
  }, [router, back]);

  const update = <K extends keyof PageData>(key: K, value: PageData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const categoryValue = categories.some((c) => c.slug === data.category) ? data.category : "";

  const saveActions = (
    <>
      <Button
        variant="outline"
        className="h-9 px-4 text-[0.8125rem] font-medium shadow-sm"
        onClick={() => void executeSave(false)}
        disabled={!!saving}
      >
        {saving === "draft" ? "Saving…" : "Save draft"}
      </Button>
      <Button
        className="h-9 px-4 text-[0.8125rem] font-medium"
        onClick={() => void executeSave(true)}
        disabled={!!saving}
      >
        {saving === "publish" ? "Publishing…" : "Publish"}
      </Button>
    </>
  );

  return (
    <PageShell as="div">
      <PageHeader
        title={initial.isNew ? "New page" : initial.cms_title || initial.title || initial.route}
        subtitle={data.route}
        showSubtitleOnMobile
        subtitleClassName="font-mono"
        backHref={backHref}
        backLabel="Back to Pages"
        stackActionsBelowIndicatorOnMobile
        indicator={
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">
              {data.isNew ? "Not saved yet" : data.published ? "Published" : "Draft"}
            </Badge>
            {lastSaved ? (
              <span className="tabular-nums">Saved {lastSaved}</span>
            ) : (
              initial.updated_at && (
                <span className="tabular-nums" suppressHydrationWarning>
                  Updated {formatSavedDay(initial.updated_at)}
                </span>
              )
            )}
          </span>
        }
        actions={
          <>
            {!data.isNew && (
              <Button variant="outline" className="h-9 px-4 text-[0.8125rem] font-medium shadow-sm" asChild>
                <a href={pagePreviewHref(data.route)} target="_blank" rel="noopener noreferrer">
                  Preview
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              </Button>
            )}
            {saveActions}
          </>
        }
      />

      <Panel>
        <PanelSection label="Page details" caption="Where the page lives and how it appears in search results">
          <div className="grid min-w-0 gap-5 md:grid-cols-2">
            <Field
              label="Route"
              htmlFor="page-route"
              hint={
                routeError ? undefined : data.isNew ? "The page's URL on the site" : "Changing this moves the page to a new URL"
              }
            >
              <div className="flex min-w-0 items-center">
                <span className="flex h-9 shrink-0 items-center rounded-l-full bg-muted px-3 text-sm text-muted-foreground">
                  /
                </span>
                <Input
                  id="page-route"
                  value={data.route.replace(/^\//, "")}
                  onChange={(e) => {
                    update("route", "/" + e.target.value.replace(/^\//, ""));
                    setRouteError("");
                  }}
                  placeholder="page-route"
                  aria-invalid={!!routeError || undefined}
                  aria-describedby={routeError ? "page-route-error" : undefined}
                  className="rounded-l-none font-mono"
                />
              </div>
              {routeError && (
                <p id="page-route-error" className="text-sm text-destructive">
                  {routeError}
                </p>
              )}
            </Field>

            <Field label="Category" htmlFor="page-category" hint="Groups the page in this editor">
              <MutedSelect
                id="page-category"
                value={categoryValue}
                onValueChange={(v) => update("category", v)}
                options={categories.map((c) => ({ value: c.slug, label: c.name }))}
                placeholder="No category"
              />
            </Field>

            <Field label="Internal name" htmlFor="page-cms-title" hint="Only shown in this editor">
              <Input
                id="page-cms-title"
                value={data.cms_title}
                onChange={(e) => update("cms_title", e.target.value)}
                placeholder="Internal reference name"
              />
            </Field>

            <Field label="SEO title" htmlFor="page-title" hint="Shown in the browser tab and search results">
              <Input id="page-title" value={data.title} onChange={(e) => update("title", e.target.value)} />
            </Field>

            <Field
              label="Meta description"
              htmlFor="page-description"
              hint="Shown under the title in search results"
              className="md:col-span-2"
            >
              <MutedTextarea
                id="page-description"
                value={data.description}
                onChange={(e) => update("description", e.target.value)}
                rows={3}
              />
            </Field>
          </div>
        </PanelSection>
      </Panel>

      <Panel>
        <PanelSection
          label="Content sections"
          caption="Open a section to edit it; drag it or use the arrows to reorder"
        >
          <SectionEditor sections={data.sections || []} onChange={(sections) => update("sections", sections)} />
        </PanelSection>
      </Panel>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" className="h-9 px-4 text-[0.8125rem] font-medium" asChild>
          <Link href={backHref}>Cancel</Link>
        </Button>
        {saveActions}
      </div>
    </PageShell>
  );
}
