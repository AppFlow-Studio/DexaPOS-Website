import React from "react";

interface TableSquare2ChairProps {
  darkMode?: boolean;
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const TableSquare2Chair: React.FC<TableSquare2ChairProps> = ({
  darkMode = false,
  color = "#2DD4BF",
  width = 79,
  height = 97,
}) => {
  const lightStroke = color;
  const chairStrokeOpacity = darkMode ? 0.5 : 0.5;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 79 97"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Chair - top */}
      <rect
        x="19"
        y="3"
        width="41"
        height="11"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.12}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1"
        strokeOpacity={chairStrokeOpacity}
      />

      {/* Table surface */}
      <rect
        x="4"
        y="14"
        width="71"
        height="69"
        rx="5"
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.18}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1.5"
        strokeOpacity={darkMode ? 0.8 : 0.8}
      />

      {/* Chair - bottom */}
      <rect
        x="19"
        y="83"
        width="41"
        height="11"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.12}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1"
        strokeOpacity={chairStrokeOpacity}
      />
    </svg>
  );
};

export default TableSquare2Chair;
