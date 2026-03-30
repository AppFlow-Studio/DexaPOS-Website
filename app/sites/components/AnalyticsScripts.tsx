"use client";

import Script from "next/script";

/**
 * Embeds third-party analytics scripts into the storefront page.
 * Uses Next.js Script with afterInteractive so they load after the page is interactive.
 * IDs come from the dashboard (SEO & Analytics: Google Analytics ID, Facebook Pixel ID).
 */
interface AnalyticsScriptsProps {
  googleAnalyticsId?: string | null;
  facebookPixelId?: string | null;
}

// Whitelist-sanitize analytics IDs — keep only alphanumeric, dashes, underscores.
// GA IDs are G-XXXXXXXX / UA-XXXXXX-X / AW-XXXXXXX; Pixel IDs are numeric.
// Any other characters (backticks, quotes, semicolons, etc.) are stripped entirely.
function sanitizeAnalyticsId(id: string): string {
  return id.replace(/[^A-Za-z0-9\-_]/g, "");
}

export function AnalyticsScripts({
  googleAnalyticsId,
  facebookPixelId,
}: AnalyticsScriptsProps) {
  const gaId = googleAnalyticsId ? sanitizeAnalyticsId(googleAnalyticsId.trim()) : undefined;
  const fbId = facebookPixelId ? sanitizeAnalyticsId(facebookPixelId.trim()) : undefined;

  return (
    <>
      {gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}');
            `}
          </Script>
        </>
      )}
      {fbId && (
        <Script id="facebook-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${fbId}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}
    </>
  );
}
