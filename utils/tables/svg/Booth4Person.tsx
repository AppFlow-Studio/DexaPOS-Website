import React from "react";

interface Booth4PersonProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const Booth4Person: React.FC<Booth4PersonProps> = ({
  color = "#2DD4BF",
  width = 120,
  height = 90,
  ...props
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Table surface */}
      <rect
        x="35"
        y="15"
        width="50"
        height="60"
        rx="6"
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.8"
      />

      {/* Booth sides */}
      <rect
        x="0"
        y="10"
        width="25"
        height="70"
        rx="6"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
      />
      <rect
        x="95"
        y="10"
        width="25"
        height="70"
        rx="6"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
      />
    </svg>
  );
};

export default Booth4Person;