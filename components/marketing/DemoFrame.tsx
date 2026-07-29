"use client";

import { useState } from "react";

export default function DemoFrame() {
  const [key, setKey] = useState(0);

  return (
    <>
      <div className="demo-meta">
        <div className="demo-meta-left">
          <div className="demo-meta-eyebrow">Try it now</div>
          <h2>Click any tile. Every screen is live.</h2>
          <p className="demo-meta-sub">Sales, Tables, Kitchen Display, Inventory, Analytics, Menu Management, Scheduling, Settings — all interactive. Add items to an order, watch the totals calculate, navigate between screens.</p>
        </div>
        <div className="demo-meta-actions">
          <button type="button" className="demo-action-btn demo-action-btn-secondary" onClick={() => setKey((k) => k + 1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>
            Reset Demo
          </button>
          <a href="/pos-demo/pos-app.html" target="_blank" className="demo-action-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 3h6v6M10 14L21 3M21 14v7H3V3h7" /></svg>
            Open full screen
          </a>
        </div>
      </div>

      <div className="device-frame">
        <div className="device-frame-bar">
          <span className="device-dot red" />
          <span className="device-dot yellow" />
          <span className="device-dot green" />
          <span className="device-url">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
            dexaposai.com
          </span>
        </div>
        <div className="device-iframe-wrap">
          <iframe key={key} src="/pos-demo/pos-app.html" className="pos-iframe" title="DEXA Live Demo" loading="lazy" />
        </div>
      </div>
    </>
  );
}
