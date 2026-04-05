import React from "react";

interface TableSquare4ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const TableSquare4Chair: React.FC<TableSquare4ChairProps> = ({
  color = "#2DD4BF",
  width = 97,
  height = 97,
  ...props
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 97 97"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Chair - top */}
      <rect
        x="29"
        y="1"
        width="39"
        height="11"
        rx="3"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
      />

      {/* Chair - bottom */}
      <rect
        x="29"
        y="85"
        width="39"
        height="11"
        rx="3"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
      />

      {/* Chair - left */}
      <rect
        x="1"
        y="29"
        width="11"
        height="39"
        rx="3"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
      />

      {/* Chair - right */}
      <rect
        x="85"
        y="29"
        width="11"
        height="39"
        rx="3"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
      />

      {/* Table surface */}
      <rect
        x="12"
        y="12"
        width="73"
        height="73"
        rx="6"
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.8"
      />
    </svg>
  );
};

export default TableSquare4Chair;