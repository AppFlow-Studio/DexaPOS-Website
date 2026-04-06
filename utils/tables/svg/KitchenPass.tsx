import React from "react";

interface KitchenPassProps {
  color?: string;
  width?: number;
  height?: number;
}

const KitchenPass: React.FC<KitchenPassProps> = ({
  color = "#94A3B8",
  width = 180,
  height = 25,
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 180 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Frame */}
      <rect
        x="0.75"
        y="0.75"
        width="178.5"
        height="23.5"
        rx="2"
        fill="#1E2340"
        stroke={color}
        strokeWidth="1.5"
      />

      {/* Opening */}
      <rect
        x="6"
        y="4"
        width="168"
        height="17"
        rx="1"
        fill={color}
        fillOpacity="0.10"
        stroke={color}
        strokeWidth="0.75"
        strokeOpacity="0.4"
      />

      {/* Center dashed line */}
      <line
        x1="6"
        y1="12.5"
        x2="174"
        y2="12.5"
        stroke={color}
        strokeWidth="0.75"
        strokeOpacity="0.5"
        strokeDasharray="8 5"
      />

      {/* Tick marks */}
      {[36, 66, 96, 126, 156].map((x) => (
        <line
          key={x}
          x1={x}
          y1="4"
          x2={x}
          y2="21"
          stroke={color}
          strokeWidth="0.75"
          strokeOpacity="0.3"
        />
      ))}
    </svg>
  );
};

export default KitchenPass;