import React from "react";

interface TableRectangle4ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const TableRectangle4Chair: React.FC<TableRectangle4ChairProps> = ({
  color = "#2DD4BF",
  width = 140,
  height = 90,
  ...props
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 140 90"
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
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
      />
      <rect
        x="78"
        y="3"
        width="32"
        height="12"
        rx="3"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
      />

      {/* Chairs - bottom */}
      <rect
        x="30"
        y="75"
        width="32"
        height="12"
        rx="3"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
      />
      <rect
        x="78"
        y="75"
        width="32"
        height="12"
        rx="3"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
      />

      {/* Table */}
      <rect
        x="20"
        y="15"
        width="100"
        height="60"
        rx="8"
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.8"
      />
    </svg>
  );
};

export default TableRectangle4Chair;