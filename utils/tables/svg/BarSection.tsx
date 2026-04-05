import React from "react";

interface BarSectionProps {
  color?: string;
  width?: number;
  height?: number;
}

const BarSection: React.FC<BarSectionProps> = ({
  color = "#94A3B8",
  width = 170,
  height = 100,
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 170 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Bar back body */}
      <rect
        x="5"
        y="8"
        width="160"
        height="52"
        rx="4"
        fill="#1E2340"
        stroke={color}
        strokeWidth="1.5"
      />

      {/* Bar top surface fill */}
      <rect
        x="5"
        y="8"
        width="160"
        height="52"
        rx="4"
        fill={color}
        fillOpacity="0.10"
      />

      {/* Inner counter detail */}
      <rect
        x="12"
        y="15"
        width="146"
        height="16"
        rx="2"
        fill={color}
        fillOpacity="0.06"
        stroke={color}
        strokeWidth="0.75"
        strokeOpacity="0.4"
      />

      {/* Second shelf detail */}
      <rect
        x="12"
        y="36"
        width="146"
        height="16"
        rx="2"
        fill={color}
        fillOpacity="0.06"
        stroke={color}
        strokeWidth="0.75"
        strokeOpacity="0.4"
      />

      {/* Bar front ledge */}
      <rect
        x="5"
        y="60"
        width="160"
        height="10"
        rx="2"
        fill={color}
        fillOpacity="0.15"
        stroke={color}
        strokeWidth="1"
      />

      {/* Bar stools */}
      {[25, 63, 107, 145].map((cx) => (
        <g key={cx}>
          <circle
            cx={cx}
            cy="83"
            r="9"
            fill={color}
            fillOpacity="0.08"
            stroke={color}
            strokeWidth="1"
          />
          <circle cx={cx} cy="83" r="3" fill={color} fillOpacity="0.2" />
        </g>
      ))}
    </svg>
  );
};

export default BarSection;