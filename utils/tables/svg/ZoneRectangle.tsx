import React from "react";

interface ZoneRectangleProps {
  darkMode?: boolean;
  color?: string;
  width?: number;
  height?: number;
}

const ZoneRectangle: React.FC<ZoneRectangleProps> = ({
  darkMode = false,
  color = "#2DD4BF",
  width = 200,
  height = 200,
}) => {
  const lightStroke = "#111827";

  const stroke = darkMode ? color : lightStroke;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <rect
        width="200"
        height="200"
        fill={color}
        fillOpacity={darkMode ? 0.07 : 0.12}
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray="6,4"
        strokeOpacity={darkMode ? 0.6 : 0.9}
      />
    </svg>
  );
};

export default ZoneRectangle;