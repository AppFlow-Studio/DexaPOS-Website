import React from "react";

interface BarSectionProps {
  darkMode?: boolean;
  width?: number;
  height?: number;
}

const BarSection: React.FC<BarSectionProps> = ({
  darkMode = false,
  width = 170,
  height = 100,
}) => {
  // ONLY LIGHT MODE CHANGES HERE
  const body = "#E5E7EB";
  const surface = "#D1D5DB";
  const inner = "#E5E7EB";
  const ledge = "#9CA3AF";
  const stroke = "#111827";
  const stoolCenter = "#374151";

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 170 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <style>{`
        /* LIGHT MODE ONLY VISUAL IMPROVEMENT */
        .light-body { fill: #E5E7EB; }
        .dark .light-body { fill: white; } /* OLD EXACT BEHAVIOR */
      `}</style>

      {/* Main body */}
      <rect
        x="5"
        y="8"
        width="160"
        height="52"
        rx="4"
        fill={darkMode ? "#1E2340" : body}
        stroke={darkMode ? "#94A3B8" : stroke}
        strokeWidth="2"
      />

      {/* Surface */}
      <rect
        x="5"
        y="8"
        width="160"
        height="52"
        rx="4"
        fill={darkMode ? "#1E2340" : surface}
      />

      {/* Inner counter */}
      <rect
        x="12"
        y="15"
        width="146"
        height="16"
        rx="2"
        fill={darkMode ? "#1E2340" : inner}
        stroke={darkMode ? "#94A3B8" : stroke}
        strokeWidth="1"
      />

      {/* Shelf */}
      <rect
        x="12"
        y="36"
        width="146"
        height="16"
        rx="2"
        fill={darkMode ? "#1E2340" : inner}
        stroke={darkMode ? "#94A3B8" : stroke}
        strokeWidth="1"
      />

      {/* Front ledge */}
      <rect
        x="5"
        y="60"
        width="160"
        height="10"
        rx="2"
        fill={darkMode ? "#1E2340" : ledge}
        stroke={darkMode ? "#94A3B8" : stroke}
        strokeWidth="1.5"
      />

      {/* Stools */}
      {[25, 63, 107, 145].map((cx) => (
        <g key={cx}>
          <circle
            cx={cx}
            cy="83"
            r="9"
            fill={darkMode ? "#1E2340" : inner}
            stroke={darkMode ? "#94A3B8" : stroke}
            strokeWidth="1.5"
          />
          <circle
            cx={cx}
            cy="83"
            r="3"
            fill={darkMode ? "#CBD5F5" : stoolCenter}
          />
        </g>
      ))}
    </svg>
  );
};

export default BarSection;