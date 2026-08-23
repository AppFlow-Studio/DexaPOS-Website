"use client";

import { ArrowRight, CircleAlert, Eye, Hammer, Loader2, Rocket } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { PublishPage } from "@/app/dashboard/website/actions/publish";
import { Button } from "@/components/ui/button";
import { diffDocuments } from "@/lib/site-builder/diff";
import { SECTION_REGISTRY } from "@/lib/site-builder/sections/registry";
import { validatePage } from "@/lib/site-builder/validate";
import { cn } from "@/lib/utils";
import { websiteRoutes } from "../routes";
import OverlayChrome from "../shell/OverlayChrome";
import type { BuilderStore, EditorMode } from "./store";

/**
 * The editor's chrome: leave, name, mode, publish.
 *
 * This replaced a 519-line toolbar carrying a page switcher, three device
 * widths, undo, redo, an external link and a two-line save/publish status
 * stack. All of it worked. None of it answered the question a merchant has
 * while editing, which is "is this live yet" — and the old answer was spread
 * across two status lines and a review sheet behind a badge.
 *
 * What survives is the one thing that was load-bearing: **publishing is still
 * gated on validation**. It is the only safety rail kept from the old review
 * sheet, and it is expressed as a disabled button with one line of red beneath
 * it rather than a panel of four issue categories.
 */
export default function EditorTopBar({
  store,
  clerkOrgId,
  locationId,
  children,
}: {
  store: BuilderStore;
  clerkOrgId: string;
  locationId: string;
  children: React.ReactNode;
}) {
  const page = store((s) => s.page);
  const mode = store((s) => s.mode);
  const setMode = store((s) => s.setMode);
  const openPageSettings = store((s) => s.openPageSettings);

  return (
    <OverlayChrome
      title={page.title}
      // The page's own name is the way into its settings — renaming it, its
      // URL, and removing it. Only in Build: Preview closes the drawer by
      // design, so a title that opened it there would appear to do nothing.
      onTitleClick={mode === "build" ? openPageSettings : undefined}
      closeHref={websiteRoutes.pages(locationId)}
      centre={<ModeSwitch mode={mode} onChange={setMode} />}
      action={<PublishButton store={store} clerkOrgId={clerkOrgId} locationId={locationId} />}
    >
      {children}
    </OverlayChrome>
  );
}

/**
 * Build and Preview as two labelled halves.
 *
 * The behavioural difference is large — in one mode a click on a link selects
 * the section around it, in the other it follows the link — and the icon-only
 * toggle this replaced could not carry that.
 */
function ModeSwitch({
  mode,
  onChange,
}: {
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
}) {
  const options: { id: EditorMode; label: string; Icon: typeof Eye }[] = [
    { id: "build", label: "Build", Icon: Hammer },
    { id: "preview", label: "Preview", Icon: Eye },
  ];

  return (
    <div
      role="group"
      aria-label="Editing mode"
      className="flex items-center gap-0.5 rounded-lg border bg-muted/60 p-0.5"
    >
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={mode === id}
          onClick={() => onChange(id)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
            mode === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

function PublishButton({
  store,
  clerkOrgId,
  locationId,
}: {
  store: BuilderStore;
  clerkOrgId: string;
  locationId: string;
}) {
  const doc = store((s) => s.doc);
  const page = store((s) => s.page);
  const publishedDoc = store((s) => s.publishedDoc);
  const publishing = store((s) => s.publishing);
  const saveState = store((s) => s.saveState);
  const select = store((s) => s.select);
  const openAddSection = store((s) => s.openAddSection);
  const restoreRequiredSection = store((s) => s.restoreRequiredSection);
  const setPublishing = store((s) => s.setPublishing);
  const markPublished = store((s) => s.markPublished);

  const validation = useMemo(() => validatePage(doc), [doc]);
  const changes = useMemo(
    () => (publishedDoc ? diffDocuments(publishedDoc, doc) : []),
    [publishedDoc, doc],
  );

  const blocked = validation.errors.length > 0;
  const neverPublished = publishedDoc === null;
  const nothingToPublish = !neverPublished && changes.length === 0;
  // Publishing what is stored, not what is on screen: an unsaved draft would
  // publish the previous save. Waiting for autosave is a second, not a feature.
  const waitingOnSave = saveState === "dirty" || saveState === "saving";

  const publish = async () => {
    setPublishing(true);
    try {
      const result = await PublishPage(clerkOrgId, page.id);
      if (!result.data) {
        toast.error(result.error ?? "Could not publish this page.");
        setPublishing(false);
        return;
      }
      markPublished(result.data.document, result.data.publishedAt);
      toast.success(
        result.data.unchanged
          ? "That draft was already published."
          : `“${page.title}” is live.`,
      );
    } catch (error) {
      console.error("[site-builder] publish failed:", error);
      toast.error("Could not publish this page.");
      setPublishing(false);
    }
  };

  const blocker = validation.errors[0];
  const missingRequired =
    blocker?.code === "missing_required_section" && blocker.kind ? blocker.kind : null;
  const canAddFirstSection = blocker?.code === "empty_page";

  return (
    <div className="relative">
      <Button
        size="sm"
        disabled={blocked || publishing || waitingOnSave || nothingToPublish}
        onClick={publish}
      >
        {publishing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Rocket className="size-3.5" />
        )}
        {nothingToPublish ? "Published" : "Publish"}
      </Button>

      {blocked && blocker && (
        // Positioned rather than inline: the bar is 56px and this is the only
        // thing in the editor that ever needs to say more than a word.
        <div className="absolute right-0 top-full z-10 mt-2 flex w-72 items-start gap-2 rounded-lg border border-destructive/30 bg-background p-3 text-left shadow-md">
          <CircleAlert className="mt-px size-3.5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] leading-5 text-foreground">{blocker.message}</p>
            {blocker.sectionId && (
              <button
                type="button"
                onClick={() => select(blocker.sectionId!)}
                className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium underline underline-offset-2"
              >
                Fix it
                <ArrowRight className="size-3" />
              </button>
            )}
            {missingRequired && (
              <button
                type="button"
                onClick={() => restoreRequiredSection(missingRequired, locationId)}
                className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium underline underline-offset-2"
              >
                Add {SECTION_REGISTRY[missingRequired].label}
                <ArrowRight className="size-3" />
              </button>
            )}
            {canAddFirstSection && (
              <button
                type="button"
                onClick={() => openAddSection()}
                className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium underline underline-offset-2"
              >
                Add section
                <ArrowRight className="size-3" />
              </button>
            )}
            {validation.errors.length > 1 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                and {validation.errors.length - 1} more
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
