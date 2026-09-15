import Link from "next/link";

/**
 * The page a guest sees when a scanned QR code cannot be honoured.
 *
 * Shared by the table route (`/t/[token]`) and the marketing route
 * (`/m/[code]`). The two have different reasons and different copy, so each
 * builds its own words — but they must not drift into two different-looking
 * dead ends, which is what happened to the QR *render* paths before Part A
 * collapsed them.
 *
 * Deliberately plain and unbranded: this renders when the store lookup may
 * itself have failed, so it cannot depend on merchant theme values existing.
 */
export interface QrUnavailableCopy {
  title: string;
  message: string;
  hint: string;
  nextOpen?: string | null;
}

export function QrUnavailableState({
  slug,
  storeName,
  eyebrow,
  copy,
}: {
  slug: string;
  /** Blank when the store itself could not be resolved. */
  storeName?: string | null;
  eyebrow: string;
  copy: QrUnavailableCopy;
}) {
  return (
    <div className="min-h-screen bg-white px-6 py-12">
      <section
        className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6"
        aria-labelledby="qr-unavailable-title"
        aria-describedby="qr-unavailable-message"
        role="alert"
      >
        <p
          className="text-xs font-semibold uppercase tracking-[0.18em]"
          style={{ color: "#0C4FD1" }}
        >
          {eyebrow}
        </p>
        <h1
          id="qr-unavailable-title"
          className="mt-3 text-2xl font-semibold text-slate-950"
        >
          {copy.title}
        </h1>
        {storeName ? (
          <p className="mt-2 text-sm font-medium text-slate-700">{storeName}</p>
        ) : null}
        <p
          id="qr-unavailable-message"
          className="mt-4 text-sm leading-6 text-slate-600"
        >
          {copy.message}
        </p>
        {copy.nextOpen ? (
          <p className="mt-3 text-sm text-slate-600">
            Next open:{" "}
            <span className="font-medium text-slate-900">{copy.nextOpen}</span>
          </p>
        ) : null}
        <p className="mt-3 text-sm text-slate-600">{copy.hint}</p>
        <div className="mt-6">
          <Link
            href={`/sites/${slug}`}
            className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold"
            style={{ backgroundColor: "#0C4FD1", color: "#FFFFFF" }}
          >
            Back to menu
          </Link>
        </div>
      </section>
    </div>
  );
}
