import React from "react";

interface Booth4PersonProps {
  darkMode?: boolean;
  color?: string;
  width?: number;
  height?: number;
}

const Booth4Person: React.FC<Booth4PersonProps> = ({
  darkMode = false,
  color = "#2DD4BF",
  width = 200,
  height = 100,
  ...props
}) => {
  const strokeOpacity = darkMode ? 0.5 : 0.8;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Table surface */}
      <rect
        x="6"
        y="24"
        width="188"
        height="52"
        rx="6"
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
        width="188"
        height="16"
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
        y="84"
        width="188"
        height="16"
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

export default Booth4Person;