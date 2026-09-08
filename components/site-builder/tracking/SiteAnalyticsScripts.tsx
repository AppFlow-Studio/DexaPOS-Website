import Script from "next/script";

import {
  TRACKING_SPECS,
  hasAnyTracking,
  type SiteTracking,
} from "@/lib/site-builder/tracking";
import TrackingEvents from "./TrackingEvents";

/**
 * The merchant's marketing pixels, on the **built site only**.
 *
 * Deliberately not the storefront's `AnalyticsScripts`, and deliberately not
 * reading the storefront's columns: a restaurant may want their agency's pixel
 * across the marketing pages and nothing at all on checkout, or the reverse.
 * Merging the two would be irreversible and one of those merchants would be
 * wrong forever.
 *
 * ## Why interpolating these IDs into script source is safe
 *
 * It is safe because of `resolveTracking`, not because of anything here. Every
 * value has been matched against an anchored pattern of `[A-Z0-9-]` characters
 * — twice, once when the merchant saved it and again on this render — so
 * nothing that reaches the template can carry a quote, a backtick, a semicolon
 * or a `<`. That re-check on read is the part that matters: it means a row
 * written by an older build, or edited directly in the database, still cannot
 * break out of the string it lands in.
 *
 * The belt-and-braces `pattern.test` below is a third check at the point of
 * use. It costs nothing and it means this component is safe to read in
 * isolation, without having to go and confirm what its caller did.
 *
 * ## Consent
 *
 * These load unconditionally, with no consent gate. That is a decision, not an
 * oversight, and it is only defensible for a US-market product: GDPR, the UK
 * PECR and Brazil's LGPD all require opt-in before non-essential trackers fire,
 * and this component would need a gate in front of it before a single EU
 * merchant is onboarded. Recorded in the plan under Phase 6 as a blocking item
 * for that market rather than buried here.
 */
export default function SiteAnalyticsScripts({ tracking }: { tracking: SiteTracking }) {
  const { facebookPixel, googleAnalytics, googleTagManager, tiktokPixel, searchConsole } = tracking;

  // A merchant who has configured nothing gets no `<script>` tags and no
  // listener — not an empty one. The commonest case should cost nothing.
  const anyPixel = hasAnyTracking(tracking);
  if (!anyPixel && !searchConsole) return null;

  const ga = safe("googleAnalytics", googleAnalytics);
  const gtm = safe("googleTagManager", googleTagManager);
  const meta = safe("facebookPixel", facebookPixel);
  const tiktok = safe("tiktokPixel", tiktokPixel);

  return (
    <>
      {/* React hoists a bare <meta> into <head>. Search Console reads it there
          and nowhere else, which is why this is not a Script. */}
      {searchConsole && <meta name="google-site-verification" content={searchConsole} />}

      {gtm && (
        <>
          <Script id="sb-gtm" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;
j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtm}');`}
          </Script>
          {/*
            The <noscript> half of a GTM install. Rarely does anything — a
            visitor with JavaScript off cannot be tracked by tags GTM loads with
            JavaScript — but it is what Google's own snippet ships, and a
            merchant's agency will check for it before they check anything else.
          */}
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtm}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
              title="Google Tag Manager"
            />
          </noscript>
        </>
      )}

      {ga && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga}`}
            strategy="afterInteractive"
          />
          <Script id="sb-ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
window.gtag=window.gtag||gtag;
gtag('js',new Date());
gtag('config','${ga}');`}
          </Script>
        </>
      )}

      {meta && (
        <Script id="sb-meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${meta}');
fbq('track','PageView');`}
        </Script>
      )}

      {tiktok && (
        <Script id="sb-tiktok-pixel" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";
ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};
var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;
var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
ttq.load('${tiktok}');ttq.page();}(window,document,'ttq');`}
        </Script>
      )}

      {anyPixel && (
        <TrackingEvents
          providers={{
            ga: Boolean(ga),
            gtm: Boolean(gtm),
            meta: Boolean(meta),
            tiktok: Boolean(tiktok),
          }}
        />
      )}
    </>
  );
}

/**
 * The third check, at the point of interpolation.
 *
 * `resolveTracking` has already done this on read and the schema did it on
 * write. Doing it again here is what lets this file be reviewed on its own: the
 * question "can a merchant get arbitrary JavaScript into this template" is
 * answerable from the twelve lines above without leaving the file.
 */
function safe(provider: keyof typeof TRACKING_SPECS, value: string | undefined): string | null {
  if (!value) return null;
  return TRACKING_SPECS[provider].pattern.test(value) ? value : null;
}
