import React from "react";

interface CashierStandProps {
  darkMode?: boolean;
  color?: string;
  width?: number;
  height?: number;
}

const CashierStand: React.FC<CashierStandProps> = ({
  darkMode = false,
  color = "#94A3B8",
  width = 100,
  height = 100,
}) => {
  const lightStroke = "#111827";

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 80 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Counter body */}
      <rect
        x="0.75"
        y="0.75"
        width="78.5"
        height="238.5"
        rx="4"
        fill={darkMode ? "#1E2340" : "#E5E7EB"}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1.5"
      />

      {/* Counter surface fill */}
      <rect
        x="0.75"
        y="0.75"
        width="78.5"
        height="238.5"
        rx="4"
        fill={color}
        fillOpacity={darkMode ? 0.07 : 0.75}
      />

      {/* Monitor */}
      <rect
        x="10"
        y="20"
        width="60"
        height="80"
        rx="4"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.75}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1.25"
      />

      {/* Screen inner */}
      <rect
        x="15"
        y="25"
        width="50"
        height="65"
        rx="2"
        fill={color}
        fillOpacity={darkMode ? 0.08 : 0.75}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="0.5"
        strokeOpacity={darkMode ? 0.4 : 0.9}
      />

      {/* Screen stand */}
      <rect
        x="34"
        y="100"
        width="12"
        height="8"
        rx="1"
        fill={color}
        fillOpacity={darkMode ? 0.2 : 0.75}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="0.75"
      />

      {/* Keyboard */}
      <rect
        x="10"
        y="115"
        width="60"
        height="28"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.08 : 0.75}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1"
      />

      {/* Key rows */}
      <rect x="14" y="119" width="52" height="5" rx="1" fill={color} fillOpacity={darkMode ? 0.08 : 0.75} />
      <rect x="14" y="127" width="52" height="5" rx="1" fill={color} fillOpacity={darkMode ? 0.08 : 0.75} />
      <rect x="14" y="135" width="52" height="5" rx="1" fill={color} fillOpacity={darkMode ? 0.08 : 0.75} />

      {/* Cash drawer */}
      <rect
        x="10"
        y="155"
        width="60"
        height="30"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.06 : 0.75}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="0.75"
        strokeOpacity={darkMode ? 0.5 : 0.9}
      />

      {/* Card reader slot */}
      <rect
        x="22"
        y="164"
        width="36"
        height="4"
        rx="2"
        fill={color}
        fillOpacity={darkMode ? 0.2 : 0.75}
      />

      {/* Counter edge */}
      <rect
        x="0.75"
        y="200"
        width="78.5"
        height="38.5"
        rx="4"
        fill={color}
        fillOpacity={darkMode ? 0.05 : 0.75}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="0.75"
        strokeOpacity={darkMode ? 0.4 : 0.9}
      />
    </svg>
  );
};

export default CashierStand;