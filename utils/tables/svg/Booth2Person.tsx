import React from "react";

interface Booth2PersonProps {
  darkMode?: boolean;
  color?: string;
  width?: number;
  height?: number;
}

const Booth2Person: React.FC<Booth2PersonProps> = ({
  darkMode = false,
  color = "#2DD4BF",
  width = 150,
  height = 100,
  ...props
}) => {
  const strokeOpacity = darkMode ? 0.5 : 0.8;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 180 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Table surface */}
      <rect
        x="6"
        y="16"
        width="168"
        height="48"
        rx="4"
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.8}
        stroke={color}
        strokeOpacity={strokeOpacity}
        strokeWidth="1.5"
      />

      {/* Booth top */}
      <rect
        x="6"
        y="0"
        width="168"
        height="13"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.8}
        stroke={color}
        strokeOpacity={strokeOpacity}
        strokeWidth="1"
      />

      {/* Booth bottom */}
      <rect
        x="6"
        y="67"
        width="168"
        height="13"
        rx="3"
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.8}
        stroke={color}
        strokeOpacity={strokeOpacity}
        strokeWidth="1"
      />
    </svg>
  );
};

export default Booth2Person;