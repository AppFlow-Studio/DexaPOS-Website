"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BellRing, History, ListChecks, Send } from "lucide-react";
import { Panel, PanelSection } from "@/components/dashboard/shell";
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

  const [auditState, setAuditState] = useState<{
    locationId: string;
    entries: AuditEntry[];
  }>({ locationId: "", entries: [] });
  const auditLoading = Boolean(locationId) && auditState.locationId !== locationId;
  const audit = auditState.locationId === locationId ? auditState.entries : [];

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    getOrderNotificationAuditLog(locationId, 50)
      .then((res) => {
        if (!cancelled) {
          setAuditState({ locationId, entries: res.data ?? [] });
        }
      });

    return () => {
      cancelled = true;
    };
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
    <Panel>
      <PanelSection
        icon={BellRing}
        label="Order confirmation"
        caption="Choose what customers receive immediately after placing an order. Customers can opt out at checkout."
      >
        <div>
          <NotificationToggleRow
            label="Send receipt email"
            checked={prefs.email_on_order_placed}
            onCheckedChange={(checked) => setPrefs({ email_on_order_placed: checked })}
          />
          <NotificationToggleRow
            label="Send confirmation SMS"
            checked={prefs.sms_on_order_placed}
            onCheckedChange={(checked) => setPrefs({ sms_on_order_placed: checked })}
          />
        </div>
      </PanelSection>

      <PanelSection
        icon={ListChecks}
        label="Status updates"
        caption="Choose which order status changes notify the customer by email or SMS."
      >
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-4 text-sm sm:gap-x-8">
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
      </PanelSection>

      <PanelSection
        icon={Send}
        label="Test notifications"
        caption="Send a sample receipt using the customer-facing template for this store."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="test-email">Test email</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
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
                className="sm:shrink-0"
                onClick={() => handleTest("email")}
                disabled={sendingEmail}
              >
                {sendingEmail ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="test-phone">Test phone</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
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
                className="sm:shrink-0"
                onClick={() => handleTest("sms")}
                disabled={sendingSms}
              >
                {sendingSms ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        </div>
      </PanelSection>

      <PanelSection
        icon={History}
        label="Recent notifications"
        caption="The last 50 transactional notification attempts for this merchant."
      >
          {auditLoading ? (
            <p className="py-4 text-sm text-muted-foreground">Loading…</p>
          ) : audit.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <div>
              {audit.map((row) => (
                <div
                  key={row.id}
                  className="flex min-w-0 flex-col gap-3 py-4 text-sm first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
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
      </PanelSection>
    </Panel>
  );
}

function NotificationToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <Label className="font-medium text-foreground">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
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
