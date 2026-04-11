import React from "react";

interface WallSectionProps {
  darkMode?: boolean;
  color?: string;
  width?: number;
  height?: number;
}

const WallSection: React.FC<WallSectionProps> = ({
  darkMode = false,
  color = "#94A3B8",
  width = 200,
  height = 10,
}) => {
  const lightStroke = "#111827";

  const stroke = darkMode ? color : lightStroke;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      {/* Wall body */}
      <rect
        x="0"
        y="0"
        width="200"
        height="10"
        fill={darkMode ? "#1E2340" : "#F3F4F6"}
        stroke={stroke}
        strokeWidth="1.5"
      />

      {/* Inner highlight line */}
      <line
        x1="0"
        y1="3"
        x2="200"
        y2="3"
        stroke={stroke}
        strokeWidth="0.5"
        strokeOpacity={darkMode ? 0.35 : 0.4}
      />

      {/* Bottom shadow line */}
      <line
        x1="0"
        y1="7.5"
        x2="200"
        y2="7.5"
        stroke={stroke}
        strokeWidth="0.5"
        strokeOpacity={darkMode ? 0.15 : 0.25}
      />
    </svg>
  );
};

export default WallSection;