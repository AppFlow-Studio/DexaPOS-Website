"use client";

import { useState } from "react";
import { CalendarClock, Check, Eye, Mail, MessageSquare, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Panel } from "@/components/dashboard/shell/Panel";

const audiences = [
  { id: "all", title: "All subscribers", description: "Stay in touch with your whole community", count: 1240 },
  { id: "regulars", title: "Regular customers", description: "Give familiar faces a reason to return", count: 320 },
  { id: "new", title: "New customers", description: "Turn a first visit into a second", count: 186 },
  { id: "inactive", title: "Haven’t visited lately", description: "Welcome back customers you miss", count: 245 },
] as const;

type Channel = "sms" | "email" | "both";

// Deliberately local state only: this showcase never creates, schedules or sends a campaign.
export function CampaignDemo() {
  const [channel, setChannel] = useState<Channel>("both");
  const [audienceId, setAudienceId] = useState("all");
  const [name, setName] = useState("A little treat this weekend");
  const [subject, setSubject] = useState("Your weekend treat is here ☕");
  const [sms, setSms] = useState("Hi {{first_name}}! Enjoy 15% off your next visit to our coffee shop this weekend. Show this message at checkout. We can’t wait to see you!");
  const [email, setEmail] = useState("Hi {{first_name}},\n\nYour next coffee is calling. Stop by this weekend and enjoy 15% off your order — a little thank-you for being part of our community.\n\nJust show this email at checkout. See you soon!");
  const [timing, setTiming] = useState("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const audience = audiences.find((item) => item.id === audienceId)!;
  const hasSms = channel !== "email";
  const hasEmail = channel !== "sms";
  const channelLabel = channel === "both" ? "SMS + email" : channel === "sms" ? "SMS" : "Email";
  const preview = (value: string) => value.replaceAll("{{first_name}}", "Alex");
  const canReview = name.trim() && (!hasSms || sms.trim()) && (!hasEmail || (subject.trim() && email.trim())) && (timing === "now" || scheduledFor);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted/60 px-5 py-4">
        <Sparkles className="h-5 w-5 shrink-0" />
        <div className="flex-1"><p className="text-sm font-semibold">Campaign builder · Demo only</p><p className="mt-1 text-sm opacity-80">Try the experience with sample audiences. Nothing is sent, scheduled, or saved.</p></div>
        <Badge variant="secondary" className="border-0">Showcase</Badge>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        <Panel padded className="space-y-10 border-0">
          <section className="space-y-5">
            <div><h2 className="text-lg font-semibold">Make their next visit happen</h2><p className="mt-1 text-sm text-muted-foreground">Start with a name and choose how to reach your customers.</p></div>
            <div className="space-y-2"><Label htmlFor="demo-campaign-name">Campaign name</Label><Input className="border-0 bg-muted/60 shadow-none focus-visible:ring-1" id="demo-campaign-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Weekend offer" /></div>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Send via</legend>
              <div className="grid grid-cols-3 gap-1 rounded-full bg-muted/60 p-1">
                {([{ id: "sms", label: "SMS", icon: MessageSquare }, { id: "email", label: "Email", icon: Mail }, { id: "both", label: "Both", icon: Sparkles }] as const).map(({ id, label, icon: Icon }) => (
                  <label key={id} className={`relative flex cursor-pointer items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-medium transition-colors ${channel === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    <input className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" type="radio" name="demo-channel" value={id} checked={channel === id} onChange={() => setChannel(id)} />
                    <span className="pointer-events-none absolute inset-0 rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-ring" /><Icon className="h-4 w-4" />{label}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2"><Users className="h-5 w-5 text-muted-foreground" /><h2 className="font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">Choose your audience</h2></div>
            <p className="text-sm text-muted-foreground">Sample groups for this demo. Marketing messages go only to customers subscribed to each channel.</p>
            <fieldset className="grid gap-1"><legend className="sr-only">Sample audience</legend>
              {audiences.map((item) => <label key={item.id} className={`relative flex cursor-pointer items-start gap-3 rounded-2xl px-4 py-3 transition-colors ${audienceId === item.id ? "bg-muted/60" : "hover:bg-muted/30"}`}>
                <input type="radio" name="demo-audience" checked={audienceId === item.id} onChange={() => setAudienceId(item.id)} className="mt-1 accent-primary" />
                <span className="min-w-0 flex-1"><span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><span className="text-sm font-medium">{item.title}</span><span className="text-xs text-muted-foreground tabular-nums">{item.count.toLocaleString()} sample customers</span></span><span className="mt-1 block text-xs text-muted-foreground">{item.description}</span></span>
              </label>)}
            </fieldset>
          </section>

          <section className="space-y-5">
            <div><h2 className="font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">Write something worth opening</h2><p className="mt-1 text-sm text-muted-foreground">Use {"{{first_name}}"} for a personal touch. The preview uses Alex as an example.</p></div>
            {hasSms && <div className="space-y-2"><Label htmlFor="demo-sms">Text message</Label><Textarea id="demo-sms" className="min-h-32 rounded-2xl border-0 bg-muted/60 px-4 py-3 shadow-none focus-visible:ring-1 dark:bg-muted/40" rows={4} value={sms} onChange={(event) => setSms(event.target.value)} /><div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>“Reply STOP to unsubscribe” appears below your message.</span><span>{sms.length} characters before personalization and footer</span></div></div>}
            {hasEmail && <div className="space-y-4">
              <div className="space-y-2"><Label htmlFor="demo-subject">Email subject</Label><Input className="border-0 bg-muted/60 shadow-none focus-visible:ring-1" id="demo-subject" value={subject} onChange={(event) => setSubject(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="demo-email">Email message</Label><Textarea id="demo-email" className="min-h-44 rounded-2xl border-0 bg-muted/60 px-4 py-3 shadow-none focus-visible:ring-1 dark:bg-muted/40" rows={7} value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            </div>}
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-muted-foreground" /><h2 className="font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">Choose the right moment</h2></div>
            <fieldset className="flex flex-wrap gap-5"><legend className="sr-only">Delivery timing</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="demo-timing" checked={timing === "now"} onChange={() => setTiming("now")} className="accent-primary" />Send now</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="demo-timing" checked={timing === "later"} onChange={() => setTiming("later")} className="accent-primary" />Schedule for later</label>
            </fieldset>
            {timing === "later" && <div className="space-y-2"><Label htmlFor="demo-schedule">Date and time (your local time)</Label><Input id="demo-schedule" type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} className="max-w-sm border-0 bg-muted/60 shadow-none focus-visible:ring-1" /></div>}
            <p className="text-xs text-muted-foreground">Demo selection only. No delivery will be scheduled.</p>
          </section>
        </Panel>

        <aside className="min-w-0 xl:sticky xl:top-6" aria-label="Live campaign preview">
          <Panel padded className="space-y-8 border-0">
            <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]"><Eye className="h-4 w-4" />Customer preview</h2><Badge variant="secondary">Sample</Badge></div>
            {hasSms && <section aria-label="SMS preview" className="space-y-3">
              <p className="mb-4 text-center text-xs font-medium text-muted-foreground">Your coffee shop · SMS</p>
              <div className="whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-sm leading-relaxed">{preview(sms) || "Your text message will appear here."}<p className="mt-3 text-xs text-muted-foreground">Reply STOP to unsubscribe.</p></div>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">Preview for Alex</p>
            </section>}
            {hasEmail && <section aria-label="Email preview" className="space-y-5 rounded-2xl bg-muted/40 p-4 sm:p-5">
              <div className="space-y-1 text-xs text-muted-foreground"><p>From: Your coffee shop</p><p>To: Alex · Sample customer</p><p className="pt-2 break-words text-sm font-semibold text-foreground">{preview(subject) || "Your email subject"}</p></div>
              <div><p className="mb-5 text-lg font-semibold">A little something for you.</p><div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{preview(email) || "Your email message will appear here."}</div><div className="mt-6 text-xs text-muted-foreground">Your coffee shop<p className="mt-2 underline">Unsubscribe · Manage preferences</p></div></div>
            </section>}
          <section className="space-y-4">
            <h2 className="font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">Your campaign at a glance</h2>
            <dl className="space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Channels</dt><dd className="font-medium">{channelLabel}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Sample audience</dt><dd className="text-right">{audience.title}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Customers</dt><dd>{audience.count.toLocaleString()} (sample)</dd></div></dl>
            <Button className="w-full rounded-full" disabled={!canReview} onClick={() => setReviewOpen(true)}><Eye className="mr-2 h-4 w-4" />Review demo campaign</Button>
            <p className="text-center text-xs text-muted-foreground">Preview only. No messages will be sent.</p>
          </section>
          </Panel>
        </aside>
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-0 sm:max-w-lg">
          <DialogHeader><DialogTitle>Review your demo campaign</DialogTitle><DialogDescription>This is a showcase preview. Nothing has been saved, sent, or scheduled.</DialogDescription></DialogHeader>
          <div className="rounded-2xl bg-muted/50 p-5"><p className="break-words text-lg font-semibold">{name}</p><ul className="mt-4 space-y-3 text-sm">{[channelLabel, `${audience.title} · ${audience.count.toLocaleString()} sample customers`, timing === "now" ? "Send now (demo)" : `Scheduled for ${new Date(scheduledFor).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} (demo)`].map((text) => <li key={text} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" />{text}</li>)}</ul></div>
          <Button variant="outline" onClick={() => setReviewOpen(false)}>Back to editing</Button>
          <Button disabled>Sending unavailable in demo</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
