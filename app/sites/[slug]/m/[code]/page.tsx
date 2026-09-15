import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getStorefrontData } from "../../../actions";
import { resolveMarketingQr, type MarketingQrFailureReason } from "../../../qr-actions";
import {
  QrUnavailableState,
  type QrUnavailableCopy,
} from "../../../components/QrUnavailableState";
import StorefrontPage from "../../page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{
    slug: string;
    code: string;
  }>;
}

/**
 * Copy for a marketing code that could not be honoured.
 *
 * The guest here is a stranger holding a flyer, not a seated diner, so none of
 * the table route's "ask the staff" wording applies — they may be nowhere near
 * the shop. Every message ends somewhere useful instead.
 */
function buildMarketingUnavailableCopy(
  reason: MarketingQrFailureReason
): QrUnavailableCopy {
  switch (reason) {
    case "inactive":
      return {
        title: "This code is no longer active",
        message:
          "The offer or campaign this code was printed for has ended. The store is still open — you can browse the current menu and order from there.",
        hint: "Nothing is wrong with your phone; this particular code was switched off.",
      };
    case "rate_limited":
      return {
        title: "Please wait a moment",
        message:
          "This code has been scanned a lot in the last minute. Wait a few seconds and scan again, or use the button below.",
        hint: "This limit exists to protect the store, not to block you.",
      };
    case "store_unavailable":
      return {
        title: "This store is not taking orders online",
        message:
          "The storefront this code points to is currently switched off.",
        hint: "Try again later, or contact the store directly.",
      };
    case "not_found":
    default:
      return {
        title: "We could not find this code",
        message:
          "This code does not match anything for this store. It may have been mistyped, or the flyer may belong to a different location.",
        hint: "Check the address printed on the flyer, or browse the menu below.",
      };
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { site, location } = await getStorefrontData(slug);

  // The merchant's name, never DexaPOS's — a merchant site must not advertise
  // us in the tab. Website-builder QA logged exactly that leak before.
  const title = site?.title || location?.name || "Order online";

  return {
    title,
    // A marketing code is a tracked entry point, not a page worth indexing;
    // and indexing it would let a scan be counted by a crawler.
    robots: { index: false, follow: false },
  };
}

/**
 * A table-less marketing QR — the code on a flyer, door decal or delivery bag.
 *
 * This **renders** the storefront rather than redirecting to it. A page whose
 * body is `redirect()` is broken app-wide in this Next version: under a
 * force-dynamic layout the response has already begun streaming, so Next
 * answers 200 and hands the client router a state it throws on. The usual
 * escape — `redirects()` in next.config.ts — only serves *static* rules, and
 * this destination comes from a database row. Rendering sidesteps the whole
 * problem, and matches what `/t/[token]` already does.
 *
 * `marketing_qr_codes.destination_path` is therefore not honoured yet: v1
 * always lands on the storefront root. The ticket puts editable destinations
 * out of scope, and the column is already migrated for whoever picks that up.
 */
export default async function MarketingQrPage({ params }: PageProps) {
  const { slug, code } = await params;

  // Resolve first, and exactly once: this call is what writes the scan event
  // and bumps the counter, so it must not be repeated per render path.
  const resolved = await resolveMarketingQr(slug, code);

  if (!resolved.success) {
    const { site, location } = await getStorefrontData(slug);

    // No store at all is a genuine 404. A store that exists but could not
    // honour the code gets the explanatory page instead, so someone standing
    // in the shop with a dead flyer is told what happened.
    if (!location && resolved.reason === "store_unavailable") {
      notFound();
    }

    return (
      <QrUnavailableState
        slug={slug}
        storeName={site?.title || location?.name || null}
        eyebrow="Scan to order"
        copy={buildMarketingUnavailableCopy(resolved.reason ?? "not_found")}
      />
    );
  }

  // Delegate to the real storefront rather than restaging it. The theme setup
  // it does is already duplicated once between this route's sibling and the
  // storefront itself; a third copy is how branded-on-screen /
  // unbranded-on-paper happened to the QR renderer before Part A.
  return <StorefrontPage params={Promise.resolve({ slug })} />;
}
