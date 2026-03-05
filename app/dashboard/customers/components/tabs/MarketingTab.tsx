"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  Mail,
  Phone,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
} from "lucide-react";
import {
  useCustomerMarketingHistory,
  useCustomerMarketingPreferences,
  useUpdateCustomerMarketingPreferences,
  useSendQuickMessage,
  useUnsubscribeFromMarketing,
} from "../../hooks/useCustomerMarketing";
import type { CustomerListItem } from "@/types/customer";

interface MarketingTabProps {
  customer: CustomerListItem | null;
  merchantId: string | null;
}

export function MarketingTab({ customer, merchantId }: MarketingTabProps) {
  const customerId = customer?.id;
  const [quickMessage, setQuickMessage] = useState("");
  const [messageChannel, setMessageChannel] = useState<"sms" | "email">("sms");
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [receiptSms, setReceiptSms] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState(false);
  const [language, setLanguage] = useState("en");

  // Queries
  const { data: campaignHistory } = useCustomerMarketingHistory(customerId || null);
  const { data: preferences } = useCustomerMarketingPreferences(customerId || null);

  // Mutations
  const updatePrefsMutation = useUpdateCustomerMarketingPreferences();
  const sendQuickMessageMutation = useSendQuickMessage();
  const unsubscribeMutation = useUnsubscribeFromMarketing();

  // Initialize form with existing preferences
  useEffect(() => {
    if (preferences) {
      setSmsOptIn(preferences.sms_opt_in || false);
      setEmailOptIn(preferences.email_opt_in || false);
      setReceiptSms(preferences.receipt_via_sms || false);
      setReceiptEmail(preferences.receipt_via_email || false);
      setLanguage(preferences.preferred_language || "en");
    }
  }, [preferences?.id]);

  const handleUpdatePreferences = async () => {
    await updatePrefsMutation.mutateAsync({
      customerId: customerId!,
      preferences: {
        sms_opt_in: smsOptIn,
        email_opt_in: emailOptIn,
        receipt_via_sms: receiptSms,
        receipt_via_email: receiptEmail,
        preferred_language: language,
      },
    });
  };

  const handleSendQuickMessage = async () => {
    if (!quickMessage || !customerId || !merchantId) return;

    const destination =
      messageChannel === "sms" ? customer?.phone : customer?.email;
    if (!destination) {
      alert(`No ${messageChannel} on file`);
      return;
    }

    try {
      await sendQuickMessageMutation.mutateAsync({
        customerId,
        merchantId,
        channel: messageChannel,
        destination,
        message: quickMessage,
      });
      alert("Message sent successfully!");
      setQuickMessage("");
    } catch (error: any) {
      alert(`Failed to send message: ${error.message || "Unknown error"}`);
    }
  };

  const handleUnsubscribe = async () => {
    if (
      window.confirm(
        "Are you sure? This will unsubscribe the customer from all marketing communications."
      )
    ) {
      await unsubscribeMutation.mutateAsync(customerId!);
      setSmsOptIn(false);
      setEmailOptIn(false);
    }
  };

  if (!customer) return null;

  const isUnsubscribed =
    preferences?.marketing_unsubscribed_at !== null &&
    preferences?.marketing_unsubscribed_at !== undefined;

  return (
    <div className="space-y-8">
      {/* Opt-In Status */}
      <Card className="border border-border/50 shadow-sm rounded-lg overflow-hidden">
        <CardHeader className="pb-4 pt-6 px-6">
          <CardTitle className="text-base font-bold text-foreground">Communication Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-2">
          {isUnsubscribed && (
            <div className="p-4 rounded-lg bg-amber-50/50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-900/40 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 text-amber-600 dark:text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
                  Unsubscribed from Marketing
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-400 mt-1">
                  Since {new Date(preferences?.marketing_unsubscribed_at || "").toLocaleDateString()}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {/* SMS Opt-In */}
            <div className="flex items-center justify-between p-4 border border-border/50 rounded-lg bg-card/50 hover:bg-muted/30 transition-colors">
              <div className="flex-1">
                <p className="font-semibold text-sm text-foreground flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  SMS Marketing
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {customer?.phone || "No phone on file"}
                </p>
              </div>
              <div className="text-right">
                <input
                  type="checkbox"
                  checked={smsOptIn}
                  onChange={(e) => setSmsOptIn(e.target.checked)}
                  disabled={!customer?.phone}
                  className="w-5 h-5 cursor-pointer"
                />
                {smsOptIn && preferences?.sms_opt_in_at && (
                  <p className="text-xs text-green-600 mt-1">
                    Since {new Date(preferences.sms_opt_in_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            {/* Email Opt-In */}
            <div className="flex items-center justify-between p-4 border border-border/50 rounded-lg bg-card/50 hover:bg-muted/30 transition-colors">
              <div className="flex-1">
                <p className="font-semibold text-sm text-foreground flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary" />
                  Email Marketing
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {customer?.email || "No email on file"}
                </p>
              </div>
              <div className="text-right">
                <input
                  type="checkbox"
                  checked={emailOptIn}
                  onChange={(e) => setEmailOptIn(e.target.checked)}
                  disabled={!customer?.email}
                  className="w-5 h-5 cursor-pointer"
                />
                {emailOptIn && preferences?.email_opt_in_at && (
                  <p className="text-xs text-green-600 dark:text-green-500 mt-2">
                    Since {new Date(preferences.email_opt_in_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            {/* Receipt Preferences */}
            <div className="space-y-3 pt-4 border-t border-border/50">
              <p className="text-sm font-semibold text-foreground">Receipt Delivery</p>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <span className="text-sm font-medium text-foreground">Via SMS</span>
                <input
                  type="checkbox"
                  checked={receiptSms}
                  onChange={(e) => setReceiptSms(e.target.checked)}
                  disabled={!customer?.phone}
                  className="w-4 h-4 cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <span className="text-sm font-medium text-foreground">Via Email</span>
                <input
                  type="checkbox"
                  checked={receiptEmail}
                  onChange={(e) => setReceiptEmail(e.target.checked)}
                  disabled={!customer?.email}
                  className="w-4 h-4 cursor-pointer"
                />
              </div>
            </div>

            {/* Language */}
            <div className="space-y-3 pt-4 border-t border-border/50">
              <label className="text-sm font-semibold text-foreground">Preferred Language</label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="h-10 bg-background border-input focus-visible:ring-2 focus-visible:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-3 pt-6 border-t border-border/50">
            <Button
              onClick={handleUpdatePreferences}
              disabled={updatePrefsMutation.isPending}
              className="flex-1 h-10 font-semibold"
            >
              {updatePrefsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Preferences"
              )}
            </Button>
            {!isUnsubscribed && (
              <Button
                onClick={handleUnsubscribe}
                disabled={unsubscribeMutation.isPending}
                variant="outline"
                className="h-10 font-semibold"
              >
                Unsubscribe
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Message */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Send Quick Message</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-2">
            <Clock className="w-4 h-4 mt-0.5 text-blue-600 shrink-0" />
            <div className="text-xs text-blue-800">
              <p className="font-medium">Trial Account Limitation</p>
              <p className="mt-1">If using a Twilio Trial account, verify the recipient phone number in your Twilio console before sending SMS.</p>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Channel</label>
            <Select
              value={messageChannel}
              onValueChange={(value) =>
                setMessageChannel(value as "sms" | "email")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Message</label>
            <Textarea
              placeholder={
                messageChannel === "sms"
                  ? "Your order is ready for pickup!"
                  : "Message body..."
              }
              value={quickMessage}
              onChange={(e) => setQuickMessage(e.target.value)}
              rows={3}
            />
          </div>

          <Button
            onClick={handleSendQuickMessage}
            disabled={
              !quickMessage ||
              sendQuickMessageMutation.isPending ||
              (messageChannel === "sms" && !customer?.phone) ||
              (messageChannel === "email" && !customer?.email)
            }
            className="w-full"
          >
            {sendQuickMessageMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send {messageChannel.toUpperCase()}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Campaign History */}
      {campaignHistory && campaignHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Campaign History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {campaignHistory.map((item: any) => (
                <div key={item.id} className="p-3 border rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">
                        {item.campaign?.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(item.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {item.channel.toUpperCase()}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    {item.status === "delivered" && (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span className="text-xs text-green-600">Delivered</span>
                      </>
                    )}
                    {item.status === "sent" && (
                      <>
                        <Clock className="w-4 h-4 text-blue-500" />
                        <span className="text-xs text-blue-600">Sent</span>
                      </>
                    )}
                    {item.status === "pending" && (
                      <>
                        <Clock className="w-4 h-4 text-amber-500" />
                        <span className="text-xs text-amber-600">Pending</span>
                      </>
                    )}
                    {item.status === "failed" && (
                      <>
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        <span className="text-xs text-red-600">Failed</span>
                      </>
                    )}
                    {item.status === "bounced" && (
                      <>
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        <span className="text-xs text-red-600">Bounced</span>
                      </>
                    )}
                  </div>

                  {item.campaign?.body && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                      {item.campaign.body}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(!campaignHistory || campaignHistory.length === 0) && (
        <Card className="border-dashed border-2">
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No campaign history
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
