"use client";

export default function InvoiceError({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-100 to-slate-200 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-4xl font-bold text-slate-300">Oops</p>
        <p className="mt-2 text-slate-500 text-sm">
          Something went wrong loading this invoice.
        </p>
        <button
          onClick={reset}
          className="mt-4 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
