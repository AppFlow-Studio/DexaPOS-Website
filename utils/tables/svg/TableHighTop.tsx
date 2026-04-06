import React from "react";

interface TableHighTopProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const TableHighTop: React.FC<TableHighTopProps> = ({
  color = "#2DD4BF",
  width = 60,
  height = 60,
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 60 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Table top surface */}
      <circle
        cx="30"
        cy="30"
        r="27"
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.8"
      />

      {/* Overhang ring */}
      <circle
        cx="30"
        cy="30"
        r="21"
        fill="none"
        stroke={color}
        strokeWidth="0.75"
        strokeOpacity="0.25"
      />

      {/* Pedestal base */}
      <circle
        cx="30"
        cy="30"
        r="7"
        fill={color}
        fillOpacity="0.22"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
      />
    </svg>
  );
};

export default TableHighTop;