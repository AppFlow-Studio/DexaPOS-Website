import { cn } from "@/lib/utils";
import type { LocationIdentity } from "../../types";

function TornEdgeTop() {
  return (
    <svg
      className="absolute -top-2 left-0 w-full h-3 text-[#faf9f6] dark:text-zinc-900"
      viewBox="0 0 400 12"
      preserveAspectRatio="none"
    >
      <path
        d="M0,12 L0,6 Q10,8 20,6 T40,6 T60,6 T80,6 T100,6 T120,6 T140,6 T160,6 T180,6 T200,6 T220,6 T240,6 T260,6 T280,6 T300,6 T320,6 T340,6 T360,6 T380,6 T400,6 L400,12 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TornEdgeBottom() {
  return (
    <svg
      className="absolute -bottom-2 left-0 w-full h-3 text-[#faf9f6] dark:text-zinc-900"
      viewBox="0 0 400 12"
      preserveAspectRatio="none"
    >
      <path
        d="M0,0 L0,6 Q10,4 20,6 T40,6 T60,6 T80,6 T100,6 T120,6 T140,6 T160,6 T180,6 T200,6 T220,6 T240,6 T260,6 T280,6 T300,6 T320,6 T340,6 T360,6 T380,6 T400,6 L400,0 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function DottedLine() {
  return (
    <div className="border-b border-dashed border-zinc-400 dark:border-zinc-600 my-2" />
  );
}

export function DoubleLine() {
  return (
    <div className="my-2">
      <div className="border-b border-zinc-400 dark:border-zinc-600" />
      <div className="border-b border-zinc-400 dark:border-zinc-600 mt-0.5" />
    </div>
  );
}

interface ReceiptIdentityBlockProps {
  locationIdentity?: LocationIdentity;
}

export function ReceiptIdentityBlock({ locationIdentity }: ReceiptIdentityBlockProps) {
  const hasName = !!locationIdentity?.name;
  const hasAddress = !!(locationIdentity?.address_line1 && locationIdentity.city);
  const hasPhone = !!locationIdentity?.phone;
  const hasAnyData = hasName || hasAddress || hasPhone;

  if (!hasAnyData) {
    return (
      <div className="text-center text-[10px] text-zinc-400 dark:text-zinc-600 italic">
        Store name &amp; address will appear here
      </div>
    );
  }

  const addressParts = [
    locationIdentity.address_line1,
    locationIdentity.address_line2,
  ].filter(Boolean).join(", ");
  const cityLine = [locationIdentity.city, locationIdentity.state, locationIdentity.postal_code]
    .filter(Boolean).join(", ");

  return (
    <>
      {hasName && (
        <div className="text-center font-bold text-sm">{locationIdentity.name}</div>
      )}
      {hasAddress && addressParts && (
        <div className="text-center text-[10px] text-zinc-500">{addressParts}</div>
      )}
      {hasAddress && cityLine && (
        <div className="text-center text-[10px] text-zinc-500">{cityLine}</div>
      )}
      {hasPhone && (
        <div className="text-center text-[10px] text-zinc-500">{locationIdentity.phone}</div>
      )}
    </>
  );
}

interface ReceiptPaperProps {
  children: React.ReactNode;
  className?: string;
}

export function ReceiptPaper({ children, className }: ReceiptPaperProps) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-[320px] bg-[#faf9f6] dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono text-xs leading-relaxed px-4 py-6 shadow-md",
        className,
      )}
    >
      <TornEdgeTop />
      <div className="min-h-[200px]">{children}</div>
      <TornEdgeBottom />
    </div>
  );
}
