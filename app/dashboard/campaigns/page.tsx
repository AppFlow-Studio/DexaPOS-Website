"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Megaphone, MessageSquare, RefreshCw, Search } from "lucide-react";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { formatMessageError } from "@/lib/messaging/message-error";
import { deliveryDescription, deliveryLabel, messagePurpose } from "@/lib/messaging/message-presentation";
import { PageHeader, PageShell, Panel, PanelSection } from "@/components/dashboard/shell";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCampaigns, getMessages } from "./actions";
import type { Campaign, Message, MessageFilters } from "./types";
import { MessagePreview } from "./MessagePreview";

const date = (value: string | null) => value ? new Date(value).toLocaleString() : "Not available";

export default function CampaignsPage() {
  const clerkOrgId = useClerkOrgId();
  // Clear open details and filters when switching merchants.
  return <Suspense fallback={<LoadingRows />}><CampaignsWorkspace key={clerkOrgId} clerkOrgId={clerkOrgId} /></Suspense>;
}

function CampaignsWorkspace({ clerkOrgId }: { clerkOrgId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("view") === "messages" ? "messages" : "campaigns";
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  return (
    <PageShell>
      <PageHeader
        title="Campaigns"
        subtitle="See your marketing campaigns, customer messages, and delivery updates."
        actions={<Button variant="outline" className="rounded-full" asChild><Link href="/dashboard/customers">Manage customers</Link></Button>}
      />
      <nav aria-label="Campaign views" className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl bg-muted/60 p-1 sm:rounded-full">
        <Link href="/dashboard/campaigns?view=campaigns" scroll={false} aria-current={tab === "campaigns" ? "page" : undefined}
          className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 ${tab === "campaigns" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <Megaphone className="h-4 w-4" />Campaign history
        </Link>
        <Link href="/dashboard/campaigns?view=messages" scroll={false} onClick={() => setCampaign(null)} aria-current={tab === "messages" ? "page" : undefined}
          className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 ${tab === "messages" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <MessageSquare className="h-4 w-4" />Customer messages
        </Link>
      </nav>
      {tab === "campaigns" ? (
        <CampaignHistory clerkOrgId={clerkOrgId} onViewMessages={(selected) => { setCampaign(selected); router.push("/dashboard/campaigns?view=messages", { scroll: false }); }} />
      ) : (
        <MessageLog key={campaign?.id ?? "all"} clerkOrgId={clerkOrgId} campaign={campaign} onClearCampaign={() => setCampaign(null)} />
      )}
    </PageShell>
  );
}

function CampaignHistory({ clerkOrgId, onViewMessages }: { clerkOrgId: string; onViewMessages: (campaign: Campaign) => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const query = useQuery({
    queryKey: ["campaigns-page", clerkOrgId, page, debouncedSearch],
    queryFn: () => getCampaigns(clerkOrgId, { page, search: debouncedSearch }),
    enabled: !!clerkOrgId,
    refetchInterval: 15_000,
  });
  return (
    <>
    <Panel className="border-0">
      <PanelSection icon={Megaphone} label="Campaign history" caption="Review the text and email campaigns your business has created."
        action={<RefreshButton busy={query.isFetching} onClick={() => void query.refetch()} />}>
        <SearchInput label="Search campaigns" placeholder="Search campaign names..." value={search} onChange={(value) => { setSearch(value); setPage(1); }} />
        {query.isError ? <LoadError onRetry={() => void query.refetch()} /> : query.isPending ? <LoadingRows /> : (
          <>
            <p className="my-4 text-sm text-muted-foreground" aria-live="polite">{query.data.pagination.total.toLocaleString()} campaigns</p>
            {query.data.data.length === 0 ? <EmptyState title="No campaigns found" description="Campaigns created from Customers appear here. Try another search or check back after a send." page={page} onReset={() => setPage(1)} /> : (
              <div className="space-y-3">
                {query.data.data.map((item) => (
                  <article key={item.id} className="rounded-2xl bg-muted/40 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words font-semibold"><button type="button" onClick={() => setSelected(item)} className="text-left hover:underline focus-visible:outline focus-visible:outline-2">{item.name}</button></h3>
                        <p className="mt-1 text-xs text-muted-foreground">{date(item.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2"><Badge variant="secondary" className="border-0">{item.campaign_type === "sms" ? "Text message" : "Email"}</Badge><Status value={item.status} /></div>
                    </div>
                    {item.subject && <p className="mt-4 break-words text-sm font-medium">{item.subject}</p>}
                    <div className="mt-3"><MessagePreview body={item.body} compact /></div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground"><span className="font-medium tabular-nums text-foreground">{item.total_recipients ?? 0}</span> recipients{item.scheduled_for && item.status === "scheduled" ? ` · Scheduled ${date(item.scheduled_for)}` : ""}</p>
                      <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setSelected(item)}>View campaign<ArrowUpRight className="ml-1 h-4 w-4" /></Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <PaginationBar pagination={query.data.pagination} onPageChange={setPage} isLoading={query.isFetching} itemLabel="campaigns" />
          </>
        )}
      </PanelSection>
    </Panel>
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-0 max-sm:max-h-none sm:max-w-2xl">
        <DialogHeader><DialogTitle>{selected?.name ?? "Campaign details"}</DialogTitle><DialogDescription>Review your campaign and the message prepared for your customers.</DialogDescription></DialogHeader>
        {selected && <>
          <div className="flex gap-2"><Status value={selected.status} /><Badge variant="secondary">{selected.campaign_type === "sms" ? "Text message" : "Email"}</Badge></div>
          <dl className="grid grid-cols-2 gap-4 text-sm"><Detail label="Created" value={date(selected.created_at)} /><Detail label="Recipients" value={String(selected.total_recipients ?? 0)} />{selected.status === "scheduled" && <Detail label="Scheduled for" value={date(selected.scheduled_for)} />}</dl>
          {selected.subject && <p className="break-words font-medium">{selected.subject}</p>}
          <div className="rounded-2xl bg-muted/50 p-4"><MessagePreview body={selected.body} /></div>
          {selected.campaign_type === "sms" && <><p className="text-sm text-muted-foreground">A sent campaign may still have messages waiting for delivery. View its messages to see individual results.</p><Button className="rounded-full" onClick={() => { setSelected(null); onViewMessages(selected); }}>View customer messages</Button></>}
        </>}
      </DialogContent>
    </Dialog>
    </>
  );
}

function MessageLog({ clerkOrgId, campaign, onClearCampaign }: { clerkOrgId: string; campaign: Campaign | null; onClearCampaign: () => void }) {
  const [filters, setFilters] = useState<MessageFilters>({ page: 1 });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Message | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const query = useQuery({
    queryKey: ["campaign-message-log", clerkOrgId, filters, debouncedSearch, campaign?.id],
    queryFn: () => getMessages(clerkOrgId, { ...filters, search: debouncedSearch, campaignId: campaign?.id }),
    enabled: !!clerkOrgId,
    refetchInterval: 15_000,
  });
  const update = (patch: MessageFilters) => setFilters((current) => ({ ...current, ...patch, page: 1 }));
  const message = query.data?.data.find((item) => item.id === selected?.id) ?? selected;

  return (
    <>
      <Panel className="border-0">
        <PanelSection icon={MessageSquare} label="Customer messages" caption="Text messages for reservations, orders, campaigns, and customer replies. Updates automatically."
          action={<RefreshButton busy={query.isFetching} onClick={() => void query.refetch()} />}>
          {campaign && <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-muted/50 p-3"><span className="min-w-0 break-words text-sm">Campaign: <strong>{campaign.name}</strong></span><Button variant="ghost" size="sm" onClick={onClearCampaign}>Show all messages</Button></div>}
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput label="Search customer messages" placeholder="Search phone numbers or messages..." value={search} onChange={(value) => { setSearch(value); update({}); }} />
            <FilterSelect label="Delivery status" value={filters.status ?? "all"} onChange={(status) => update({ status })} options={[["all", "All statuses"], ["sent", "Sent"], ["delivered", "Delivered"], ["failed", "Not delivered"], ["received", "Received"], ["pending", "Pending"], ["queued", "Waiting to send"], ["sending", "Sending"]]} />
            <FilterSelect label="Message direction" value={filters.direction ?? "all"} onChange={(direction) => update({ direction })} options={[["all", "All messages"], ["outbound", "To customers"], ["inbound", "From customers"]]} />
            <FilterSelect label="Time period" value={String(filters.days ?? 0)} onChange={(days) => update({ days: Number(days) })} options={[["0", "All time"], ["1", "Last 24 hours"], ["7", "Last 7 days"], ["30", "Last 30 days"]]} />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Sent messages are still waiting for delivery confirmation. Delivered means delivery to the customer&apos;s phone was confirmed.</p>
          {query.isError ? <LoadError onRetry={() => void query.refetch()} /> : query.isPending ? <LoadingRows /> : (
            <>
              <p className="my-4 text-sm text-muted-foreground" aria-live="polite">{query.data.pagination.total.toLocaleString()} matching messages</p>
              {query.data.data.length === 0 ? <EmptyState title="No messages found" description="Try different filters. Customer text messages and replies will appear here once your business starts sending messages." page={filters.page ?? 1} onReset={() => update({})} /> : (
                <>
                <div className="space-y-3 md:hidden">
                  {query.data.data.map((item) => (
                    <article key={item.id} className="rounded-2xl bg-muted/40 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{messagePurpose(item)}</span><Status value={item.status} /></div>
                      <p className="mt-3 break-words text-xs"><span className="text-muted-foreground">{item.direction === "inbound" ? "From customer " : "To customer "}</span>{customerPhone(item)}</p>
                      <div className="mt-3"><MessagePreview body={item.body} compact /></div>
                      {(item.error_code || item.status === "failed") && <p className="mt-2 break-words text-xs text-muted-foreground">{formatMessageError(item.error_code, item.status)}</p>}
                      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
                        <p className="text-xs text-muted-foreground">{date(item.created_at)}</p>
                        <Button variant="ghost" size="sm" onClick={() => setSelected(item)} aria-label={`View message ${item.direction === "inbound" ? "from" : "to"} ${customerPhone(item)}`}>View message</Button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <caption className="sr-only">Your business&apos;s customer text messages</caption>
                    <thead><tr className="text-xs text-muted-foreground">{["Date", "Customer", "Message", "Delivery", "Details"].map((heading) => <th key={heading} scope="col" className="px-3 pb-3 font-medium">{heading}</th>)}</tr></thead>
                    <tbody>
                      {query.data.data.map((item) => (
                        <tr key={item.id} className="align-top odd:bg-muted/35">
                          <td className="rounded-l-xl px-3 py-4"><span className="whitespace-nowrap text-xs">{date(item.created_at)}</span></td>
                          <td className="px-3 py-4 text-xs"><p className="whitespace-nowrap">{customerPhone(item)}</p><p className="mt-2 text-muted-foreground">{item.direction === "inbound" ? "From customer" : "To customer"}</p></td>
                          <td className="max-w-xs px-3 py-4"><p className="mb-2 font-medium">{messagePurpose(item)}</p><MessagePreview body={item.body} compact />{(item.error_code || item.status === "failed") && <p className="mt-2 break-words text-xs text-muted-foreground">{formatMessageError(item.error_code, item.status)}</p>}</td>
                          <td className="px-3 py-4"><Status value={item.status} /></td>
                          <td className="rounded-r-xl px-3 py-3"><Button variant="ghost" size="sm" onClick={() => setSelected(item)} aria-label={`View message ${item.direction === "inbound" ? "from" : "to"} ${customerPhone(item)}`}>View message</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
              <PaginationBar pagination={query.data.pagination} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} isLoading={query.isFetching} itemLabel="messages" />
            </>
          )}
        </PanelSection>
      </Panel>
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-0 max-sm:max-h-none sm:max-w-2xl">
          <DialogHeader><DialogTitle>{message ? messagePurpose(message) : "Customer message"}</DialogTitle><DialogDescription>{message?.direction === "inbound" ? "A text message from your customer." : "A text message prepared for your customer."}</DialogDescription></DialogHeader>
          {message && <>
            <div className="space-y-2"><Status value={message.status} /><p className="text-sm text-muted-foreground">{deliveryDescription(message.status)}</p></div>
            {(message.error_code || message.status === "failed") && <div className="rounded-2xl bg-muted/50 p-4"><p className="mb-1 text-sm font-medium">{message.status === "failed" ? "Why it wasn't delivered" : "Delivery issue"}</p><p className="text-sm text-muted-foreground">{formatMessageError(message.error_code, message.status)}</p></div>}
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Detail label={message.direction === "inbound" ? "From customer" : "To customer"} value={customerPhone(message)} />
              <Detail label="Date" value={date(message.created_at)} />
            </dl>
            <div><p className="mb-2 text-sm font-medium">Message preview</p><div className="rounded-2xl bg-muted/50 p-4"><MessagePreview body={message.body} /></div></div>
          </>}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Status({ value }: { value: string | null }) {
  return <Badge variant="secondary" className="whitespace-nowrap rounded-full border-0 font-medium">{deliveryLabel(value)}</Badge>;
}

function customerPhone(message: Message) {
  return (message.direction === "inbound" ? message.from_number : message.to_number) || "Phone number unavailable";
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value || "Not reported"}</dd></div>;
}

function SearchInput({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (value: string) => void }) {
  return <div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label={label} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-full border-0 bg-muted/60 pl-9 shadow-none" /></div>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="h-10 rounded-full border-0 bg-muted/60 shadow-none"><SelectValue /></SelectTrigger><SelectContent>{options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent></Select>;
}

function RefreshButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return <Button variant="ghost" size="sm" className="rounded-full" disabled={busy} onClick={onClick}><RefreshCw className={`mr-1.5 h-4 w-4 ${busy ? "animate-spin" : ""}`} />Refresh</Button>;
}

function LoadingRows() {
  return <div className="space-y-3 py-6" role="status" aria-label="Loading records">{[1, 2, 3].map((key) => <Skeleton key={key} className="h-20 w-full rounded-2xl" />)}</div>;
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return <div role="alert" className="my-6 rounded-2xl bg-muted/50 p-6"><p className="font-medium">We couldn’t load these records.</p><p className="mt-1 text-sm text-muted-foreground">Check your connection and merchant access, then try again.</p><Button variant="secondary" className="mt-4 rounded-full" onClick={onRetry}>Try again</Button></div>;
}

function EmptyState({ title, description, page, onReset }: { title: string; description: string; page: number; onReset: () => void }) {
  return <div className="py-12 text-center"><MessageSquare className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><p className="font-medium">{title}</p><p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{description}</p>{page > 1 && <Button variant="ghost" className="mt-4" onClick={onReset}>Back to first page</Button>}</div>;
}
