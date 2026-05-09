import React from "react";

interface TableHighTopProps {
  darkMode?: boolean;
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const TableHighTop: React.FC<TableHighTopProps> = ({
  darkMode = false,
  color = "#2DD4BF",
  width = 120,
  height = 120,
}) => {
  const lightStroke = color;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Table top surface */}
      <circle
        cx="40"
        cy="40"
        r="36"
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.18}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1.5"
        strokeOpacity={darkMode ? 0.8 : 0.8}
      />

      {/* Overhang ring */}
      <circle
        cx="40"
        cy="40"
        r="28"
        fill="none"
        stroke={darkMode ? color : lightStroke}
        strokeWidth="0.75"
        strokeOpacity={darkMode ? 0.25 : 0.25}
      />

      {/* Pedestal base */}
      <circle
        cx="40"
        cy="40"
        r="9"
        fill={color}
        fillOpacity={darkMode ? 0.22 : 0.22}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1"
        strokeOpacity={darkMode ? 0.5 : 0.5}
      />
    </svg>
  );
};

export default TableHighTop;
