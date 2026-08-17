"use client";

import { ArrowRight, FileText, Image as ImageIcon, Loader2, Newspaper } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { CreatePage } from "@/app/dashboard/website/actions/pages";
import { SaveDraft } from "@/app/dashboard/website/actions/draft";
import { renderCanvas } from "@/app/dashboard/website/builder/render-canvas";
import { Button } from "@/components/ui/button";
import { createPageFromTemplate, type PageTemplateId } from "@/lib/site-builder/page-templates";
import { checkPagePath, slugifyPagePath } from "@/lib/site-builder/reserved-paths";
import { websiteRoutes } from "../routes";
import OverlayChrome from "../shell/OverlayChrome";
import TemplatePicker, { type TemplateOption } from "../shell/TemplatePicker";

const TEMPLATES: TemplateOption[] = [
  { id: "article", label: "Article", icon: Newspaper },
  { id: "showcase", label: "Showcase", icon: ImageIcon },
  { id: "blank", label: "Blank", icon: FileText },
];

/**
 * Creating a page.
 *
 * **The preview is the real renderer.** `renderCanvas` is the same Server Action
 * the editor uses, so what a merchant picks is literally what they will get —
 * their own logo, their brand colours, their footer, their opening hours. A
 * picker that previews with stock thumbnails is asking them to trust a drawing.
 *
 * **One field, deliberately.** Owner's picker asks for nothing but the template
 * and names the page afterwards. Adding the name here is a small, considered
 * departure: without it two pages created in a row both want `/new-page` and the
 * second fails on a unique constraint the merchant did nothing to deserve. One
 * input removes that failure mode entirely, and the address is still derived —
 * it is only editable later, in page settings, where changing it is a decision
 * with consequences rather than a step in a wizard.
 */
export default function NewPageOverlay({
  clerkOrgId,
  locationId,
  siteId,
}: {
  clerkOrgId: string;
  locationId: string;
  siteId: string;
}) {
  const router = useRouter();
  const [template, setTemplate] = useState<PageTemplateId>("article");
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState<React.ReactNode>(null);
  const [rendering, setRendering] = useState(true);
  const [pending, startTransition] = useTransition();

  const trimmed = title.trim();
  const path = slugifyPagePath(trimmed);
  const pathCheck = checkPagePath(path);
  const valid = trimmed.length > 0 && path !== "" && pathCheck.ok;

  usePreview(template, trimmed, locationId, setPreview, setRendering);

  const create = () => {
    if (!valid) return;
    startTransition(async () => {
      const created = await CreatePage(clerkOrgId, siteId, { title: trimmed, path });
      if (!created.data) {
        toast.error(created.error ?? "Could not create the page.");
        return;
      }

      // `CreatePage` seeds an empty document — applying the template is a second
      // write rather than a parameter, which keeps the create action ignorant of
      // templates and the template list free to change without a server deploy.
      const document = createPageFromTemplate(template, { locationId, title: trimmed });
      const saved = await SaveDraft(clerkOrgId, created.data.id, document, created.data.revision);

      if (saved.error) {
        // The page exists and is reachable; only its starting content is missing.
        // Sending them to it beats leaving them on a dialog that appears to have
        // failed while a half-made page sits in their list.
        toast.warning("The page was created, but its template could not be applied.");
      }

      router.push(websiteRoutes.editor(locationId, created.data.id));
    });
  };

  return (
    <OverlayChrome
      title="New Page"
      closeHref={websiteRoutes.pages(locationId)}
      action={
        <Button size="sm" disabled={!valid || pending} onClick={create}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Create
          {!pending && <ArrowRight className="size-4" />}
        </Button>
      }
    >
      <TemplatePicker
        description="Start your page design with a pre-built template or make your own."
        options={TEMPLATES}
        selectedId={template}
        onSelect={(id) => setTemplate(id as PageTemplateId)}
        preview={
          <div className={rendering ? "opacity-50 transition-opacity" : "transition-opacity"}>
            {preview}
          </div>
        }
      >
        <label className="mb-5 block">
          <span className="mb-1.5 block text-xs font-semibold">Page name</span>
          <input
            autoFocus
            type="text"
            value={title}
            placeholder="About us"
            onChange={(event) => setTitle(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {trimmed && !valid ? (
            <span className="mt-1.5 block text-[11px] text-destructive">
              {pathCheck.message ?? "That name cannot be turned into a page address."}
            </span>
          ) : (
            <span className="mt-1.5 block truncate font-mono text-[11px] text-muted-foreground">
              /{path || "…"}
            </span>
          )}
        </label>
      </TemplatePicker>
    </OverlayChrome>
  );
}

/**
 * Renders the chosen template through the real pipeline.
 *
 * Debounced, and guarded by a monotonic token so a slow render of the template
 * the merchant has already moved on from cannot overwrite a newer one.
 */
function usePreview(
  template: PageTemplateId,
  title: string,
  locationId: string,
  setPreview: (node: React.ReactNode) => void,
  setRendering: (rendering: boolean) => void,
) {
  const latest = useRef(0);

  useEffect(() => {
    const token = ++latest.current;
    setRendering(true);

    const timer = setTimeout(async () => {
      try {
        const doc = createPageFromTemplate(template, {
          locationId,
          title: title || "Your new page",
        });
        const node = await renderCanvas(doc, locationId);
        if (token === latest.current) setPreview(node);
      } catch (error) {
        console.error("[site-builder] template preview failed:", error);
      } finally {
        if (token === latest.current) setRendering(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [template, title, locationId, setPreview, setRendering]);
}
