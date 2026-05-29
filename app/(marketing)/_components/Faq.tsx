"use client";

import { useState, type ReactNode } from "react";

export type FaqItem = { q: string; a: ReactNode };

export default function Faq({ items }: { items: FaqItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="faq-list reveal in">
      {items.map((item, i) => {
        const isOpen = openIdx === i;
        return (
          <div
            key={i}
            className={`faq-item${isOpen ? " open" : ""}`}
          >
            <button
              className="faq-q"
              type="button"
              onClick={() => setOpenIdx(isOpen ? null : i)}
            >
              <span>{item.q}</span>
              <span className="faq-q-icon">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </button>
            <div className="faq-a">
              <div className="faq-a-inner">{item.a}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
