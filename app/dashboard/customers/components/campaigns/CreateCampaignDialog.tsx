"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Smartphone,
  Mail,
  Users,
  Tag,
  Send,
  CalendarClock,
  CheckCircle2,
} from "lucide-react";
import { useCreateAndSendCampaign } from "../../hooks/useCustomerMarketing";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TAGS = [
  "VIP",
  "REGULAR",
  "NEW",
  "CORPORATE",
  "FRIEND_OF_OWNER",
  "INFLUENCER",
  "COMPLAINT_HISTORY",
  "CATERING_CLIENT",
];

function formatTag(tag: string) {
  return tag
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export function CreateCampaignDialog({
  open,
  onOpenChange,
}: CreateCampaignDialogProps) {
  const [campaignName, setCampaignName] = useState("");
  const [campaignType, setCampaignType] = useState<"sms" | "email">("sms");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState<"all" | "tag">("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [scheduleType, setScheduleType] = useState<"now" | "later">("now");
  const [scheduledFor, setScheduledFor] = useState("");

  const campaignMutation = useCreateAndSendCampaign();
  const isLoading = campaignMutation.isPending;

  const handleCreate = async () => {
    if (!campaignName.trim() || !body.trim()) return;

    const toastId = toast.loading(
      scheduleType === "now" ? "Creating and sending campaign…" : "Scheduling campaign…"
    );

    try {
      const result = await campaignMutation.mutateAsync({
        name: campaignName,
        campaignType,
        subject: campaignType === "email" ? subject : undefined,
        body,
        audienceType,
        audienceTags: selectedTags.length > 0 ? selectedTags : undefined,
        scheduledFor: scheduleType === "later" && scheduledFor ? scheduledFor : undefined,
      });

      if (result?.error) {
        toast.error(result.error, { id: toastId });
        return;
      }

      if (result?.scheduled) {
        toast.success("Campaign scheduled successfully!", { id: toastId });
      } else {
        const n = result?.sent ?? 0;
        toast.success(
          n > 0
            ? `Campaign sent to ${n} recipient${n !== 1 ? "s" : ""}!`
            : "Campaign created!",
          { id: toastId }
        );
      }

      setCampaignName("");
      setCampaignType("sms");
      setSubject("");
      setBody("");
      setAudienceType("all");
      setSelectedTags([]);
      setScheduleType("now");
      setScheduledFor("");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to create campaign", { id: toastId });
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden border-0 bg-white p-0 dark:bg-background max-sm:h-dvh max-sm:max-h-none max-sm:w-screen max-sm:max-w-none max-sm:overflow-hidden max-sm:rounded-none sm:max-w-2xl">
        {/* Header */}
        <div className="shrink-0 px-4 pb-5 pt-6 sm:px-7 sm:pt-7">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-bold">Create Campaign</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Send a marketing blast to your customers via SMS or email.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="thin-scrollbar min-h-0 flex-1 space-y-7 overflow-y-auto px-4 py-6 sm:px-7">

          {/* Campaign Name */}
          <div className="space-y-1.5">
            <Label htmlFor="campaign-name" className="text-sm font-semibold">Campaign Name</Label>
            <Input
              id="campaign-name"
              placeholder="e.g., Holiday Sale 2024"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="h-10 border-0 bg-muted/60 shadow-none focus-visible:ring-1"
            />
          </div>

          {/* Channel Picker */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Channel</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCampaignType("sms")}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-0 p-4 text-left transition-colors",
                  campaignType === "sms"
                    ? "bg-primary/10"
                    : "bg-muted/60 hover:bg-muted"
                )}
              >
                <div className={cn(
                  "p-2 rounded-lg",
                  campaignType === "sms" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  <Smartphone className="h-4 w-4" />
                </div>
                <div>
                  <p className={cn("text-sm font-semibold", campaignType === "sms" ? "text-foreground" : "text-muted-foreground")}>SMS</p>
                  <p className="text-xs text-muted-foreground">Text message</p>
                </div>
                {campaignType === "sms" && <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />}
              </button>

              <button
                type="button"
                onClick={() => setCampaignType("email")}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-0 p-4 text-left transition-colors",
                  campaignType === "email"
                    ? "bg-primary/10"
                    : "bg-muted/60 hover:bg-muted"
                )}
              >
                <div className={cn(
                  "p-2 rounded-lg",
                  campaignType === "email" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <p className={cn("text-sm font-semibold", campaignType === "email" ? "text-foreground" : "text-muted-foreground")}>Email</p>
                  <p className="text-xs text-muted-foreground">Email message</p>
                </div>
                {campaignType === "email" && <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />}
              </button>
            </div>
          </div>

          {/* Message Content */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Message Content</p>

            {campaignType === "email" && (
              <div className="space-y-1.5">
                <Label htmlFor="email-subject" className="text-sm">Subject Line</Label>
                <Input
                  id="email-subject"
                  placeholder="Enter email subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-10 border-0 bg-muted/60 shadow-none focus-visible:ring-1"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="message-body" className="text-sm">
                {campaignType === "sms" ? "Message" : "Body"}
              </Label>
              <Textarea
                id="message-body"
                placeholder={
                  campaignType === "sms"
                    ? "Write your SMS message here…"
                    : "Write your email body here…"
                }
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                maxLength={campaignType === "sms" ? 160 : undefined}
                className="resize-none border-0 bg-muted/60 shadow-none focus-visible:ring-1"
              />
              {campaignType === "sms" && (
                <div className="flex justify-end">
                  <span className={cn(
                    "text-xs tabular-nums",
                    body.length >= 140 ? "text-destructive font-medium" : "text-muted-foreground"
                  )}>
                    {body.length} / 160
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Audience */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Audience</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAudienceType("all")}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-0 p-4 text-left transition-colors",
                  audienceType === "all"
                    ? "bg-primary/10"
                    : "bg-muted/60 hover:bg-muted"
                )}
              >
                <div className={cn(
                  "p-2 rounded-lg",
                  audienceType === "all" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <p className={cn("text-sm font-semibold leading-tight", audienceType === "all" ? "text-foreground" : "text-muted-foreground")}>All Customers</p>
                  <p className="text-xs text-muted-foreground leading-tight">Everyone opted-in</p>
                </div>
                {audienceType === "all" && <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />}
              </button>

              <button
                type="button"
                onClick={() => setAudienceType("tag")}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-0 p-4 text-left transition-colors",
                  audienceType === "tag"
                    ? "bg-primary/10"
                    : "bg-muted/60 hover:bg-muted"
                )}
              >
                <div className={cn(
                  "p-2 rounded-lg",
                  audienceType === "tag" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  <Tag className="h-4 w-4" />
                </div>
                <div>
                  <p className={cn("text-sm font-semibold leading-tight", audienceType === "tag" ? "text-foreground" : "text-muted-foreground")}>By Tag</p>
                  <p className="text-xs text-muted-foreground leading-tight">Target specific groups</p>
                </div>
                {audienceType === "tag" && <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />}
              </button>
            </div>

            {audienceType === "tag" && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {TAGS.map((tag) => {
                    const selected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border-0 px-3 py-1.5 text-xs font-medium transition-colors",
                          selected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {selected && <CheckCircle2 className="h-3 w-3" />}
                        {formatTag(tag)}
                      </button>
                    );
                  })}
                </div>
                {selectedTags.length === 0 && (
                  <p className="text-xs text-muted-foreground">Select at least one tag to target.</p>
                )}
              </div>
            )}
          </div>

          {/* Scheduling */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">When to Send</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setScheduleType("now")}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-0 p-4 text-left transition-colors",
                  scheduleType === "now"
                    ? "bg-primary/10"
                    : "bg-muted/60 hover:bg-muted"
                )}
              >
                <div className={cn(
                  "p-2 rounded-lg",
                  scheduleType === "now" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  <Send className="h-4 w-4" />
                </div>
                <div>
                  <p className={cn("text-sm font-semibold leading-tight", scheduleType === "now" ? "text-foreground" : "text-muted-foreground")}>Send Now</p>
                  <p className="text-xs text-muted-foreground leading-tight">Blast immediately</p>
                </div>
                {scheduleType === "now" && <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />}
              </button>

              <button
                type="button"
                onClick={() => setScheduleType("later")}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-0 p-4 text-left transition-colors",
                  scheduleType === "later"
                    ? "bg-primary/10"
                    : "bg-muted/60 hover:bg-muted"
                )}
              >
                <div className={cn(
                  "p-2 rounded-lg",
                  scheduleType === "later" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  <CalendarClock className="h-4 w-4" />
                </div>
                <div>
                  <p className={cn("text-sm font-semibold", scheduleType === "later" ? "text-foreground" : "text-muted-foreground")}>Schedule</p>
                  <p className="text-xs text-muted-foreground">Pick a date & time</p>
                </div>
                {scheduleType === "later" && <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />}
              </button>
            </div>

            {scheduleType === "later" && (
              <div className="space-y-1.5">
                <Label htmlFor="scheduled-for" className="text-sm">Send At</Label>
                <Input
                  id="scheduled-for"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="h-10 border-0 bg-muted/60 shadow-none focus-visible:ring-1"
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 bg-white px-4 py-5 dark:bg-background sm:px-7">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              !campaignName.trim() ||
              !body.trim() ||
              (audienceType === "tag" && selectedTags.length === 0) ||
              (scheduleType === "later" && !scheduledFor) ||
              isLoading
            }
            className="min-w-36"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {scheduleType === "now" ? "Sending…" : "Saving…"}
              </>
            ) : scheduleType === "now" ? (
              <>
                <Send className="h-4 w-4 mr-2" />
                Create & Send
              </>
            ) : (
              <>
                <CalendarClock className="h-4 w-4 mr-2" />
                Schedule Campaign
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
