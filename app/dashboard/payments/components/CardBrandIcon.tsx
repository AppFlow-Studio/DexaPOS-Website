/**
 * Inline SVG icons for major card brands.
 * Matches the `card_type` string returned by payment processors
 * (Dejavoo, SpinAPI, etc.) — typically "Visa", "Mastercard", "Amex", etc.
 */

interface CardBrandIconProps {
  brand?: string | null;
  className?: string;
}

export function CardBrandIcon({ brand, className = "h-6 w-auto" }: CardBrandIconProps) {
  if (!brand) return null;

  const key = brand.toLowerCase().replace(/[\s-_]/g, "");

  switch (key) {
    case "visa":
      return <VisaIcon className={className} />;
    case "mastercard":
    case "mc":
      return <MastercardIcon className={className} />;
    case "amex":
    case "americanexpress":
      return <AmexIcon className={className} />;
    case "discover":
      return <DiscoverIcon className={className} />;
    case "dinersclub":
    case "diners":
      return <DinersIcon className={className} />;
    case "jcb":
      return <JcbIcon className={className} />;
    case "unionpay":
      return <UnionPayIcon className={className} />;
    default:
      return (
        <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {brand}
        </span>
      );
  }
}

// ─── Visa ────────────────────────────────────────────────────────────────────

function VisaIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 780 500"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Visa"
    >
      <rect width="780" height="500" rx="40" fill="#1A1F71" />
      <path
        d="M293.2 348.7l33.4-195.7h53.4l-33.4 195.7H293.2zM540.7 157.2c-10.6-4-27.2-8.3-47.9-8.3-52.8 0-90 26.6-90.2 64.6-.3 28.1 26.5 43.8 46.8 53.2 20.8 9.6 27.8 15.8 27.7 24.4-.1 13.2-16.6 19.2-32 19.2-21.4 0-32.7-3-50.3-10.2l-6.9-3.1-7.5 43.8c12.5 5.5 35.6 10.2 59.6 10.5 56.2 0 92.6-26.3 93-66.8.2-22.3-14-39.2-44.8-53.2-18.6-9.1-30-15.1-29.9-24.3 0-8.1 9.7-16.8 30.5-16.8 17.4-.3 30 3.5 39.8 7.5l4.8 2.2 7.3-42.7zM648.2 153h-41.3c-12.8 0-22.4 3.5-28 16.3L490 348.7h56.2s9.2-24.1 11.3-29.4c6.1 0 60.8.1 68.6.1 1.6 6.9 6.5 29.3 6.5 29.3H684L648.2 153zm-66 126c4.4-11.3 21.4-54.8 21.4-54.8-.3.5 4.4-11.4 7.1-18.8l3.6 17s10.3 47 12.5 56.6h-44.6zM231.5 153L179 283.6l-5.6-27.1c-9.7-31.2-40-65.1-73.9-82l47.9 173.9h56.6l84.2-195.4h-56.7z"
        fill="#fff"
      />
      <path
        d="M120.8 153H37.6l-.7 4c67 16.2 111.4 55.4 129.8 102.5L148.6 170c-3.2-12.4-12.6-16.5-27.8-17z"
        fill="#F9A533"
      />
    </svg>
  );
}

// ─── Mastercard ──────────────────────────────────────────────────────────────

function MastercardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 780 500"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Mastercard"
    >
      <rect width="780" height="500" rx="40" fill="#000" />
      <circle cx="312" cy="250" r="150" fill="#EB001B" />
      <circle cx="468" cy="250" r="150" fill="#F79E1B" />
      <path
        d="M390 130.7c38.4 31.2 63 78.6 63 131.3s-24.6 100.1-63 131.3c-38.4-31.2-63-78.6-63-131.3s24.6-100.1 63-131.3z"
        fill="#FF5F00"
      />
    </svg>
  );
}

// ─── Amex ────────────────────────────────────────────────────────────────────

function AmexIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 780 500"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="American Express"
    >
      <rect width="780" height="500" rx="40" fill="#2E77BC" />
      <text
        x="390"
        y="270"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
        fontSize="120"
        letterSpacing="4"
      >
        AMEX
      </text>
    </svg>
  );
}

// ─── Discover ────────────────────────────────────────────────────────────────

function DiscoverIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 780 500"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Discover"
    >
      <rect width="780" height="500" rx="40" fill="#fff" stroke="#ddd" strokeWidth="2" />
      <rect y="330" width="780" height="170" rx="0" fill="#F48120" />
      <path d="M0 330h780v130c0 22.1-17.9 40-40 40H40c-22.1 0-40-17.9-40-40V330z" fill="#F48120" />
      <circle cx="470" cy="250" r="80" fill="#F48120" />
      <text
        x="260"
        y="260"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#000"
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
        fontSize="90"
      >
        DISC
      </text>
      <text
        x="560"
        y="260"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#000"
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
        fontSize="90"
      >
        VER
      </text>
    </svg>
  );
}

// ─── Diners Club ─────────────────────────────────────────────────────────────

function DinersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 780 500"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Diners Club"
    >
      <rect width="780" height="500" rx="40" fill="#0079BE" />
      <circle cx="390" cy="250" r="140" fill="#fff" />
      <circle cx="340" cy="250" r="100" fill="none" stroke="#0079BE" strokeWidth="30" />
      <circle cx="440" cy="250" r="100" fill="none" stroke="#0079BE" strokeWidth="30" />
    </svg>
  );
}

// ─── JCB ─────────────────────────────────────────────────────────────────────

function JcbIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 780 500"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="JCB"
    >
      <rect width="780" height="500" rx="40" fill="#fff" stroke="#ddd" strokeWidth="2" />
      <rect x="150" y="100" width="140" height="300" rx="20" fill="#0E4C96" />
      <rect x="320" y="100" width="140" height="300" rx="20" fill="#E4122B" />
      <rect x="490" y="100" width="140" height="300" rx="20" fill="#007B40" />
      <text x="220" y="270" textAnchor="middle" dominantBaseline="central" fill="#fff" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="60">J</text>
      <text x="390" y="270" textAnchor="middle" dominantBaseline="central" fill="#fff" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="60">C</text>
      <text x="560" y="270" textAnchor="middle" dominantBaseline="central" fill="#fff" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="60">B</text>
    </svg>
  );
}

// ─── UnionPay ────────────────────────────────────────────────────────────────

function UnionPayIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 780 500"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="UnionPay"
    >
      <rect width="780" height="500" rx="40" fill="#034A9A" />
      <rect x="260" y="0" width="280" height="500" fill="#01798A" rx="0" />
      <rect x="460" y="0" width="320" height="500" fill="#C20017" rx="0" />
      <path d="M460 0h280c22.1 0 40 17.9 40 40v420c0 22.1-17.9 40-40 40H460V0z" fill="#C20017" />
      <text x="390" y="270" textAnchor="middle" dominantBaseline="central" fill="#fff" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="72">UnionPay</text>
    </svg>
  );
}
