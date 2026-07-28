"use client";

// TEMPORARY QA harness for the payments-table filters. Delete before merge.
import { PaymentsTable } from "@/app/dashboard/payments/components/PaymentsTable";
import type { PaymentRecord } from "@/types/payment";

let n = 0;
function p(o: Partial<PaymentRecord>): PaymentRecord {
  n += 1;
  return {
    id: `p${n}`,
    order_id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    payment_method: "card",
    amount: 10,
    tip_amount: 0,
    total_amount: 10,
    status: "captured",
    initiated_at: "2026-07-20T10:00:00Z",
    created_at: "2026-07-20T10:00:00Z",
    orders: { order_number: `ORD-${1000 + n}` },
    ...o,
  } as unknown as PaymentRecord;
}

const DATA: PaymentRecord[] = [
  // Same brand + mode, spelled differently by two sources.
  p({ card_type: "Visa", card_last_four: "4242", card_entry_mode: "chip", amount: 100 }),
  p({ card_type: "Visa", card_last_four: "4242", card_entry_mode: "chip", amount: 150 }),
  p({
    card_last_four: "1111",
    amount: 200,
    processor_response: {
      castles_transaction: { cardType: "VISA", entryMode: "EMV" },
    },
  }),
  p({ card_type: "Mastercard", card_last_four: "5555", card_entry_mode: "contactless", amount: 75 }),
  p({
    card_last_four: "5556",
    amount: 60,
    processor_response: { castles_transaction: { cardType: "MC", entryMode: "emvcl" } },
  }),
  p({ card_type: "Amex", card_last_four: "0005", card_entry_mode: "swipe", amount: 500 }),
  p({ payment_method: "card_manual", card_type: "Discover", card_last_four: "1117", card_entry_mode: "keyed", amount: 42.5 }),
  p({ payment_method: "cash", amount: 25 }),
  p({ payment_method: "cash", amount: 5 }),
  p({ payment_method: "external", amount: 33.33 }),
  p({ payment_method: "gift_card", amount: 15 }),
  // No order_id and no order number — must render "—", not a broken link.
  p({ payment_method: "cash", amount: 7, order_id: undefined, orders: undefined }),
];

export default function FiltersQaPage() {
  return (
    <main className="p-6">
      <h2 className="mb-4 text-sm font-semibold">
        payments table filters — {DATA.length} rows
      </h2>
      <PaymentsTable data={DATA} />
    </main>
  );
}
