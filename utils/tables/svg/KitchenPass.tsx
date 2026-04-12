import React from "react";

interface KitchenPassProps {
  darkMode?: boolean;
  color?: string;
  width?: number;
  height?: number;
}

const KitchenPass: React.FC<KitchenPassProps> = ({
  darkMode = false,
  color = "#94A3B8",
  width = 180,
  height = 25,
}) => {
  // LIGHT MODE ONLY IMPROVEMENTS
  const lightStroke = "#111827";
  const lightFill = "#F3F4F6";
  const lightOpening = "#E5E7EB";

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
        fill={darkMode ? "#1E2340" : lightFill}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1.5"
      />

      {/* Opening */}
      <rect
        x="6"
        y="4"
        width="168"
        height="17"
        rx="1"
        fill={darkMode ? color : lightOpening}
        fillOpacity={darkMode ? 0.10 : 1}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="0.75"
        strokeOpacity={darkMode ? 0.4 : 0.8}
      />

      {/* Center dashed line */}
      <line
        x1="6"
        y1="12.5"
        x2="174"
        y2="12.5"
        stroke={darkMode ? color : lightStroke}
        strokeWidth="0.75"
        strokeOpacity={darkMode ? 0.5 : 0.7}
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
          stroke={darkMode ? color : lightStroke}
          strokeWidth="0.75"
          strokeOpacity={darkMode ? 0.3 : 0.4}
        />
      ))}
    </svg>
  );
};

export default KitchenPass;