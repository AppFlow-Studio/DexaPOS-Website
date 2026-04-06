import React from "react";

interface Booth2PersonProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const Booth2Person: React.FC<Booth2PersonProps> = ({
  color = "#2DD4BF",
  width = 150,
  height = 100,
  ...props
}) => {
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
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.8"
      />

      {/* Booth top */}
      <rect
        x="6"
        y="0"
        width="168"
        height="13"
        rx="3"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
      />

      {/* Booth bottom */}
      <rect
        x="6"
        y="67"
        width="168"
        height="13"
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

export default Booth2Person;