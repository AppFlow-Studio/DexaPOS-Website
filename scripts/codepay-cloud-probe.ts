/**
 * CodePay Cloud API probe — run LOCALLY by whoever holds the merchant private
 * key. Read-only (status lookups only). It pins down, against the live gateway,
 * what `codepay-transaction-status` assumes: which envelope recall accepts,
 * whether recall / orderquery see Register (ECR) sales, the not-found code, and
 * whether responses are signed + verify. It also writes the function-secret env
 * file so the private key never has to be pasted anywhere.
 *
 * Usage (Node 22+):
 *   node --experimental-strip-types scripts/codepay-cloud-probe.ts \
 *     --gateway https://<codepay gateway host> --app-id <cloud app_id> \
 *     --merchant-no 312600550399 --key ./codepay_pk.pem \
 *     [--gateway-key ./codepay_gateway_pub.pem] [--method pay.orderquery] \
 *     --ref CP_1790542126063_d668 --ref CP_1790000000000_0000 \
 *     [--canary-ref <known approved CP_ ref; defaults to the first --ref>] \
 *     --trans-no 51126005503260925000031 \
 *     [--env-out ./codepay-cloud.env --location <location uuid | default>]
 *
 * `--location default` writes the shared entry every location falls back to;
 * it leaves merchant_no out (the function reads each location's from its own
 * CodePay sales), so --merchant-no there only picks whose sales to probe.
 *
 * Then: supabase secrets set --env-file ./codepay-cloud.env [--project-ref …]
 * The env file holds ONE entry and the secret is replaced whole on `set`.
 * The private key and the signing string are never printed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  callCodePay,
  codepayGatewayBase,
  importCodePayKeys,
  lookupCodePaySale,
  type CodePayCloudConfig,
} from "../supabase/functions/_shared/codepayCloud.ts";

function args(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith("--")) continue;
    const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    out.set(k.slice(2), [...(out.get(k.slice(2)) ?? []), v]);
  }
  return out;
}

const a = args();
const one = (k: string) => a.get(k)?.[0];
const need = (k: string) => {
  const v = one(k);
  if (!v) {
    console.error(`missing --${k}`);
    process.exit(2);
  }
  return v;
};

// Normalised up front so the env file (and the function) get a clean https URL.
const cfg: CodePayCloudConfig = {
  gateway_url: codepayGatewayBase(need("gateway")),
  app_id: need("app-id"),
  merchant_no: need("merchant-no"),
  private_key_pem: readFileSync(need("key"), "utf8"),
  ...(one("gateway-key")
    ? { gateway_public_key: readFileSync(one("gateway-key")!, "utf8") }
    : {}),
  ...(one("method") ? { order_query_method: one("method")! } : {}),
};

console.log(`gateway: ${cfg.gateway_url}  app_id: ${cfg.app_id}  merchant_no: ${cfg.merchant_no}`);
const keys = await importCodePayKeys(cfg);
// Known-approved ref used to prove a "not found" is real (see canaryRef).
const canary = one("canary-ref") ?? a.get("ref")?.[0];
const show = (label: string, r: Awaited<ReturnType<typeof callCodePay>>) =>
  console.log(
    `  ${label.padEnd(22)} ok=${r.ok} code=${r.code ?? "-"} msg=${r.msg ?? "-"}` +
      ` signed=${r.signatureVerified === null || r.signatureVerified === undefined ? "no" : r.signatureVerified ? "verified" : "BAD"}` +
      (r.reason ? ` reason=${r.reason}` : "") +
      `\n    data=${JSON.stringify(r.data ?? null)}` +
      // A success we couldn't read a payload from: show the raw reply (it
      // carries CodePay's own response, never our key) so the shape can be pinned.
      ((r.code === "0" && !r.data) || a.has("raw")
        ? `\n    raw=${(r.rawBody ?? "").slice(0, 1500)}`
        : ""),
  );

let first = true;
for (const ref of a.get("ref") ?? []) {
  console.log(`\nmerchant_order_no ${ref}`);
  const p = { merchant_order_no: ref };
  show("recall (full)", await callCodePay(cfg, "/api/payments/recall", p, keys, 8000, "full"));
  show("orderquery (full)", await callCodePay(cfg, "/api/entry/orderquery", { method: "order.query", ...p }, keys, 8000, "full"));
  if (first) {
    // The docs name orderquery's method two ways; try the other one too.
    show("orderquery pay.orderquery", await callCodePay(cfg, "/api/entry/orderquery", { method: "pay.orderquery", ...p }, keys, 8000, "full"));
    show("entry pay.orderquery", await callCodePay(cfg, "/api/entry", { method: "pay.orderquery", ...p }, keys, 8000, "full"));
    first = false;
  }
  const verdict = await lookupCodePaySale(cfg, ref, {
    timeoutMs: 8000,
    orderQueryMethod: cfg.order_query_method,
    canaryRef: async () => canary ?? null,
  });
  console.log(`  => function verdict: ${verdict.status}${verdict.reason ? ` (${verdict.reason})` : ""} via ${verdict.source ?? "-"}`);
}

for (const transNo of a.get("trans-no") ?? []) {
  console.log(`\ntrans_no ${transNo}`);
  const p = { trans_no: transNo };
  show("recall (full)", await callCodePay(cfg, "/api/payments/recall", p, keys, 8000, "full"));
  show("orderquery (full)", await callCodePay(cfg, "/api/entry/orderquery", { method: "order.query", ...p }, keys, 8000, "full"));
}

const envOut = one("env-out");
if (envOut) {
  const location = need("location");
  const { merchant_no: _merchantNo, ...shared } = cfg;
  const entry = { [location]: location === "default" ? shared : cfg };
  // Base64 so the multi-line PEM survives the env file untouched; the function
  // accepts raw JSON or base64.
  const encoded = Buffer.from(JSON.stringify(entry), "utf8").toString("base64");
  writeFileSync(envOut, `CODEPAY_CLOUD_CONFIG=${encoded}\n`, { mode: 0o600 });
  console.log(`\nwrote ${envOut} (mode 600) for location ${location} — delete it after 'supabase secrets set'.`);
}
