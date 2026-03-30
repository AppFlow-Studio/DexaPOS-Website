"use client";

/**
 * Express wallet row (Square Pay, Google Pay). Disabled until gateway wiring is complete.
 */
export function ExpressCheckoutSection() {
  const btnClass =
    "flex-1 min-h-[44px] py-2.5 px-3 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-55 disabled:cursor-not-allowed";

  return (
    <section className="space-y-2" aria-label="Express checkout">
      <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        Express checkout
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          disabled
          title="Coming soon"
          className={btnClass}
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            borderRadius: "var(--radius)",
          }}
        >
          Square Pay
        </button>
        <button
          type="button"
          disabled
          title="Coming soon"
          className={btnClass}
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            borderRadius: "var(--radius)",
          }}
        >
          Google Pay
        </button>
      </div>
    </section>
  );
}
