"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Search, X } from "lucide-react";
import { StorefrontMenu, StorefrontItem } from "@/types/storefront";
import { motion, AnimatePresence } from "motion/react";
import {
  getStorefrontBrowsePrice,
  getStorefrontDeliveryPriceLabel,
} from "../lib/storefront-pricing";

interface MenuSearchProps {
  menus: StorefrontMenu[];
  /** "bar" — full-width input (sidebar/nav use); "icon" — icon that expands on click (header use) */
  variant?: "bar" | "icon";
  placeholder?: string;
  onResultClick: (item: StorefrontItem) => void;
}

function flattenItems(menus: StorefrontMenu[]): StorefrontItem[] {
  const seen = new Map<string, StorefrontItem>();
  menus.forEach((menu) =>
    menu.categories?.forEach((cat) =>
      cat.items?.forEach((i) => {
        if (!seen.has(i.id)) seen.set(i.id, i);
      })
    )
  );
  return Array.from(seen.values());
}

export function MenuSearch({
  menus,
  variant = "bar",
  placeholder = "Search menu…",
  onResultClick,
}: MenuSearchProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false); // icon mode only
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allItems = useMemo(() => flattenItems(menus), [menus]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const nameStart: StorefrontItem[] = [];
    const nameContains: StorefrontItem[] = [];
    const descContains: StorefrontItem[] = [];
    for (const item of allItems) {
      const name = item.name.toLowerCase();
      if (name.startsWith(q)) nameStart.push(item);
      else if (name.includes(q)) nameContains.push(item);
      else if (q.length >= 3 && item.description?.toLowerCase().includes(q)) descContains.push(item);
    }
    return [...nameStart, ...nameContains, ...descContains].slice(0, 7);
  }, [query, allItems]);

  const showDropdown = focused && query.trim().length >= 2;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setFocused(false);
        if (variant === "icon") { setExpanded(false); setQuery(""); }
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [variant]);

  const handleSelect = useCallback((item: StorefrontItem) => {
    onResultClick(item);
    setQuery("");
    setFocused(false);
    if (variant === "icon") setExpanded(false);
  }, [onResultClick, variant]);

  const handleClear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  const closeIconSearch = useCallback(() => {
    setExpanded(false);
    setFocused(false);
    setQuery("");
  }, []);

  const toggleIconSearch = () => {
    if (expanded) {
      closeIconSearch();
      return;
    }

    setExpanded(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  if (variant === "icon") {
    return (
      <div ref={containerRef} className="relative flex items-center">
        <AnimatePresence>
          {expanded ? (
            <motion.div
              key="input"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 200, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="relative flex items-center">
                <Search className="absolute left-2.5 h-4 w-4 shrink-0" style={{ color: "#9CA3AF" }} />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      closeIconSearch();
                      toggleButtonRef.current?.focus();
                    }
                  }}
                  placeholder={placeholder}
                  autoFocus
                  className="w-full pl-8 pr-8 py-1.5 text-sm rounded-full border outline-none"
                  style={{ backgroundColor: "#F9FAFB", borderColor: "#E5E7EB", color: "#111827" }}
                />
                {query && (
                  <button type="button" onClick={handleClear} className="absolute right-2.5">
                    <X className="h-3.5 w-3.5" style={{ color: "#9CA3AF" }} />
                  </button>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <button
          ref={toggleButtonRef}
          type="button"
          onClick={toggleIconSearch}
          className="ml-1 w-9 h-9 flex items-center justify-center rounded-full transition-colors hover:bg-gray-100"
          style={{ color: "var(--primary)" }}
          aria-label={expanded ? "Close menu search" : "Search menu"}
          aria-expanded={expanded}
        >
          {expanded ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
        </button>

        {/* Dropdown */}
        <AnimatePresence>
          {showDropdown && (
            <SearchDropdown results={results} query={query} onSelect={handleSelect} anchor="right" />
          )}
        </AnimatePresence>
      </div>
    );
  }

  // bar variant
  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 shrink-0 pointer-events-none" style={{ color: "#9CA3AF" }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border outline-none transition-colors"
          style={{
            backgroundColor: "#F9FAFB",
            borderColor: focused ? "var(--primary)" : "#E5E7EB",
            color: "#111827",
          }}
        />
        {query && (
          <button type="button" onClick={handleClear} className="absolute right-2.5">
            <X className="h-3.5 w-3.5" style={{ color: "#9CA3AF" }} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showDropdown && (
          <SearchDropdown results={results} query={query} onSelect={handleSelect} anchor="left" />
        )}
      </AnimatePresence>
    </div>
  );
}

function SearchDropdown({
  results,
  query,
  onSelect,
  anchor,
}: {
  results: StorefrontItem[];
  query: string;
  onSelect: (item: StorefrontItem) => void;
  anchor: "left" | "right";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      className="absolute top-full mt-1 z-50 min-w-[260px] rounded-xl border shadow-lg overflow-hidden"
      style={{
        backgroundColor: "#FFFFFF",
        borderColor: "#E5E7EB",
        [anchor === "right" ? "right" : "left"]: 0,
      }}
    >
      {results.length === 0 ? (
        <div className="px-4 py-5 text-sm text-center" style={{ color: "#6B7280" }}>
          No items match your search.
        </div>
      ) : (
        <ul>
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // prevent blur before click
                onClick={() => onSelect(item)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
              >
                {item.image && (
                  <img
                    src={item.image}
                    alt=""
                    className="w-9 h-9 rounded-lg object-cover shrink-0"
                    style={{ border: "1px solid #E5E7EB" }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1" style={{ color: "#111827" }}>
                    <HighlightMatch text={item.name} query={query} />
                  </p>
                  {item.description && (
                    <p className="text-xs line-clamp-1 mt-0.5" style={{ color: "#6B7280" }}>
                      {item.description}
                    </p>
                  )}
                </div>
                <span className="text-sm font-semibold shrink-0" style={{ color: "var(--primary)" }}>
                  ${getStorefrontBrowsePrice(item).toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="px-4 py-2 border-t text-[10px]" style={{ borderColor: "#F3F4F6", color: "#9CA3AF" }}>
        {results.length > 0 ? `${results.length} result${results.length !== 1 ? "s" : ""}` : "Try a different term"}
      </div>
      {results.length > 0 && results.some((item) => getStorefrontDeliveryPriceLabel(item)) && (
        <div className="px-4 pb-3 text-[10px]" style={{ color: "#9CA3AF" }}>
          Delivery pricing appears at checkout when applicable.
        </div>
      )}
    </motion.div>
  );
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent font-bold" style={{ color: "var(--primary)" }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}
