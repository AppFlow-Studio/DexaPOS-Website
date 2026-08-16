"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Copy,
  ExternalLink,
  Globe,
  Info,
  Loader2,
  PartyPopper,
  Rocket,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { PublishPage } from "@/app/dashboard/website/actions/publish";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { countBrokenBindings } from "@/lib/site-builder/binding-health";
import { diffDocuments } from "@/lib/site-builder/diff";
import { BUILT_SITE_IS_PUBLIC } from "@/lib/site-builder/public-site";
import { validatePage } from "@/lib/site-builder/validate";
import { cn } from "@/lib/utils";
import type { BuilderStore } from "./store";

/**
 * Review and publish.
 *
 * A sheet rather than the popover this replaces. The popover held the same four
 * lists, but publishing is the one irreversible-feeling decision in the editor
 * and it was being made in a 320px box with no room to read a blocking issue,
 * let alone navigate to it. Severity is the organising idea: blockers disable
 * the button and each links to the section that owns it, warnings are shown and
 * explicitly ignorable, and live-data notes are information rather than a
 * problem to solve.
 */
export default function ReviewSheet({
  store,
  clerkOrgId,
  locationId,
  viewUrl,
}: {
  store: BuilderStore;
  clerkOrgId: string;
  locationId: string;
  viewUrl?: string;
}) {
  const open = store((s) => s.reviewOpen);
  const closeReview = store((s) => s.closeReview);
  const doc = store((s) => s.doc);
  const publishedDoc = store((s) => s.publishedDoc);
  const publishedAt = store((s) => s.publishedAt);
  const catalog = store((s) => s.catalog);
  const page = store((s) => s.page);
  const saveState = store((s) => s.saveState);
  const publishResult = store((s) => s.publishResult);
  const select = store((s) => s.select);
  const restoreRequiredSection = store((s) => s.restoreRequiredSection);
  const markPublished = store((s) => s.markPublished);
  const dismissPublishResult = store((s) => s.dismissPublishResult);

  const [pending, startTransition] = useTransition();

  // Where a merchant can actually see this page today. Until the public route
  // exists, the honest answer is the authenticated preview, not `viewUrl` —
  // that address belongs to the ordering storefront (see `public-site.ts`).
  const previewUrl = `/dashboard/website/preview?location=${encodeURIComponent(
    locationId,
  )}&page=${encodeURIComponent(page.id)}`;

  const changes = useMemo(
    () => (publishedDoc ? diffDocuments(publishedDoc, doc) : []),
    [publishedDoc, doc],
  );
  const validation = useMemo(() => validatePage(doc), [doc]);
  const broken = useMemo(() => countBrokenBindings(doc, catalog), [doc, catalog]);

  const neverPublished = publishedDoc === null;
  const hasBlockers = validation.errors.length > 0;
  // Publishing what is stored, not what is on screen: an unsaved draft would
  // publish the previous save. Waiting for autosave is a second, not a feature.
  const waitingOnSave = saveState === "dirty" || saveState === "saving";
  const nothingToPublish = !neverPublished && changes.length === 0;

  const publish = () => {
    startTransition(async () => {
      const result = await PublishPage(clerkOrgId, page.id);
      if (!result.data) {
        toast.error(result.error ?? "Could not publish this page.");
        return;
      }
      markPublished(result.data.document, result.data.publishedAt, {
        versionNumber: result.data.versionNumber,
        publishedAt: result.data.publishedAt,
        unchanged: result.data.unchanged,
      });
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          closeReview();
          dismissPublishResult();
        }
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {publishResult ? (
          <PublishedState
            versionNumber={publishResult.versionNumber}
            unchanged={publishResult.unchanged}
            viewUrl={viewUrl}
            previewUrl={previewUrl}
            onContinue={() => {
              dismissPublishResult();
              closeReview();
            }}
          />
        ) : (
          <>
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle>Review &amp; publish</SheetTitle>
              <SheetDescription>
                {neverPublished
                  ? BUILT_SITE_IS_PUBLIC
                    ? "This page has never been published. Publishing makes it visible to guests."
                    : "This page has never been published. Publishing saves a version of it you can return to."
                  : changes.length === 0
                    ? "Your draft matches what is live."
                    : `${changes.length} change${changes.length === 1 ? "" : "s"} not yet live.`}
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <PublicationTarget page={page} publishedAt={publishedAt} viewUrl={viewUrl} />

              {hasBlockers && (
                <IssueGroup
                  tone="blocker"
                  icon={CircleAlert}
                  title={`${validation.errors.length} issue${validation.errors.length === 1 ? "" : "s"} must be fixed`}
                  hint="Publishing is unavailable until these are resolved."
                >
                  {validation.errors.map((issue, index) => (
                    <li key={index} className="flex items-start gap-2 py-1.5 text-xs">
                      <span className="flex-1 leading-5">{issue.message}</span>
                      {/* A structurally required section is missing. The gallery
                          does not offer these kinds, so without this the blocker
                          is a dead end — the merchant is told to fix something
                          the editor gives them no way to fix. */}
                      {issue.code === "missing_required_section" && issue.kind && (
                        <button
                          type="button"
                          onClick={() => {
                            restoreRequiredSection(issue.kind!, locationId);
                            closeReview();
                          }}
                          className="flex shrink-0 items-center gap-0.5 font-medium underline underline-offset-2"
                        >
                          Add it
                          <ArrowRight className="size-3" />
                        </button>
                      )}
                      {issue.sectionId && (
                        <button
                          type="button"
                          onClick={() => {
                            select(issue.sectionId!);
                            closeReview();
                          }}
                          className="flex shrink-0 items-center gap-0.5 font-medium underline underline-offset-2"
                        >
                          Fix
                          <ArrowRight className="size-3" />
                        </button>
                      )}
                    </li>
                  ))}
                </IssueGroup>
              )}

              {validation.warnings.length > 0 && (
                <IssueGroup
                  tone="warning"
                  icon={TriangleAlert}
                  title={`${validation.warnings.length} suggestion${validation.warnings.length === 1 ? "" : "s"}`}
                  hint="Worth fixing, but they do not stop you publishing."
                >
                  {validation.warnings.map((issue, index) => (
                    <li key={index} className="flex items-start gap-2 py-1.5 text-xs">
                      <span className="flex-1 leading-5">{issue.message}</span>
                      {issue.sectionId && (
                        <button
                          type="button"
                          onClick={() => {
                            select(issue.sectionId!);
                            closeReview();
                          }}
                          className="shrink-0 font-medium underline underline-offset-2"
                        >
                          Review
                        </button>
                      )}
                    </li>
                  ))}
                </IssueGroup>
              )}

              {broken > 0 && (
                <IssueGroup
                  tone="info"
                  icon={Info}
                  title={`${broken} linked menu item${broken === 1 ? "" : "s"} will not appear`}
                  hint="They are 86'd or no longer on a menu at this location. The rest of the page publishes normally."
                >
                  {null}
                </IssueGroup>
              )}

              <ChangeList changes={changes} neverPublished={neverPublished} />
            </div>

            <div className="space-y-2 border-t bg-muted/30 px-5 py-4">
              {waitingOnSave && (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Saving your draft first…
                </p>
              )}
              <Button
                className="w-full"
                disabled={hasBlockers || pending || waitingOnSave || nothingToPublish}
                onClick={publish}
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Rocket className="size-4" />
                )}
                {pending
                  ? "Publishing…"
                  : nothingToPublish
                    ? "Nothing new to publish"
                    : neverPublished
                      ? "Publish page"
                      : "Publish changes"}
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                {hasBlockers
                  ? "Fix the issues above to publish."
                  : BUILT_SITE_IS_PUBLIC
                    ? "Publishing replaces the live version of this page. Your draft stays editable."
                    : "Publishing records a new version of this page. Your draft stays editable."}
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Where this page will land, in the merchant's own terms. */
function PublicationTarget({
  page,
  publishedAt,
  viewUrl,
}: {
  page: { title: string; path: string; isHome: boolean };
  publishedAt: string | null;
  viewUrl?: string;
}) {
  const publicPath = page.isHome || page.path === "" ? "" : `/${page.path}`;

  // `viewUrl` is the ordering storefront. Composing this page's path onto it
  // produces an address that looks canonical and serves something else, so it
  // is only shown once the built site genuinely answers there.
  const fullUrl = BUILT_SITE_IS_PUBLIC && viewUrl ? `${viewUrl}${publicPath}` : null;

  return (
    <div className="rounded-lg border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Globe className="size-3.5 text-muted-foreground" />
            {page.title}
            {page.isHome && (
              <Badge variant="outline" className="px-1 py-0 text-[10px]">
                Home
              </Badge>
            )}
          </p>
          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
            {fullUrl ?? `${publicPath || "/"} — no public web address yet`}
          </p>
        </div>
        {fullUrl && <CopyLinkButton url={fullUrl} />}
      </div>
      <p className="mt-2.5 border-t pt-2.5 text-[11px] text-muted-foreground">
        {!BUILT_SITE_IS_PUBLIC
          ? publishedAt
            ? "Published and versioned. Websites are not being served to guests yet, so this page is visible to your team in preview only."
            : "Not published yet. Publishing saves a version you can go back to; guest-facing websites are not switched on yet."
          : publishedAt
            ? `Live since ${new Date(publishedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}.`
            : "Not published yet — guests cannot see this page."}
      </p>
    </div>
  );
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 shrink-0 gap-1 px-2 text-[11px]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(new URL(url, window.location.origin).toString());
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Could not copy the link.");
        }
      }}
    >
      <Copy className="size-3" />
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function ChangeList({
  changes,
  neverPublished,
}: {
  changes: { kind: string; label: string; sectionId?: string }[];
  neverPublished: boolean;
}) {
  if (neverPublished) {
    return (
      <p className="rounded-lg border border-dashed px-3.5 py-3 text-xs leading-5 text-muted-foreground">
        Everything on this page is new. After the first publish, this list shows exactly what
        changed since guests last saw it.
      </p>
    );
  }

  if (changes.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed px-3.5 py-3 text-xs text-muted-foreground">
        <CheckCircle2 className="size-3.5 text-emerald-600" />
        No changes since the live version.
      </p>
    );
  }

  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        What will change
      </h3>
      <ul className="rounded-lg border px-3.5 py-1.5">
        {changes.map((change, index) => (
          <li
            key={`${change.kind}-${change.sectionId ?? index}`}
            className="flex items-center gap-2 py-1.5 text-xs"
          >
            <span aria-hidden className="size-1 shrink-0 rounded-full bg-muted-foreground/50" />
            <span className="leading-5">{change.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TONES = {
  blocker: "border-destructive/30 bg-destructive/5 text-destructive",
  warning: "border-amber-300/60 bg-amber-50 text-amber-900",
  info: "border-border bg-muted/40 text-foreground",
} as const;

function IssueGroup({
  tone,
  icon: Icon,
  title,
  hint,
  children,
}: {
  tone: keyof typeof TONES;
  icon: typeof CircleAlert;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border px-3.5 py-3", TONES[tone])}>
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <Icon className="size-3.5 shrink-0" />
        {title}
      </p>
      <p className="mt-1 text-[11px] leading-5 opacity-80">{hint}</p>
      {children && <ul className="mt-1.5 border-t border-current/15 pt-1">{children}</ul>}
    </div>
  );
}

/**
 * The success state.
 *
 * Deliberately does not close itself or navigate away. A merchant who just
 * published wants the link — to open it, to check it, to paste it somewhere —
 * and a sheet that vanishes on success takes that away at the exact moment it
 * became useful.
 */
function PublishedState({
  versionNumber,
  unchanged,
  viewUrl,
  previewUrl,
  onContinue,
}: {
  versionNumber: number;
  unchanged: boolean;
  viewUrl?: string;
  previewUrl: string;
  onContinue: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b px-5 py-4">
        <SheetTitle className="flex items-center gap-2">
          <PartyPopper className="size-4 text-emerald-600" />
          {unchanged
            ? "Already published"
            : BUILT_SITE_IS_PUBLIC
              ? "Your page is live"
              : `Version ${versionNumber} published`}
        </SheetTitle>
        <SheetDescription>
          {unchanged
            ? "This draft already matched the published version, so nothing was republished."
            : BUILT_SITE_IS_PUBLIC
              ? `Version ${versionNumber} is now what guests see.`
              : "Saved as a version you can come back to."}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-3 px-5 py-5">
        {BUILT_SITE_IS_PUBLIC ? (
          <>
            {viewUrl && (
              <Button variant="outline" className="w-full justify-start" asChild>
                <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Open the live page
                </a>
              </Button>
            )}
            {viewUrl && <CopyLinkRow url={viewUrl} />}
            <p className="rounded-lg border border-dashed px-3.5 py-3 text-xs leading-5 text-muted-foreground">
              Menu prices, opening hours and 86&rsquo;d items keep updating on the live page on
              their own — you only republish when you change the page itself.
            </p>
          </>
        ) : (
          <>
            <Button variant="outline" className="w-full justify-start" asChild>
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
                Open the preview
              </a>
            </Button>
            {/* Said plainly and once. A merchant who publishes and then cannot
                find their page on the internet will assume they did something
                wrong, and the honest version of this costs one paragraph. */}
            <p className="rounded-lg border border-dashed px-3.5 py-3 text-xs leading-5 text-muted-foreground">
              Websites are not being served to guests yet — that arrives with the public site
              rollout. Everything you publish now is kept as a version, so the page goes out
              exactly as you left it when it does.
            </p>
            <p className="rounded-lg border border-dashed px-3.5 py-3 text-xs leading-5 text-muted-foreground">
              Menu prices, opening hours and 86&rsquo;d items will keep updating on their own —
              you only republish when you change the page itself.
            </p>
          </>
        )}
      </div>

      <div className="border-t bg-muted/30 px-5 py-4">
        <Button className="w-full" onClick={onContinue}>
          Continue editing
        </Button>
      </div>
    </div>
  );
}

function CopyLinkRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="outline"
      className="w-full justify-start"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(new URL(url, window.location.origin).toString());
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Could not copy the link.");
        }
      }}
    >
      <Copy className="size-4" />
      {copied ? "Link copied" : "Copy the link"}
    </Button>
  );
}
