// DEXA wordmark logo (SVG). Uses currentColor so it adapts to light/dark
// surfaces; the middle "E" bar is fixed brand blue. Sized via CSS (.logo svg).
export default function DexaWordmark() {
  return (
    <svg
      viewBox="0 0 220 44"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="DEXA — Smarter Operations, Better Results."
    >
      <path
        d="M2 4 L2 40 L18 40 C30 40 38 32 38 22 C38 12 30 4 18 4 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <line x1="56" y1="6" x2="92" y2="6" stroke="currentColor" strokeWidth="2.5" />
      <line x1="56" y1="22" x2="92" y2="22" stroke="#5B6CFF" strokeWidth="3" />
      <line x1="56" y1="38" x2="92" y2="38" stroke="currentColor" strokeWidth="2.5" />
      <line x1="108" y1="4" x2="146" y2="40" stroke="currentColor" strokeWidth="2.5" />
      <line x1="146" y1="4" x2="108" y2="40" stroke="currentColor" strokeWidth="2.5" />
      <line x1="162" y1="40" x2="180" y2="4" stroke="currentColor" strokeWidth="2.5" />
      <line x1="180" y1="4" x2="198" y2="40" stroke="currentColor" strokeWidth="2.5" />
      <line x1="170" y1="26" x2="190" y2="26" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}
