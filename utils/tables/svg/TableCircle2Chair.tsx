import React from "react";

interface TableCircle2ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const TableCircle2Chair: React.FC<TableCircle2ChairProps> = ({
  color = "#2DD4BF",
  width = 80,
  height = 80,
  ...props
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Chair - top */}
      <rect
        x="26"
        y="3"
        width="28"
        height="12"
        rx="3"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
      />

      {/* Chair - bottom */}
      <rect
        x="26"
        y="65"
        width="28"
        height="12"
        rx="3"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
      />

      {/* Table */}
      <circle
        cx="40"
        cy="40"
        r="25"
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.8"
      />
    </svg>
  );
};

export default TableCircle2Chair;