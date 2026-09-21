type MessageContext = {
  body: string | null;
  direction: string;
  campaign_id: string | null;
};

export function messagePurpose(message: MessageContext): string {
  if (message.direction === "inbound") return "Customer reply";
  if (message.campaign_id) return "Campaign message";
  const body = message.body ?? "";
  if (/reservation confirmed/i.test(body)) return "Reservation confirmation";
  if (/reservation|#RES-/i.test(body)) return "Reservation update";
  if (/waitlist|table is ready/i.test(body)) return "Waitlist update";
  if (/verification code|verify your|one.time (?:code|password)/i.test(body)) return "Phone verification";
  if (/invoice/i.test(body)) return "Invoice";
  if (/receipt/i.test(body)) return "Receipt";
  if (/your order|order (?:is|has|#)|order confirmed/i.test(body)) return "Order update";
  return "Text message";
}

export function deliveryLabel(status: string | null): string {
  const labels: Record<string, string> = {
    sent: "Sent", delivered: "Delivered", failed: "Not delivered",
    received: "Received", queued: "Waiting to send", pending: "Waiting to send",
    sending: "Sending", draft: "Draft", scheduled: "Scheduled", cancelled: "Cancelled",
  };
  return labels[status ?? ""] ?? "Status unavailable";
}

export function deliveryDescription(status: string | null): string {
  if (status === "delivered") return "Delivery to the customer's phone was confirmed.";
  if (status === "sent") return "The message was sent. Delivery to the customer's phone has not been confirmed yet.";
  if (status === "received") return "Your business received this reply from a customer.";
  if (["queued", "pending", "sending"].includes(status ?? "")) return "This message is waiting to be sent. Check back for an update.";
  if (status === "failed") return "This message could not be delivered.";
  return "Delivery information is not available for this message.";
}

export type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "unavailable-link"; text: string };

function isPublicLink(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.username || url.password || !host.includes(".")) return false;
  if (/(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) return false;
  if (/^(0|10|127)\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  // IP literals are not customer website links (also excludes private IPv6).
  return !host.includes(":") && !/^\d+(\.\d+){3}$/.test(host);
}

/** Keep stored text untouched; show long URLs as short, readable link labels. */
export function messagePreviewParts(body: string | null): MessagePart[] {
  const parts: MessagePart[] = [];
  const text = body ?? "";
  let cursor = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>]+/gi)) {
    const index = match.index!;
    if (index > cursor) parts.push({ kind: "text", text: text.slice(cursor, index) });
    const href = match[0].replace(/[.,;!?)]+$/, "");
    try {
      const url = new URL(href);
      const label = /\/r\//.test(url.pathname) ? "View reservation"
        : /receipt/i.test(url.pathname) ? "View receipt"
        : /invoice/i.test(url.pathname) ? "View invoice" : "Open link";
      parts.push(isPublicLink(url)
        ? { kind: "link", text: label, href }
        : { kind: "unavailable-link", text: "Link unavailable to customers" });
    } catch {
      parts.push({ kind: "unavailable-link", text: "Link unavailable to customers" });
    }
    cursor = index + href.length;
  }
  if (cursor < text.length) parts.push({ kind: "text", text: text.slice(cursor) });
  return parts;
}
