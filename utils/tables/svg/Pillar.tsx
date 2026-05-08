import React from "react";

interface PillarProps {
  darkMode?: boolean;
  color?: string;
  width?: number;
  height?: number;
}

const Pillar: React.FC<PillarProps> = ({
  darkMode = false,
  color = "#94A3B8",
  width = 40,
  height = 40,
}) => {
  const lightStroke = color;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 40 40"
      fill="none"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer pillar body */}
      <rect
        x="0.75"
        y="0.75"
        width="38.5"
        height="38.5"
        rx="2"
        fill={darkMode ? "#1E2340" : "#1E2340"}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1.5"
      />

      {/* Inner recess */}
      <rect
        x="6"
        y="6"
        width="28"
        height="28"
        rx="1"
        fill={color}
        fillOpacity={darkMode ? 0.06 : 0.06}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="0.75"
        strokeOpacity={darkMode ? 0.5 : 0.5}
      />

      {/* Inner core */}
      <rect
        x="11"
        y="11"
        width="18"
        height="18"
        rx="1"
        fill={color}
        fillOpacity={darkMode ? 0.1 : 0.1}
      />
    </svg>
  );
};

export default Pillar;
