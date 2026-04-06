import React from "react";

interface TableSquare2ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const TableSquare2Chair: React.FC<TableSquare2ChairProps> = ({
  color = "#2DD4BF",
  width = 79,
  height = 97,
}) => {
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
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
      />

      {/* Table surface */}
      <rect
        x="4"
        y="14"
        width="71"
        height="69"
        rx="5"
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.8"
      />

      {/* Chair - bottom */}
      <rect
        x="19"
        y="83"
        width="41"
        height="11"
        rx="3"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
      />
    </svg>
  );
};

export default TableSquare2Chair;