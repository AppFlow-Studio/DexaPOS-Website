// Display-only translations. Preserve the original error in the ledger for support.
// Provider code references:
// https://developers.telnyx.com/docs/messaging/messages/error-codes
// https://support.telnyx.com/en/articles/6505121-telnyx-messaging-error-codes
const messages = {
  invalidNumber: "The recipient's phone number is invalid. Check the number and country code.",
  inactiveNumber: "This phone number is inactive. Confirm the number with the customer.",
  unreachable: "This number cannot receive this type of message. Confirm another number with the customer.",
  optedOut: "This customer has opted out of messages. They must opt back in before you can send again.",
  noConsent: "This customer has not agreed to receive marketing messages.",
  sender: "The sending number needs to be set up or corrected. Contact support.",
  setup: "Messaging is not set up correctly for this account. Contact support.",
  disabled: "Messaging is disabled for this account. Contact support.",
  registration: "Messaging needs approval before sending. Contact support.",
  region: "Messaging is not enabled for the recipient's country. Contact support.",
  funds: "The messaging balance or spending limit has been reached. Contact support.",
  busy: "The messaging service has reached its sending limit. Wait before sending more messages.",
  blocked: "The message was blocked by a spam or content filter. Review the message and contact support.",
  restricted: "The messaging provider has temporarily restricted sending. Contact support.",
  rejected: "The recipient's carrier could not deliver this message. Confirm the number with the customer.",
  expired: "The message expired before it could be delivered.",
  unavailable: "The messaging service is temporarily unavailable. Try again later.",
  timeout: "Delivery could not be confirmed. Check the message status before sending again.",
  content: "The message content could not be sent. Review the text and attachments.",
  tooLong: "The message is too long. Shorten it before sending again.",
  missingBody: "The message is empty. Add some text before sending.",
  missingNumber: "The customer's phone number is missing. Add a number before sending.",
  fallback: "We couldn't complete this message. Contact support if the problem continues.",
} as const;

const codeGroups: [readonly string[], string][] = [
  [["10001"], messages.inactiveNumber],
  [["10002", "10016", "40012", "40310"], messages.invalidNumber],
  [["10003", "40009", "40304", "40317"], messages.content],
  [["10005", "10006", "10009", "10010", "20002", "20006", "40311", "40313"], messages.setup],
  [["10007", "40006"], messages.unavailable],
  [["10011", "40011", "40016", "40018", "40318"], messages.busy],
  [["20012", "20013", "20015", "40312", "40314"], messages.disabled],
  [["20014", "20016", "20017", "40010", "40019", "40155", "40329"], messages.registration],
  [["20100", "40333"], messages.funds],
  [["40001", "40301", "40319"], messages.unreachable],
  [["40002", "40003", "40015", "40017", "40322"], messages.blocked],
  [["40020"], messages.restricted],
  [["40004", "40008"], messages.rejected],
  [["40005", "40014"], messages.expired],
  [["40013", "40100", "40150", "40151", "40305", "40306", "40307", "40308", "40315", "40320", "40321", "40323", "40325", "40330"], messages.sender],
  [["40300"], messages.optedOut],
  [["40302", "40328"], messages.tooLong],
  [["40309", "40331"], messages.region],
  [["40316"], messages.missingBody],
];
const codeMessages = new Map(codeGroups.flatMap(([codes, message]) => codes.map((code) => [code, message] as const)));

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function translateText(value: string): string | null {
  const text = value.toLowerCase();
  if (/not_opted_in|not opted in|not agreed|consent required/.test(text)) return messages.noConsent;
  if (/unsubscribed|opted[ -]?out|blocked due to stop/.test(text)) return messages.optedOut;
  if (/invalid.*(?:from|sender|source)|alpha sender|no usable numbers/.test(text)) return messages.sender;
  if (/invalid.*(?:phone|destination|recipient|to.*address)|e\.164/.test(text)) return messages.invalidNumber;
  if (/recipient phone.*missing|missing.*(?:recipient|phone number)/.test(text)) return messages.missingNumber;
  if (/message (?:body )?(?:is )?(?:missing|empty)|no content/.test(text)) return messages.missingBody;
  if (/api.?key|authenticat|unauthori[sz]ed|profile.*secret|telnyx not configured|messaging.*not configured/.test(text)) return messages.setup;
  if (/insufficient funds|spend(?:ing)? limit|balance/.test(text)) return messages.funds;
  if (/too many requests|rate.?limit|queue full/.test(text)) return messages.busy;
  if (/spam|blocked.*content/.test(text)) return messages.blocked;
  if (/message too (?:large|long)/.test(text)) return messages.tooLong;
  if (/timed? ?out|etimedout|econnreset|message id/.test(text)) return messages.timeout;
  if (/network|fetch failed|econnrefused|enotfound|service unavailable/.test(text)) return messages.unavailable;
  return null;
}

function translateEntry(value: unknown, depth = 0): string | null {
  if (depth > 3) return null;
  if (Array.isArray(value)) {
    const translated = value.slice(0, 5).map((entry) => translateEntry(entry, depth + 1)).filter(Boolean);
    return [...new Set(translated)].join(" ") || null;
  }
  const entry = record(value);
  if (!entry) return null;
  if (Array.isArray(entry.errors)) return translateEntry(entry.errors, depth + 1);
  const source = record(entry.source);
  // A generic invalid-number code may refer to the sender rather than recipient.
  const code = String(entry.code ?? entry.error_code ?? "");
  if (["10002", "10016"].includes(code) && source?.pointer === "/from") return messages.sender;
  const knownCode = codeMessages.get(code);
  if (knownCode) return knownCode;
  for (const field of [entry.title, entry.detail, entry.message]) {
    if (typeof field === "string") {
      const translated = translateText(field);
      if (translated) return translated;
    }
  }
  return null;
}

/** Never display raw responses, stack traces, provider URLs, or unknown codes. */
export function formatMessageError(error: string | null | undefined, status?: string | null): string | null {
  if (!error?.trim()) return status === "failed" ? messages.fallback : null;
  const text = error.trim().slice(0, 16_000);
  const directCode = codeMessages.get(text);
  if (directCode) return directCode;

  // Older SDK errors were stored as `400 {"errors":[...]}`; newer rows often
  // contain only a provider code. Translate both without changing stored data.
  const jsonStart = text.search(/[\[{]/);
  if (jsonStart >= 0) {
    try {
      const translated = translateEntry(JSON.parse(text.slice(jsonStart)));
      if (translated) return translated;
    } catch {
      // A truncated response can still retain a recognizable provider code.
      const code = text.match(/"(?:code|error_code)"\s*:\s*"?(\d{5})(?=["\s,}])/i)?.[1];
      if (code && codeMessages.has(code)) return codeMessages.get(code)!;
    }
  } else {
    const code = text.match(/^(?:(?:telnyx\s+)?error(?:\s+code)?\s*:?\s*)?(\d{5})\b/i)?.[1];
    if (code && codeMessages.has(code)) return codeMessages.get(code)!;
    const translated = translateText(text);
    if (translated) return translated;
  }

  const httpStatus = text.match(/^(?:error:\s*|http\s+)?([45]\d{2})(?:\b|$)/i)?.[1];
  if (httpStatus === "429") return messages.busy;
  if (httpStatus === "401" || httpStatus === "403") return messages.setup;
  if (httpStatus?.startsWith("5")) return messages.unavailable;
  return messages.fallback;
}
