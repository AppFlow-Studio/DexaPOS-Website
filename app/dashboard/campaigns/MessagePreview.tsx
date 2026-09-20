import { messagePreviewParts } from "@/lib/messaging/message-presentation";

export function MessagePreview({ body, compact = false }: { body: string | null; compact?: boolean }) {
  const parts = messagePreviewParts(body);
  const unavailable = parts.some((part) => part.kind === "unavailable-link");
  return (
    <div className="min-w-0">
      <p className={`whitespace-pre-wrap break-words text-sm ${compact ? "line-clamp-2" : "leading-relaxed"}`}>
        {parts.length === 0 ? "No message text available." : parts.map((part, index) => {
          if (part.kind === "link") {
            return compact ? <span key={index}>{part.text}</span> : (
              <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-4">{part.text}</a>
            );
          }
          return <span key={index}>{part.text}</span>;
        })}
      </p>
      {!compact && unavailable && (
        <p className="mt-4 rounded-xl bg-muted p-3 text-sm text-foreground">
          This message contains a link that customers cannot open. Contact support to update your website link for future messages.
        </p>
      )}
    </div>
  );
}
