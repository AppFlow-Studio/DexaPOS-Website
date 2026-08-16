"use client";

import {
  ArrowRight,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileText,
  Globe2,
  MonitorSmartphone,
  Palette,
  PencilLine,
  Rocket,
  Settings2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { MerchantSiteRow, SitePageSummary } from "@/lib/site-builder/db-types";
import PageListCard from "./PageListCard";
import WebAddressCard from "./WebAddressCard";

type WebsiteOverviewProps = {
  clerkOrgId: string;
  locationId: string;
  storeName: string;
  storeUrl: string | null;
  website: MerchantSiteRow | null;
  pages: SitePageSummary[];
  dataAvailable: boolean;
};

export default function WebsiteOverview({
  clerkOrgId,
  locationId,
  storeName,
  storeUrl,
  website,
  pages,
  dataAvailable,
}: WebsiteOverviewProps) {
  const builderHref = `/dashboard/website/builder?location=${encodeURIComponent(locationId)}`;
  const previewHref = `/dashboard/website/preview?location=${encodeURIComponent(locationId)}`;
  const designHref = `/dashboard/website/design?location=${encodeURIComponent(locationId)}`;
  const hasPublishedPage = pages.some((page) => page.status === "published");
  const isPublished = Boolean(website?.last_published_at || hasPublishedPage);
  const isStarted = Boolean(website || pages.length > 0);
  const hasAddress = Boolean(website?.subdomain);
  const completed = [isStarted, pages.length > 0, hasAddress, isPublished].filter(Boolean).length;
  const status = isPublished ? "Published" : isStarted ? "Draft" : "Not started";

  const copyUrl = async () => {
    if (!storeUrl) return;
    try {
      await navigator.clipboard.writeText(window.location.origin + storeUrl);
      toast.success("Online-store link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-7 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Website</h1>
            <Badge variant={isPublished ? "default" : "secondary"}>{status}</Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Build your brand site and guide visitors to {storeName}&rsquo;s online store.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isStarted && (
            <Button variant="outline" asChild>
              <Link href={previewHref}>
                <MonitorSmartphone className="mr-2 h-4 w-4" />
                Preview
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href={builderHref}>
              {isStarted ? <PencilLine className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {isStarted ? "Continue editing" : "Create website"}
            </Link>
          </Button>
        </div>
      </header>

      {!dataAvailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
          Website data is not available yet. You can still start designing a draft; published-site status and page management will appear once the Website database migration is enabled.
        </div>
      )}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.9fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/25">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Website readiness</CardTitle>
                <CardDescription className="mt-1">Complete the essentials, then review your site before publishing.</CardDescription>
              </div>
              <span className="shrink-0 text-sm font-semibold">{completed}/4</span>
            </div>
            <Progress value={completed * 25} className="mt-4 h-2" />
          </CardHeader>
          <CardContent className="divide-y p-0">
            <ChecklistItem done={isStarted} title="Create your website" detail="Choose a starting layout and add your restaurant&rsquo;s essentials." href={builderHref} action={isStarted ? "Edit" : "Start"} />
            <ChecklistItem done={pages.length > 0} title="Add your home page content" detail="Make the restaurant&rsquo;s story, location, and primary action clear." href={builderHref} action="Edit page" />
            <ChecklistItem done={hasAddress} title="Choose your web address" detail={hasAddress ? `Your website is served at ${website?.subdomain}.dexaposai.com.` : "Your website is only reachable once it has an address of its own. Your online-ordering links are separate and stay as they are."} href="#web-address" action={hasAddress ? "Change" : "Choose"} />
            <ChecklistItem done={isPublished} title="Review and publish" detail="Check desktop and mobile layouts before making the website live." href={builderHref} action="Review" />
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-2 text-muted-foreground"><Globe2 className="h-5 w-5" /><span className="text-sm font-medium">Your online destination</span></div>
            <CardTitle className="pt-2">{storeName}</CardTitle>
            <CardDescription>Visitors can reach your online store directly while your Website grows as the branded entry point.</CardDescription>
          </CardHeader>
          <CardContent className="mt-auto space-y-3">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground break-all">{storeUrl ?? "Store URL will appear after Online Store setup"}</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!storeUrl} onClick={copyUrl}><Clipboard className="mr-2 h-4 w-4" />Copy link</Button>
              {storeUrl && <Button variant="outline" size="sm" asChild><Link href={storeUrl} target="_blank"><ExternalLink className="mr-2 h-4 w-4" />Open store</Link></Button>}
            </div>
          </CardContent>
        </Card>
      </section>

      {website && (
        <WebAddressCard
          // The readiness checklist links here.
          id="web-address"
          clerkOrgId={clerkOrgId}
          siteId={website.id}
          storeName={storeName}
          subdomain={website.subdomain}
          isPublished={isPublished}
        />
      )}

      {website && (
        <PageListCard
          // The editor's "Manage pages" links here.
          id="pages"
          clerkOrgId={clerkOrgId}
          siteId={website.id}
          locationId={locationId}
          pages={pages}
        />
      )}

      <section className="grid gap-5 md:grid-cols-2">
        <OverviewAction icon={Palette} title="Design" description="Set your site-wide color, type, and shape language without changing page content." href={designHref} action="Open design" />
        <OverviewAction icon={Settings2} title="SEO & settings" description="Set page titles, social sharing details, and other site-wide preferences." href={builderHref} action="Open settings" />
      </section>

      <section className="rounded-2xl border bg-gradient-to-br from-primary/[0.07] via-background to-background p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><Rocket className="h-4 w-4" />Next best action</div>
            <h2 className="text-xl font-semibold">{isPublished ? "Keep your website current" : isStarted ? "Review your draft on mobile" : "Start with a restaurant-ready homepage"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{isPublished ? "Refresh seasonal content, featured items, or photos whenever your restaurant changes." : "A focused homepage with a clear Order Online action is the fastest route to a useful restaurant website."}</p>
          </div>
          <Button asChild><Link href={isStarted ? previewHref : builderHref}>{isStarted ? "Preview website" : "Choose a layout"}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
      </section>
    </div>
  );
}

function ChecklistItem({ done, title, detail, href, action }: { done: boolean; title: string; detail: string; href: string; action: string }) {
  return <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${done ? "text-emerald-600" : "text-muted-foreground/50"}`} /><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-sm text-muted-foreground">{detail}</p></div></div><Button variant="ghost" size="sm" asChild><Link href={href}>{done ? "View" : action}<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button></div>;
}

function OverviewAction({ icon: Icon, title, description, href, action }: { icon: typeof FileText; title: string; description: string; href: string; action: string }) {
  return <Card><CardHeader><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><CardTitle className="pt-2">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><Button variant="outline" size="sm" asChild><Link href={href}>{action}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card>;
}
