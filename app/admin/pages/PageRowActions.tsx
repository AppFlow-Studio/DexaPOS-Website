"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PageRowActions({
  route,
  published,
}: {
  route: string;
  published: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const slug = route.replace(/^\/+/, "") || "root";

  const handleDuplicate = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/cms/pages/${encodeURIComponent(slug)}/duplicate`, {
        method: "POST",
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/cms/pages/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConfirming(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className={`badge${published ? "" : " draft"}`}>
        {published ? "Published" : "Draft"}
      </span>
      <button
        className="page-action-btn"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDuplicate(); }}
        disabled={busy}
        title="Duplicate page"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
      {confirming ? (
        <div style={{ display: "flex", gap: 4 }}>
          <button
            className="page-action-btn page-action-danger"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(); }}
            disabled={busy}
            title="Confirm delete"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <button
            className="page-action-btn"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(false); }}
            title="Cancel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          className="page-action-btn page-action-danger"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(true); }}
          title="Delete page"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      )}
    </div>
  );
}
