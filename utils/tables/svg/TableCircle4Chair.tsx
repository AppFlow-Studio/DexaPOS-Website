import React from "react";

interface TableCircle4ChairProps {
  darkMode?: boolean;
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const TableCircle4Chair: React.FC<TableCircle4ChairProps> = ({
  darkMode = false,
  color = "#2DD4BF",
  width = 130,
  height = 130,
  ...props
}) => {
  const lightStroke = color;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 90 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Chair - top */}
      <rect
        x="31"
        y="3"
        width="28"
        height="14"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.12}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1"
        strokeOpacity={darkMode ? 0.5 : 0.5}
      />

      {/* Chair - bottom */}
      <rect
        x="31"
        y="73"
        width="28"
        height="14"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.12}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1"
        strokeOpacity={darkMode ? 0.5 : 0.5}
      />

      {/* Chair - left */}
      <rect
        x="3"
        y="31"
        width="14"
        height="28"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.12}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1"
        strokeOpacity={darkMode ? 0.5 : 0.5}
      />

      {/* Chair - right */}
      <rect
        x="73"
        y="31"
        width="14"
        height="28"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.12}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1"
        strokeOpacity={darkMode ? 0.5 : 0.5}
      />

      {/* Table surface */}
      <circle
        cx="45"
        cy="45"
        r="28"
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.18}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1.5"
        strokeOpacity={darkMode ? 0.8 : 0.8}
      />
    </svg>
  );
};

export default TableCircle4Chair;
