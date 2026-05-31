// Deno-native Telnyx sender. Raw fetch keeps cold start small and avoids
// pulling the Node SDK in the Edge runtime.

const TELNYX_API_KEY = Deno.env.get('TELNYX_API_KEY') ?? '';
const TELNYX_FROM_NUMBER = Deno.env.get('TELNYX_FROM_NUMBER') ?? '';
const TELNYX_MESSAGING_PROFILE_ID =
  Deno.env.get('TELNYX_MESSAGING_PROFILE_ID') ?? '';

export function isTelnyxConfigured(): boolean {
  return (
    TELNYX_API_KEY.length > 0 &&
    (TELNYX_FROM_NUMBER.length > 0 || TELNYX_MESSAGING_PROFILE_ID.length > 0)
  );
}

export function normalizeE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  if (digits.length > 0) return `+${digits}`;
  return null;
}

export async function sendSMS(
  to: string,
  body: string,
): Promise<{ id: string } | { error: string }> {
  if (!isTelnyxConfigured()) {
    return {
      error:
        'SMS service not configured. Set TELNYX_API_KEY and either TELNYX_FROM_NUMBER or TELNYX_MESSAGING_PROFILE_ID.',
    };
  }

  const normalized = normalizeE164(to);
  if (!normalized) return { error: `Invalid phone number: ${to}` };

  const payload: Record<string, unknown> = { to: normalized, text: body };
  if (TELNYX_FROM_NUMBER) {
    payload.from = TELNYX_FROM_NUMBER;
  } else if (TELNYX_MESSAGING_PROFILE_ID) {
    payload.messaging_profile_id = TELNYX_MESSAGING_PROFILE_ID;
  }

  try {
    const resp = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // deno-lint-ignore no-explicit-any
    let json: any = {};
    try {
      json = await resp.json();
    } catch {
      json = {};
    }

    const data = json?.data;
    const firstError = json?.errors?.[0];
    const providerStatus = data?.status as string | undefined;
    const ok =
      resp.ok &&
      !!data?.id &&
      providerStatus !== 'sending_failed' &&
      providerStatus !== 'delivery_failed';

    if (!ok) {
      const message =
        firstError?.detail || firstError?.title || 'Could not send SMS';
      return { error: message };
    }
    return { id: data.id as string };
  } catch (err) {
    const message = (err as { message?: string })?.message ?? 'Failed to send SMS';
    return { error: message };
  }
}
