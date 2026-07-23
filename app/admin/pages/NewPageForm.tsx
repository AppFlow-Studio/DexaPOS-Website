"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewPageForm() {
  const [show, setShow] = useState(false);
  const [route, setRoute] = useState("");
  const router = useRouter();

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = route.trim().replace(/^\/+/, "") || "root";
    router.push(`/admin/pages/${encodeURIComponent(slug)}`);
  };

  if (!show) {
    return (
      <button className="btn" onClick={() => setShow(true)} style={{ fontSize: "0.7rem", padding: "10px 20px", minHeight: 40 }}>
        + New Page
      </button>
    );
  }

  return (
    <form onSubmit={create} style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: "0.75rem", color: "var(--slate-500)" }}>/</span>
      <input
        type="text"
        placeholder="page-route"
        value={route}
        onChange={(e) => setRoute(e.target.value)}
        style={{
          background: "var(--paper)",
          border: "1px solid var(--slate-200)",
          borderRadius: "var(--radius-md)",
          padding: "10px 14px",
          color: "var(--ink)",
          fontSize: "0.9rem",
          fontFamily: "var(--font)",
          width: 180,
          minHeight: 44,
        }}
        autoFocus
      />
      <button type="submit" className="btn-save" style={{ padding: "10px 20px", minHeight: 44 }}>
        Create
      </button>
      <button type="button" className="btn-cancel" onClick={() => { setShow(false); setRoute(""); }} style={{ padding: "10px 16px", minHeight: 44 }}>
        Cancel
      </button>
    </form>
  );
}
