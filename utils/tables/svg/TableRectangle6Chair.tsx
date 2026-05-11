import React from "react";

interface TableRectangle6ChairProps {
  darkMode?: boolean;
  color?: string;
  width?: number;
  height?: number;
}

const TableRectangle6Chair: React.FC<TableRectangle6ChairProps> = ({
  darkMode = false,
  color = "#2DD4BF",
  width = 180,
  height = 90,
  ...props
}) => {
  const lightStroke = color;
  const chairStrokeOpacity = darkMode ? 0.5 : 0.5;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 180 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Chairs - top */}
      <rect
        x="30"
        y="3"
        width="32"
        height="12"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.12}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1"
        strokeOpacity={chairStrokeOpacity}
      />
      <rect
        x="74"
        y="3"
        width="32"
        height="12"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.12}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1"
        strokeOpacity={chairStrokeOpacity}
      />
      <rect
        x="118"
        y="3"
        width="32"
        height="12"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.12}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1"
        strokeOpacity={chairStrokeOpacity}
      />

      {/* Chairs - bottom */}
      <rect
        x="30"
        y="75"
        width="32"
        height="12"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.12}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1"
        strokeOpacity={chairStrokeOpacity}
      />
      <rect
        x="74"
        y="75"
        width="32"
        height="12"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.12}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1"
        strokeOpacity={chairStrokeOpacity}
      />
      <rect
        x="118"
        y="75"
        width="32"
        height="12"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.12}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1"
        strokeOpacity={chairStrokeOpacity}
      />

      {/* Table surface */}
      <rect
        x="20"
        y="15"
        width="140"
        height="60"
        rx="8"
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.18}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1.5"
        strokeOpacity={darkMode ? 0.8 : 0.8}
      />
    </svg>
  );
};

export default TableRectangle6Chair;
