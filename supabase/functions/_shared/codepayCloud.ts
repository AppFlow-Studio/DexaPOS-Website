/**
 * CodePay Cloud Open API — just enough to look up a sale's status.
 *
 * Used by `codepay-transaction-status` so a kiosk whose on-device CodePay
 * Register result is unknown (watchdog / unreadable / lapsed window) can ask
 * CodePay's host whether the payment was approved, failed, or never happened —
 * before it locks the kiosk for staff.
 *
 * Signing (developer.codepay.us/docs/guides/api-secure): RSA2 = SHA256withRSA
 * over the top-level params sorted by key (ASCII), joined `k=v&k=v`, excluding
 * ONLY `sign` and null/empty values — `sign_type=RSA2` IS signed (CodePay's
 * worked example includes it). The signature is standard base64 (their example
 * signatures contain + / =).
 * Business fields (merchant_order_no, trans_no) are top-level keys.
 *
 * Status (trans_status): 0 paying, 1 failed, 2 approved, 3 void, 4 captured,
 * 9 created / pre-paid. 0 and 9 are NOT final — a lookup never reports "no
 * charge" for them.
 */

export interface CodePayCloudConfig {
  /** CodePay merchant number (e.g. "312600550399"). */
  merchant_no: string;
  /** Cloud API app_id registered for Dexa. */
  app_id: string;
  /** Gateway base URL, https only, no trailing slash needed. */
  gateway_url: string;
  /** Merchant private key, PKCS8 PEM ("BEGIN PRIVATE KEY"). Never logged. */
  private_key_pem: string;
  /** CodePay's gateway public key (SPKI PEM or bare base64). Optional: when set,
   *  a signed response must verify. */
  gateway_public_key?: string;
  /** Override the orderquery `method` if the gateway wants another name. */
  order_query_method?: string;
}

export type CodePayLookupStatus =
  | "approved"
  | "failed"
  | "pending"
  | "not_found"
  | "unavailable";

export interface CodePayLookupResult {
  status: CodePayLookupStatus;
  /** Machine reason for `unavailable` (timeout, http_502, bad_signature, …). */
  reason?: string;
  /** Which endpoint produced the verdict. */
  source?: "recall" | "orderquery";
  trans_no?: string;
  trans_status?: number;
  trans_type?: string;
  merchant_order_no?: string;
  merchant_no?: string;
  /** Amounts are the raw strings CodePay sent (no float round-trip). */
  order_amount?: string;
  tip_amount?: string;
  trans_amount?: string;
  paid_amount?: string;
  auth_no?: string;
  /** Masked PAN (orderquery: `pay_user_account_id`, e.g. "41004003****4735"). */
  card_no?: string;
  /** RRN. */
  ref_no?: string;
  /** Card entry method 1 swipe / 2 chip / 3 contactless / 4 manual (`entry_model`). */
  entry_mode?: string;
  /** e.g. "Visa", "MasterCard". */
  pay_method_id?: string;
  terminal_sn?: string;
  /** Host decline detail for failed sales (e.g. TS-D2012 "Insufficient Funds"). */
  error_code?: string;
  error_msg?: string;
  trans_time?: string;
  /** CodePay envelope code / msg, for telemetry. */
  code?: string;
  msg?: string;
}

const APPROVED_STATUSES = new Set([2, 4]);
const FAILED_STATUSES = new Set([1, 3]);
const PENDING_STATUSES = new Set([0, 9]);
/** `unavailable` reasons that mean "don't trust this reply", not "no reply". */
const HARD_STOP_REASONS = new Set(["ref_mismatch", "merchant_mismatch", "bad_signature"]);

/**
 * "No such transaction" — deliberately narrow. A permission / routing / auth
 * error (e.g. E07303 "The API is not authorized or does not exist") must never
 * read as "no charge": on the first live probe the old broad pattern matched
 * "does not exist" and reported a known-approved sale as not found.
 */
// M010: "Can't find original transaction"; E04111: MTech orderquery's reply for
// a merchant_order_no it has no record of (live probe 2026-09-28).
const NOT_FOUND_CODES = new Set(["M010", "E04111"]);
const NEVER_NOT_FOUND_CODE = /^(SYS|E07)/i;
const NOT_FOUND_MESSAGE =
  /\[M010\]|can[`'’]?t\s*find\s*(the\s*)?original|(order|transaction|trade|trans)\s*(does\s*not\s*exist|not\s*(found|exist))|no\s*such\s*(order|transaction)/i;

export function isCodePayNotFound(code?: string, msg?: string): boolean {
  if (code && NEVER_NOT_FOUND_CODE.test(code)) return false;
  if (code && NOT_FOUND_CODES.has(code.toUpperCase())) return true;
  return NOT_FOUND_MESSAGE.test(msg ?? "");
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/** The exact string CodePay signs: sorted `k=v` pairs, no `sign`, no empties. */
export function codepayCanonicalString(params: Record<string, unknown>): string {
  return Object.keys(params)
    .filter((k) => k !== "sign")
    .filter((k) => {
      const v = params[k];
      return v !== null && v !== undefined && v !== "";
    })
    .sort()
    .map((k) => {
      const v = params[k];
      return `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
    })
    .join("&");
}

function pemBody(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: ArrayBuffer, encoding: SignEncoding = "base64"): string {
  const arr = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  const b64 = btoa(bin);
  return encoding === "base64url"
    ? b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    : b64;
}

/** Signature text encoding. CodePay's examples are standard base64; the
 *  base64url variant exists only so the probe can rule it out. */
export type SignEncoding = "base64" | "base64url";

const RSA2 = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

export async function importCodePayPrivateKey(pem: string): Promise<CryptoKey> {
  if (/BEGIN RSA PRIVATE KEY/.test(pem)) {
    throw new Error(
      "CodePay private key is PKCS1; convert it to PKCS8 (openssl pkcs8 -topk8 -nocrypt).",
    );
  }
  return await crypto.subtle.importKey(
    "pkcs8",
    base64ToBytes(pemBody(pem)),
    RSA2,
    false,
    ["sign"],
  );
}

export async function importCodePayPublicKey(pemOrBase64: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "spki",
    base64ToBytes(pemBody(pemOrBase64)),
    RSA2,
    false,
    ["verify"],
  );
}

export async function signCodePayParams(
  params: Record<string, unknown>,
  privateKey: CryptoKey,
  encoding: SignEncoding = "base64",
): Promise<string> {
  const sig = await crypto.subtle.sign(
    RSA2,
    privateKey,
    new TextEncoder().encode(codepayCanonicalString(params)),
  );
  return bytesToBase64(sig, encoding);
}

// ---------------------------------------------------------------------------
// Response parsing (raw values, for signature verification)
// ---------------------------------------------------------------------------

/**
 * Split a top-level JSON object into key → raw value text, without re-encoding
 * anything. Signature verification must use the values exactly as CodePay sent
 * them — JSON.parse + stringify would turn "12.40" into 12.4 in a nested object.
 * String values come back unescaped; objects/arrays/numbers as their raw text.
 */
export function topLevelRawValues(body: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  let i = body.indexOf("{");
  if (i < 0) return null;
  i++;
  const skipWs = () => {
    while (i < body.length && /\s/.test(body[i])) i++;
  };
  const readString = (): string => {
    const start = i;
    i++; // opening quote
    while (i < body.length) {
      if (body[i] === "\\") i += 2;
      else if (body[i] === '"') {
        i++;
        break;
      } else i++;
    }
    return body.slice(start, i);
  };
  const readValue = (): string => {
    skipWs();
    const start = i;
    if (body[i] === '"') return readString();
    if (body[i] === "{" || body[i] === "[") {
      let depth = 0;
      while (i < body.length) {
        const c = body[i];
        if (c === '"') {
          readString();
          continue;
        }
        if (c === "{" || c === "[") depth++;
        if (c === "}" || c === "]") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        i++;
      }
      return body.slice(start, i);
    }
    while (i < body.length && body[i] !== "," && body[i] !== "}") i++;
    return body.slice(start, i).trim();
  };
  try {
    for (;;) {
      skipWs();
      if (body[i] === "}") break;
      if (body[i] !== '"') return null;
      const key = JSON.parse(readString()) as string;
      skipWs();
      if (body[i] !== ":") return null;
      i++;
      const raw = readValue();
      out[key] = raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
      skipWs();
      if (body[i] === ",") {
        i++;
        continue;
      }
      if (body[i] === "}") break;
      return null;
    }
  } catch {
    return null;
  }
  return out;
}

/** Verify a CodePay response `sign` over its raw top-level values. */
export async function verifyCodePayResponse(
  body: string,
  publicKey: CryptoKey,
): Promise<boolean | null> {
  const raw = topLevelRawValues(body);
  if (!raw) return false;
  if (!raw.sign) return null; // unsigned response — nothing to verify
  // Raw values are already strings (objects as their original JSON text).
  const canonical = Object.keys(raw)
    .filter((k) => k !== "sign" && raw[k] !== "" && raw[k] !== "null")
    .sort()
    .map((k) => `${k}=${raw[k]}`)
    .join("&");
  try {
    return await crypto.subtle.verify(
      RSA2,
      publicKey,
      base64ToBytes(raw.sign),
      new TextEncoder().encode(canonical),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/**
 * The host part of a gateway URL. PayPilot shows the endpoint as
 * `https://<host>/api/entry`, but the API paths are `/api/entry/orderquery` and
 * `/api/payments/recall` under the same host, so accept either form.
 */
export function codepayGatewayBase(gatewayUrl: string): string {
  // Tolerate copy-paste artefacts: <autolink> brackets, quotes, spaces, and a
  // bare host with no scheme.
  let url = gatewayUrl.trim().replace(/^[<"']+|[>"']+$/g, "").trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "").replace(/\/api\/entry$/i, "");
}

/** A reply payload as an object — CodePay may send it as an object or a JSON string. */
function asObject(v: unknown): Record<string, unknown> | undefined {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string" && v.trim().startsWith("{")) {
    try {
      const o = JSON.parse(v);
      return o && typeof o === "object" ? (o as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  return String(v);
}

export interface CallOutcome {
  ok: boolean;
  reason?: string;
  code?: string;
  msg?: string;
  data?: Record<string, unknown>;
  /** Raw response text — only surfaced to the local probe script. */
  rawBody?: string;
  /** null = response carried no sign; true/false = verification result. */
  signatureVerified?: boolean | null;
}

/**
 * One signed call. `envelope: "full"` sends the documented common params
 * (app_id, merchant_no, version, format, charset, sign_type, timestamp);
 * `"minimal"` sends only app_id + the business params, like CodePay's recall
 * example — the probe compares the two before the function is pinned.
 */
export async function callCodePay(
  cfg: CodePayCloudConfig,
  path: string,
  params: Record<string, unknown>,
  keys: { privateKey: CryptoKey; publicKey: CryptoKey | null },
  timeoutMs: number,
  envelope: "full" | "minimal" = "full",
  encoding: SignEncoding = "base64",
): Promise<CallOutcome> {
  const request: Record<string, unknown> =
    envelope === "full"
      ? {
          app_id: cfg.app_id,
          merchant_no: cfg.merchant_no,
          version: "1.0",
          format: "JSON",
          charset: "UTF-8",
          sign_type: "RSA2",
          timestamp: String(Date.now()),
          ...params,
        }
      : { app_id: cfg.app_id, ...params };
  request.sign = await signCodePayParams(request, keys.privateKey, encoding);

  let res: Response;
  try {
    res = await fetch(`${codepayGatewayBase(cfg.gateway_url)}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError") return { ok: false, reason: "timeout" };
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `network: ${detail}`.slice(0, 160) };
  }
  const body = await res.text();
  if (!res.ok) return { ok: false, reason: `http_${res.status}` };

  let signatureVerified: boolean | null = null;
  if (keys.publicKey) {
    signatureVerified = await verifyCodePayResponse(body, keys.publicKey);
    if (signatureVerified === false) {
      return { ok: false, reason: "bad_signature", rawBody: body, signatureVerified };
    }
  }

  let parsed: { code?: unknown; msg?: unknown; data?: unknown; biz_data?: unknown };
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, reason: "unparseable", rawBody: body };
  }
  return {
    ok: true,
    code: str(parsed.code),
    msg: str(parsed.msg),
    data: asObject(parsed.data) ?? asObject(parsed.biz_data),
    rawBody: body,
    signatureVerified,
  };
}

/** Map one CodePay reply to a lookup verdict (no cross-endpoint merging). */
export function mapCodePayReply(
  reply: CallOutcome,
  merchantOrderNo: string,
  merchantNo: string,
): CodePayLookupResult {
  if (!reply.ok) return { status: "unavailable", reason: reply.reason };
  const base = { code: reply.code, msg: reply.msg };
  if (reply.code !== "0") {
    if (isCodePayNotFound(reply.code, reply.msg)) return { ...base, status: "not_found" };
    const reason = /^E07303$/i.test(reply.code ?? "")
      ? "api_not_authorized"
      : `codepay_error:${reply.code ?? "?"}`;
    return { ...base, status: "unavailable", reason };
  }
  const d = reply.data ?? {};
  const echoedRef = str(d.merchant_order_no);
  if (echoedRef && echoedRef !== merchantOrderNo) {
    return { ...base, status: "unavailable", reason: "ref_mismatch" };
  }
  const echoedMerchant = str(d.merchant_no);
  if (echoedMerchant && echoedMerchant !== merchantNo) {
    return { ...base, status: "unavailable", reason: "merchant_mismatch" };
  }
  const statusRaw = str(d.trans_status);
  const transStatus = statusRaw == null ? NaN : Number(statusRaw);
  const fields: Omit<CodePayLookupResult, "status"> = {
    ...base,
    trans_no: str(d.trans_no),
    trans_status: Number.isFinite(transStatus) ? transStatus : undefined,
    trans_type: str(d.trans_type),
    merchant_order_no: echoedRef,
    merchant_no: echoedMerchant,
    order_amount: str(d.order_amount),
    tip_amount: str(d.tip_amount),
    trans_amount: str(d.trans_amount),
    paid_amount: str(d.paid_amount),
    auth_no: str(d.auth_no) ?? str(d.auth_code),
    card_no: str(d.card_no) ?? str(d.pay_user_account_id),
    ref_no: str(d.ref_no),
    entry_mode: str(d.entry_mode) ?? str(d.entry_model),
    pay_method_id: str(d.pay_method_id),
    terminal_sn: str(d.terminal_sn),
    error_code: str(d.trans_error_code),
    error_msg: str(d.trans_error_msg),
    trans_time: str(d.trans_time) ?? str(d.trans_end_time),
  };
  if (!Number.isFinite(transStatus)) {
    return { ...fields, status: "unavailable", reason: "no_trans_status" };
  }
  if (APPROVED_STATUSES.has(transStatus)) return { ...fields, status: "approved" };
  if (FAILED_STATUSES.has(transStatus)) return { ...fields, status: "failed" };
  if (PENDING_STATUSES.has(transStatus)) return { ...fields, status: "pending" };
  return { ...fields, status: "unavailable", reason: "unknown_trans_status" };
}

/** Import the config's keys once (private for signing, gateway for verifying). */
export async function importCodePayKeys(
  cfg: CodePayCloudConfig,
): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey | null }> {
  return {
    privateKey: await importCodePayPrivateKey(cfg.private_key_pem),
    publicKey: cfg.gateway_public_key
      ? await importCodePayPublicKey(cfg.gateway_public_key)
      : null,
  };
}

export interface CodePayLookupOptions {
  timeoutMs?: number;
  /** orderquery `method` (docs show both "order.query" and "pay.orderquery"). */
  orderQueryMethod?: string;
  /**
   * Resolves a merchant_order_no this location KNOWS was approved (e.g. its
   * latest captured CodePay payment). A "not_found" is only reported when the
   * API can see that canary as approved right now — otherwise a misconfigured
   * app / permission / routing problem could read as "no charge". No canary →
   * not_found is downgraded to unavailable.
   */
  canaryRef?: () => Promise<string | null>;
}

type CodePayKeys = { privateKey: CryptoKey; publicKey: CryptoKey | null };

/** Canary health per gateway/app/merchant, cached briefly per isolate. */
const canaryCache = new Map<string, { ok: boolean; at: number }>();
const CANARY_OK_TTL_MS = 10 * 60_000;
const CANARY_BAD_TTL_MS = 60_000;

async function canaryHealthy(
  cfg: CodePayCloudConfig,
  keys: CodePayKeys,
  opts: CodePayLookupOptions,
  timeoutMs: number,
): Promise<boolean> {
  if (!opts.canaryRef) return false;
  const cacheKey = `${codepayGatewayBase(cfg.gateway_url)}|${cfg.app_id}|${cfg.merchant_no}`;
  const cached = canaryCache.get(cacheKey);
  if (cached && Date.now() - cached.at < (cached.ok ? CANARY_OK_TTL_MS : CANARY_BAD_TTL_MS)) {
    return cached.ok;
  }
  let ok = false;
  try {
    const ref = await opts.canaryRef();
    if (ref) ok = (await lookupRaw(cfg, keys, ref, opts, timeoutMs)).status === "approved";
  } catch {
    ok = false;
  }
  canaryCache.set(cacheKey, { ok, at: Date.now() });
  return ok;
}

/**
 * Look a sale up by its merchant_order_no. `orderquery` gives the verdict with
 * amounts; `recall` is only a fallback when orderquery can't answer (and alone
 * never yields "not_found"). An identity mismatch or bad signature is final. A
 * final "not_found" additionally needs the canary (CodePayLookupOptions.canaryRef).
 */
export async function lookupCodePaySale(
  cfg: CodePayCloudConfig,
  merchantOrderNo: string,
  opts: CodePayLookupOptions = {},
): Promise<CodePayLookupResult> {
  const timeoutMs = opts.timeoutMs ?? 4_000;
  let keys: CodePayKeys;
  try {
    keys = await importCodePayKeys(cfg);
  } catch {
    return { status: "unavailable", reason: "bad_key_config" };
  }
  const result = await lookupRaw(cfg, keys, merchantOrderNo, opts, timeoutMs);
  if (result.status !== "not_found") return result;
  if (await canaryHealthy(cfg, keys, opts, timeoutMs)) return result;
  return { ...result, status: "unavailable", reason: "not_found_unverified" };
}

async function lookupRaw(
  cfg: CodePayCloudConfig,
  keys: CodePayKeys,
  merchantOrderNo: string,
  opts: CodePayLookupOptions,
  timeoutMs: number,
): Promise<CodePayLookupResult> {
  // orderquery is the primary: it returns status, amounts, masked card and RRN,
  // and it indexes on-terminal (ECR) sales (live probe 2026-09-28: a known
  // Register sale came back trans_status 2 with its amounts).
  const query = mapCodePayReply(
    await callCodePay(
      cfg,
      "/api/entry/orderquery",
      { method: opts.orderQueryMethod ?? "order.query", merchant_order_no: merchantOrderNo },
      keys,
      timeoutMs,
    ),
    merchantOrderNo,
    cfg.merchant_no,
  );
  if (query.status !== "unavailable") return { ...query, source: "orderquery" };
  // Identity mismatch / bad signature: a red flag — never ask anyone else.
  if (HARD_STOP_REASONS.has(query.reason ?? "")) return { ...query, source: "orderquery" };

  // orderquery couldn't answer (down / not authorized / no status): recall is a
  // fallback that may confirm a verdict, but on its own it can never establish
  // "not found" — that needs the endpoint that knows about amounts and ECR sales.
  const recall = mapCodePayReply(
    await callCodePay(cfg, "/api/payments/recall", { merchant_order_no: merchantOrderNo }, keys, timeoutMs),
    merchantOrderNo,
    cfg.merchant_no,
  );
  if (recall.status === "not_found") {
    return {
      ...recall,
      status: "unavailable",
      reason: `unconfirmed_not_found:${query.reason ?? "?"}`,
      source: "recall",
    };
  }
  if (recall.status === "unavailable") {
    return { ...query, source: "orderquery" };
  }
  return { ...recall, source: "recall" };
}
