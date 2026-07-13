"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OnlineOrderingSettings } from "../hooks/useOnlineOrderingSettings";
import {
  sendTestOrderNotification,
  getOrderNotificationAuditLog,
} from "../actions";

const STATUS_EVENTS = [
  { value: "accepted", label: "Accepted" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready / Out for delivery" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "declined", label: "Declined" },
] as const;

interface AuditEntry {
  id: string;
  orderId: string;
  channel: "email" | "sms";
  event: string;
  recipient: string;
  status: "sent" | "failed" | "skipped";
  error: string | null;
  sentAt: string;
}

export function NotificationsTab({
  settings,
  onUpdate,
  locationId,
}: {
  settings: OnlineOrderingSettings;
  onUpdate: (updates: Partial<OnlineOrderingSettings>) => void;
  locationId: string;
}) {
  const prefs = settings.notificationPrefs ?? {
    email_on_order_placed: true,
    sms_on_order_placed: true,
    email_on_status: ["ready", "cancelled"],
    sms_on_status: ["accepted", "ready", "cancelled"],
    admin_test_email: null,
    admin_test_phone: null,
  };

  const setPrefs = (patch: Partial<typeof prefs>) =>
    onUpdate({ notificationPrefs: { ...prefs, ...patch } });

  const toggleStatus = (
    channel: "email_on_status" | "sms_on_status",
    value: string,
    checked: boolean
  ) => {
    const current = prefs[channel] ?? [];
    const next = checked
      ? Array.from(new Set([...current, value]))
      : current.filter((v) => v !== value);
    setPrefs({ [channel]: next } as Partial<typeof prefs>);
  };

  const [testEmail, setTestEmail] = useState(prefs.admin_test_email ?? "");
  const [testPhone, setTestPhone] = useState(prefs.admin_test_phone ?? "");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);

  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    if (!locationId) return;
    setAuditLoading(true);
    getOrderNotificationAuditLog(locationId, 50)
      .then((res) => setAudit(res.data ?? []))
      .finally(() => setAuditLoading(false));
  }, [locationId]);

  const handleTest = async (channel: "email" | "sms") => {
    const to = channel === "email" ? testEmail : testPhone;
    if (!to) {
      toast.error(`Enter a test ${channel === "email" ? "email" : "phone"} first.`);
      return;
    }
    if (channel === "email") setSendingEmail(true);
    else setSendingSms(true);
    const res = await sendTestOrderNotification(locationId, channel, to);
    if (channel === "email") setSendingEmail(false);
    else setSendingSms(false);
    if (res.success) toast.success(`Test ${channel} sent to ${to}`);
    else toast.error(res.error ?? "Failed to send test");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Order Confirmation</CardTitle>
          <CardDescription>
            What customers receive immediately after placing an order. Customers can opt out at checkout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Send receipt email</Label>
            <Switch
              checked={prefs.email_on_order_placed}
              onCheckedChange={(checked) => setPrefs({ email_on_order_placed: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Send confirmation SMS</Label>
            <Switch
              checked={prefs.sms_on_order_placed}
              onCheckedChange={(checked) => setPrefs({ sms_on_order_placed: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status Updates</CardTitle>
          <CardDescription>
            Pick which order status changes notify the customer. Each row controls email + SMS independently.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-3 items-center text-sm">
            <div className="font-medium text-muted-foreground">Status</div>
            <div className="font-medium text-muted-foreground">Email</div>
            <div className="font-medium text-muted-foreground">SMS</div>
            {STATUS_EVENTS.map((evt) => (
              <RowItem
                key={evt.value}
                label={evt.label}
                emailChecked={(prefs.email_on_status ?? []).includes(evt.value)}
                smsChecked={(prefs.sms_on_status ?? []).includes(evt.value)}
                onEmailChange={(checked) => toggleStatus("email_on_status", evt.value, checked)}
                onSmsChange={(checked) => toggleStatus("sms_on_status", evt.value, checked)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test Notifications</CardTitle>
          <CardDescription>
            Sends a sample receipt to your address. The customer-facing template uses your store name + primary color.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="test-email">Test email</Label>
            <div className="flex gap-2">
              <Input
                id="test-email"
                type="email"
                value={testEmail}
                onChange={(e) => {
                  setTestEmail(e.target.value);
                  setPrefs({ admin_test_email: e.target.value });
                }}
                placeholder="you@merchant.com"
              />
              <Button
                onClick={() => handleTest("email")}
                disabled={sendingEmail}
              >
                {sendingEmail ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="test-phone">Test phone</Label>
            <div className="flex gap-2">
              <Input
                id="test-phone"
                type="tel"
                value={testPhone}
                onChange={(e) => {
                  setTestPhone(e.target.value);
                  setPrefs({ admin_test_phone: e.target.value });
                }}
                placeholder="+15551234567"
              />
              <Button
                onClick={() => handleTest("sms")}
                disabled={sendingSms}
              >
                {sendingSms ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Notifications</CardTitle>
          <CardDescription>
            Last 50 transactional notifications attempted for this merchant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <div className="space-y-2">
              {audit.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium">
                      {row.event} · {row.channel}
                    </span>
                    <span className="text-xs text-muted-foreground break-words">
                      {row.recipient} · {new Date(row.sentAt).toLocaleString()}
                    </span>
                    {row.error ? (
                      <span className="text-xs text-destructive break-words">{row.error}</span>
                    ) : null}
                  </div>
                  <Badge
                    className="shrink-0"
                    variant={
                      row.status === "sent"
                        ? "default"
                        : row.status === "skipped"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {row.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RowItem({
  label,
  emailChecked,
  smsChecked,
  onEmailChange,
  onSmsChange,
}: {
  label: string;
  emailChecked: boolean;
  smsChecked: boolean;
  onEmailChange: (v: boolean) => void;
  onSmsChange: (v: boolean) => void;
}) {
  return (
    <>
      <div className="text-sm">{label}</div>
      <Switch checked={emailChecked} onCheckedChange={onEmailChange} />
      <Switch checked={smsChecked} onCheckedChange={onSmsChange} />
    </>
  );
}
