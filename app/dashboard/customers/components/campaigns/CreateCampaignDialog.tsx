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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Loader2, Smartphone, Mail } from "lucide-react";
import { useCreateCampaign, useSendCampaign } from "../../hooks/useCustomerMarketing";
import { toast } from "sonner";

interface CreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

  const createMutation = useCreateCampaign();
  const sendMutation = useSendCampaign();

  const handleCreate = async () => {
    if (!campaignName.trim() || !body.trim()) return;

    try {
      const newCampaign = await createMutation.mutateAsync({
        name: campaignName,
        campaignType,
        subject: campaignType === "email" ? subject : undefined,
        body,
        audienceType,
        audienceTags: selectedTags.length > 0 ? selectedTags : undefined,
        scheduledFor: scheduleType === "later" && scheduledFor ? scheduledFor : undefined,
      });

      // If "Send Now" was selected, dispatch the campaign
      if (scheduleType === "now" && newCampaign?.id) {
        toast.loading("Sending campaign...");
        try {
          const sendResult = await sendMutation.mutateAsync(newCampaign.id);

          // Check if send was successful
          if (sendResult?.error) {
            toast.error(sendResult.error);
            return;
          }

          // Success message with recipient count
          const recipientCount = sendResult?.sent || 0;
          if (recipientCount > 0) {
            toast.success(`Campaign sent to ${recipientCount} recipient${recipientCount !== 1 ? 's' : ''}!`);
          } else {
            toast.error("No recipients to send to");
            return;
          }
        } catch (sendError: any) {
          console.error("Error sending campaign:", sendError);
          const errorMsg = sendError?.message || "Failed to send campaign";
          toast.error(errorMsg);
          return;
        }
      } else if (scheduleType === "later") {
        toast.success("Campaign scheduled successfully!");
      } else {
        toast.success("Campaign created successfully!");
      }

      // Reset form
      setCampaignName("");
      setCampaignType("sms");
      setSubject("");
      setBody("");
      setAudienceType("all");
      setSelectedTags([]);
      setScheduleType("now");
      setScheduledFor("");
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating campaign:", error);
      toast.error("Failed to create campaign");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-2xl font-bold">Create Campaign</DialogTitle>
          <DialogDescription className="text-base">
            Create and send marketing campaigns to your customers via SMS or email
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-7 py-4">
          {/* Campaign Basics */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-name" className="font-semibold text-sm">Campaign Name</Label>
              <Input
                id="campaign-name"
                placeholder="e.g., Holiday Sale 2024"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="h-10 bg-background border-input focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="campaign-type" className="font-semibold text-sm">Campaign Type</Label>
              <Select value={campaignType} onValueChange={(v) => setCampaignType(v as "sms" | "email")}>
                <SelectTrigger id="campaign-type" className="h-10 bg-background border-input focus-visible:ring-2 focus-visible:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      SMS
                    </div>
                  </SelectItem>
                  <SelectItem value="email">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-4 border-t border-border/50 pt-6">
            <h3 className="font-semibold text-sm text-foreground">Message Content</h3>

            {campaignType === "email" && (
              <div>
                <Label htmlFor="email-subject">Email Subject</Label>
                <Input
                  id="email-subject"
                  placeholder="Enter email subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
            )}

            <div>
              <Label htmlFor="message-body">Message Body</Label>
              <Textarea
                id="message-body"
                placeholder={
                  campaignType === "sms"
                    ? "Type your SMS message (max 160 characters)"
                    : "Type your email message"
                }
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                maxLength={campaignType === "sms" ? 160 : undefined}
              />
              {campaignType === "sms" && (
                <p className="text-xs text-muted-foreground mt-1">
                  {body.length} / 160 characters
                </p>
              )}
            </div>
          </div>

          {/* Audience */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-medium">Audience</h3>

            <div>
              <Label htmlFor="audience-type">Audience Type</Label>
              <Select value={audienceType} onValueChange={(v) => setAudienceType(v as "all" | "tag")}>
                <SelectTrigger id="audience-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  <SelectItem value="tag">By Tags</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {audienceType === "tag" && (
              <div className="space-y-3">
                <Label>Select Tags to Target</Label>
                <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                  {["VIP", "REGULAR", "NEW", "CORPORATE", "FRIEND_OF_OWNER", "INFLUENCER", "COMPLAINT_HISTORY", "CATERING_CLIENT"].map((tag) => (
                    <label key={tag} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={selectedTags.includes(tag)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTags([...selectedTags, tag]);
                          } else {
                            setSelectedTags(selectedTags.filter((t) => t !== tag));
                          }
                        }}
                        className="w-4 h-4 cursor-pointer"
                      />
                      <span className="text-sm">
                        {tag
                          .split("_")
                          .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
                          .join(" ")}
                      </span>
                    </label>
                  ))}
                </div>
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedTags.map((tag) => (
                      <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                        {tag
                          .split("_")
                          .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
                          .join(" ")}
                        <button
                          onClick={() => setSelectedTags(selectedTags.filter((t) => t !== tag))}
                          className="ml-1 hover:font-bold"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Scheduling */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-medium">Scheduling</h3>

            <div>
              <Label>When to Send</Label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="now"
                    checked={scheduleType === "now"}
                    onChange={(e) => setScheduleType(e.target.value as "now" | "later")}
                  />
                  <span className="text-sm">Send Now</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="later"
                    checked={scheduleType === "later"}
                    onChange={(e) => setScheduleType(e.target.value as "now" | "later")}
                  />
                  <span className="text-sm">Schedule for Later</span>
                </label>
              </div>
            </div>

            {scheduleType === "later" && (
              <div>
                <Label htmlFor="scheduled-for">Send At</Label>
                <Input
                  id="scheduled-for"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!campaignName.trim() || !body.trim() || createMutation.isPending || sendMutation.isPending}
          >
            {(createMutation.isPending || sendMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {scheduleType === "now" ? "Create & Send" : "Create Campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
