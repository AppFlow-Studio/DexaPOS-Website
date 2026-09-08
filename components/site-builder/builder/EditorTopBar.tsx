"use client";

import {
  ArrowRight,
  CircleAlert,
  ExternalLink,
  Eye,
  Hammer,
  Info,
  Loader2,
  Rocket,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PublishPage } from "@/app/dashboard/website/actions/publish";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { diffDocuments } from "@/lib/site-builder/diff";
import { sitePublicUrl } from "@/lib/site-builder/public-url";
import { SECTION_REGISTRY } from "@/lib/site-builder/sections/registry";
import { validatePage, type ValidationIssue } from "@/lib/site-builder/validate";
import { cn } from "@/lib/utils";
import { websiteRoutes } from "../routes";
import OverlayChrome from "../shell/OverlayChrome";
import DeviceSwitch from "./DeviceSwitch";
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
  subdomain,
  children,
}: {
  store: BuilderStore;
  clerkOrgId: string;
  locationId: string;
  /** The site's claimed web address, or null while it has none. */
  subdomain: string | null;
  children: React.ReactNode;
}) {
  const page = store((s) => s.page);
  const mode = store((s) => s.mode);
  const setMode = store((s) => s.setMode);
  const previewDevice = store((s) => s.previewDevice);
  const setPreviewDevice = store((s) => s.setPreviewDevice);
  const openPageSettings = store((s) => s.openPageSettings);

  /*
    Where this page can be seen for real, once both halves exist: something
    published, and an address to serve it at. Read from the store rather than a
    prop so it appears the moment Publish succeeds — `markPublished` sets
    `publishedAt`, and a merchant who has just published is exactly who wants
    to go and look.
  */
  const liveUrl =
    subdomain && page.publishedAt ? sitePublicUrl(subdomain, page.path) : null;

  return (
    <OverlayChrome
      title={page.title}
      // The page's own name is the way into its settings — renaming it, its
      // URL, and removing it. Only in Build: Preview closes the drawer by
      // design, so a title that opened it there would appear to do nothing.
      onTitleClick={mode === "build" ? openPageSettings : undefined}
      closeHref={websiteRoutes.pages(locationId)}
      centre={
        <div className="flex items-center gap-2">
          <ModeSwitch mode={mode} onChange={setMode} />
          {mode === "preview" && (
            <DeviceSwitch device={previewDevice} onChange={setPreviewDevice} />
          )}
        </div>
      }
      action={
        <div className="flex items-center gap-2">
          {/* Quiet, and to the left of Publish: looking at the live page is a
              detour from the job, not the job. */}
          {liveUrl && (
            <Button variant="ghost" size="sm" asChild>
              <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
                <span className="hidden sm:inline">View</span>
              </a>
            </Button>
          )}
          <PublishButton store={store} clerkOrgId={clerkOrgId} locationId={locationId} />
        </div>
      }
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
          // The label is the accessible name at every width; below `sm` it is
          // the icon that carries it visually, so the switch and the page title
          // can share a 420px header without either being squeezed out.
          aria-label={label}
          onClick={() => onChange(id)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all sm:px-3",
            mode === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          <span className="hidden sm:inline">{label}</span>
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
  const mode = store((s) => s.mode);
  const publishedDoc = store((s) => s.publishedDoc);
  const publishing = store((s) => s.publishing);
  const saveState = store((s) => s.saveState);
  const select = store((s) => s.select);
  const openAddSection = store((s) => s.openAddSection);
  const restoreRequiredSection = store((s) => s.restoreRequiredSection);
  const setPublishing = store((s) => s.setPublishing);
  const markPublished = store((s) => s.markPublished);
  const [issuesOpen, setIssuesOpen] = useState(false);

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

  /*
    Every issue, not just the first.

    This panel used to render `validation.errors[0]` and count the rest as "and
    1 more", which on a page with two unconfigured Form sections told a merchant
    that *a* form needed choosing and gave them no way to learn which. Each row
    now names its own section and carries its own way in.

    Warnings come after the errors, muted and non-blocking. They have existed in
    `validatePage` since it was written — "FAQ is empty and will not show
    anything", "Gallery has no photos yet" — and nothing in the product ever
    rendered one, so a merchant typed a heading, published, and watched the
    section and their sentence disappear with no signal anywhere.
  */
  const issues = [...validation.errors, ...validation.warnings];
  const issueCount = issues.length;

  return (
    /*
      A real popover, anchored on the publish control.

      What this replaced was an `absolute` div that was simply *always there*
      while the page was invalid: no dismissal, present in Preview, and above
      every scrim in the product because it out-stacked them by accident. Radix
      gives dismissal, Escape handling and correct stacking for nothing.

      Anchored rather than triggered, because the Publish button is disabled
      while blocked — which is the honest signal and stays — and a disabled
      button cannot open anything. The count beside it is the trigger.
    */
    <Popover open={issuesOpen} onOpenChange={setIssuesOpen}>
      <PopoverAnchor asChild>
        <div className="flex items-center gap-2">
          {/* Build only. A blocker has no business in a mode whose whole job is
              to look like the published site. */}
          {mode === "build" && issueCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setIssuesOpen((open) => !open)}
              aria-expanded={issuesOpen}
              className={cn(
                "gap-1.5 px-2 text-xs",
                blocked ? "text-destructive hover:text-destructive" : "text-muted-foreground",
              )}
            >
              {blocked ? <CircleAlert className="size-3.5" /> : <Info className="size-3.5" />}
              {issueCount === 1 ? "1 issue" : `${issueCount} issues`}
            </Button>
          )}

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
        </div>
      </PopoverAnchor>

      <PopoverContent align="end" className="w-80 p-0">
        <ul className="max-h-80 divide-y overflow-y-auto">
          {issues.map((issue, index) => (
            <IssueRow
              key={`${issue.code}-${issue.sectionId ?? index}`}
              issue={issue}
              onSelect={(sectionId) => {
                select(sectionId);
                setIssuesOpen(false);
              }}
              onRestore={(kind) => {
                restoreRequiredSection(kind, locationId);
                setIssuesOpen(false);
              }}
              onAddSection={() => {
                openAddSection();
                setIssuesOpen(false);
              }}
            />
          ))}
        </ul>

        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          {blocked
            ? "The ones in red have to be fixed before this page can be published."
            : "Nothing here blocks publishing."}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * One issue, and the shortest route to fixing it.
 *
 * The action follows from the issue's own code rather than from its position in
 * the list, which is what makes a list of them possible at all.
 */
function IssueRow({
  issue,
  onSelect,
  onRestore,
  onAddSection,
}: {
  issue: ValidationIssue;
  onSelect: (sectionId: string) => void;
  onRestore: (kind: NonNullable<ValidationIssue["kind"]>) => void;
  onAddSection: () => void;
}) {
  const isError = issue.severity === "error";
  const missingRequired =
    issue.code === "missing_required_section" && issue.kind ? issue.kind : null;

  return (
    <li className="flex items-start gap-2 p-3">
      {isError ? (
        <CircleAlert className="mt-px size-3.5 shrink-0 text-destructive" />
      ) : (
        <Info className="mt-px size-3.5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[11px] leading-5",
            isError ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {issue.message}
        </p>

        {missingRequired ? (
          <IssueAction onClick={() => onRestore(missingRequired)}>
            Add {SECTION_REGISTRY[missingRequired].label}
          </IssueAction>
        ) : issue.code === "empty_page" ? (
          <IssueAction onClick={onAddSection}>Add section</IssueAction>
        ) : issue.sectionId ? (
          <IssueAction onClick={() => onSelect(issue.sectionId!)}>Fix it</IssueAction>
        ) : null}
      </div>
    </li>
  );
}

function IssueAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium underline underline-offset-2"
    >
      {children}
      <ArrowRight className="size-3" />
    </button>
  );
}
