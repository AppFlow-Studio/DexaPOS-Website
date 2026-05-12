import React from "react";

interface DoorSingleProps {
  darkMode?: boolean;
  color?: string;
  width?: number;
  height?: number;
}

const DoorSingle: React.FC<DoorSingleProps> = ({
  darkMode = false,
  color = "#94A3B8",
  width = 55,
  height = 55,
}) => {
  const strokeColor = darkMode ? "#94A3B8" : "#475569";
  const wedgeFill = darkMode
    ? "rgba(148, 163, 184, 0.2)"
    : "rgba(71, 85, 105, 0.12)";
  const doorFill = darkMode ? "#64748B" : color;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <rect
        x="0"
        y="70"
        width="80"
        height="6"
        fill={darkMode ? "#334155" : "#E2E8F0"}
        stroke={strokeColor}
        strokeWidth="1.5"
      />
      <rect
        x="6"
        y="70"
        width="68"
        height="6"
        fill={darkMode ? "#1E293B" : "#F8FAFC"}
      />
      <path
        d="M 6 70 L 6 6 A 64 64 0 0 1 70 70 Z"
        fill={wedgeFill}
        stroke={strokeColor}
        strokeWidth="1.25"
      />
      <line
        x1="6"
        y1="70"
        x2="6"
        y2="6"
        stroke={doorFill}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle
        cx="6"
        cy="70"
        r="4"
        fill={doorFill}
        stroke={strokeColor}
        strokeWidth="1.5"
      />
      <circle
        cx="6"
        cy="70"
        r="1.5"
        fill={darkMode ? "#1E293B" : "#F8FAFC"}
      />
    </svg>
  );
};

export default DoorSingle;
