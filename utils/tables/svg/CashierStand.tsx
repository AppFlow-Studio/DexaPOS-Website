import React from "react";

interface CashierStandProps {
  color?: string;
  width?: number;
  height?: number;
}

const CashierStand: React.FC<CashierStandProps> = ({
  color = "#94A3B8",
  width = 80,
  height = 240,
}) => {
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
        fill="#1E2340"
        stroke={color}
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
        fillOpacity="0.07"
      />

      {/* Monitor / screen */}
      <rect
        x="10"
        y="20"
        width="60"
        height="80"
        rx="4"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="1.25"
      />

      {/* Screen inner display area */}
      <rect
        x="15"
        y="25"
        width="50"
        height="65"
        rx="2"
        fill={color}
        fillOpacity="0.08"
        stroke={color}
        strokeWidth="0.5"
        strokeOpacity="0.4"
      />

      {/* Screen stand/neck */}
      <rect
        x="34"
        y="100"
        width="12"
        height="8"
        rx="1"
        fill={color}
        fillOpacity="0.2"
        stroke={color}
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
        fillOpacity="0.08"
        stroke={color}
        strokeWidth="1"
      />

      {/* Keyboard key rows */}
      <rect x="14" y="119" width="52" height="5" rx="1" fill={color} fillOpacity="0.08" />
      <rect x="14" y="127" width="52" height="5" rx="1" fill={color} fillOpacity="0.08" />
      <rect x="14" y="135" width="52" height="5" rx="1" fill={color} fillOpacity="0.08" />

      {/* Cash drawer / card reader area */}
      <rect
        x="10"
        y="155"
        width="60"
        height="30"
        rx="3"
        fill={color}
        fillOpacity="0.06"
        stroke={color}
        strokeWidth="0.75"
        strokeOpacity="0.5"
      />

      {/* Card reader slot */}
      <rect
        x="22"
        y="164"
        width="36"
        height="4"
        rx="2"
        fill={color}
        fillOpacity="0.2"
      />

      {/* Customer-facing counter edge */}
      <rect
        x="0.75"
        y="200"
        width="78.5"
        height="38.5"
        rx="4"
        fill={color}
        fillOpacity="0.05"
        stroke={color}
        strokeWidth="0.75"
        strokeOpacity="0.4"
      />
    </svg>
  );
};

export default CashierStand;