"use client";

import { useState } from "react";
import { Reveal } from "@/components/marketing/Reveal";

interface FaqItem {
  question: string;
  answer: string;
}

export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => {
    setOpenIndex(openIndex === i ? null : i);
  };

  return (
    <Reveal className="faq-list reveal">
      {items.map((item, i) => (
        <div key={i} className={`faq-item${openIndex === i ? " open" : ""}`}>
          <button className="faq-q" onClick={() => toggle(i)}>
            <span>{item.question}</span>
            <span className="faq-q-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          </button>
          {/* Height is animated in CSS via grid-template-rows (0fr -> 1fr), which
              transitions to the answer's real height. The old inline maxHeight:500
              clipped long answers and made short ones feel abrupt, because the
              easing was scaled to 500px rather than the actual content. */}
          <div className="faq-a">
            <div className="faq-a-inner" dangerouslySetInnerHTML={{ __html: item.answer }} />
          </div>
        </div>
      ))}
    </Reveal>
  );
}
