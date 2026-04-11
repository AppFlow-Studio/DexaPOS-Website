import React from "react";

interface TableSquare8ChairProps {
  darkMode?: boolean;
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const TableSquare8Chair: React.FC<TableSquare8ChairProps> = ({
  darkMode = false,
  color = "#2DD4BF",
  width = 208,
  height = 97,
  ...props
}) => {
  const strokeOpacity = darkMode ? 0.5 : 0.35;
  const fillOpacity = darkMode ? 0.12 : 0.08;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 208 97"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Chairs - top */}
      <rect
        x="28"
        y="1"
        width="40"
        height="12"
        rx="3"
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth="1"
        strokeOpacity={strokeOpacity}
      />
      <rect
        x="84"
        y="1"
        width="40"
        height="12"
        rx="3"
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth="1"
        strokeOpacity={strokeOpacity}
      />
      <rect
        x="140"
        y="1"
        width="40"
        height="12"
        rx="3"
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth="1"
        strokeOpacity={strokeOpacity}
      />

      {/* Chairs - bottom */}
      <rect
        x="28"
        y="84"
        width="40"
        height="12"
        rx="3"
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth="1"
        strokeOpacity={strokeOpacity}
      />
      <rect
        x="84"
        y="84"
        width="40"
        height="12"
        rx="3"
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth="1"
        strokeOpacity={strokeOpacity}
      />
      <rect
        x="140"
        y="84"
        width="40"
        height="12"
        rx="3"
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth="1"
        strokeOpacity={strokeOpacity}
      />

      {/* Side chairs */}
      <rect
        x="1"
        y="29"
        width="12"
        height="39"
        rx="3"
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth="1"
        strokeOpacity={strokeOpacity}
      />

      <rect
        x="195"
        y="29"
        width="12"
        height="39"
        rx="3"
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth="1"
        strokeOpacity={strokeOpacity}
      />

      {/* Table surface */}
      <rect
        x="13"
        y="13"
        width="182"
        height="71"
        rx="6"
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.1}
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity={darkMode ? 0.8 : 0.4}
      />
    </svg>
  );
};

export default TableSquare8Chair;