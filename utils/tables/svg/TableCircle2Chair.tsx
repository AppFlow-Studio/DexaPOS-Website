import React from "react";

interface TableCircle2ChairProps {
  darkMode?: boolean;
  color?: string;
  width?: number;
  height?: number;
}

const TableCircle2Chair: React.FC<TableCircle2ChairProps> = ({
  darkMode = false,
  color = "#2DD4BF",
  width = 130,
  height = 130,
  ...props
}) => {
  const strokeOpacity = darkMode ? 0.5 : 0.8;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Chair - top */}
      <rect
        x="36"
        y="4"
        width="28"
        height="12"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.8}
        stroke={color}
        strokeOpacity={strokeOpacity}
        strokeWidth="1"
      />

      {/* Chair - bottom */}
      <rect
        x="36"
        y="84"
        width="28"
        height="12"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.8}
        stroke={color}
        strokeOpacity={strokeOpacity}
        strokeWidth="1"
      />

      {/* Table surface */}
      <circle
        cx="50"
        cy="50"
        r="31"
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.85}
        stroke={color}
        strokeOpacity={strokeOpacity}
        strokeWidth="1.5"
      />
    </svg>
  );
};

export default TableCircle2Chair;