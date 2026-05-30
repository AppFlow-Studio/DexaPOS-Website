"use client";

import { useState } from "react";

export default function DemoFrame() {
  const [resetKey, setResetKey] = useState(0);

  return (
    <>
      <div className="demo-meta reveal in">
        <div className="demo-meta-left">
          <div className="demo-meta-eyebrow">Try it now</div>
          <h2>Click any tile. Every screen is live.</h2>
          <p className="demo-meta-sub">
            Sales, Tables, Kitchen Display, Inventory, Analytics, Menu
            Management, Scheduling, Settings — all interactive. Add items to an
            order, watch the totals calculate, navigate between screens.
          </p>
        </div>
        <div className="demo-meta-actions">
          <button
            type="button"
            className="demo-action-btn"
            onClick={() => setResetKey((k) => k + 1)}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M3 12a9 9 0 109-9" />
              <path d="M3 4v5h5" />
            </svg>
            Reset demo
          </button>
          <a
            href="/pos-demo/pos-app.html"
            target="_blank"
            rel="noreferrer"
            className="demo-action-btn"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M15 3h6v6M10 14L21 3M21 14v7H3V3h7" />
            </svg>
            Open full screen
          </a>
        </div>
      </div>

      <div className="device-frame reveal in">
        <div className="device-frame-bar">
          <span className="device-dot red"></span>
          <span className="device-dot yellow"></span>
          <span className="device-dot green"></span>
          <span className="device-url">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            dexaposai.com
          </span>
        </div>
        <div className="device-iframe-wrap">
          <iframe
            key={resetKey}
            src="/pos-demo/pos-app.html"
            className="pos-iframe"
            title="DEXA POS Live Demo"
            loading="lazy"
          />
        </div>
      </div>
    </>
  );
}
