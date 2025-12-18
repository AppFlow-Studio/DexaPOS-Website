import * as React from "react";

interface DecorativePlantProps {
  color?: string;
  width?: number;
  height?: number;
}

const DecorativePlant = ({
  color = "#9CA3AF",
  width = 50,
  height = 50,
  ...props
}: DecorativePlantProps) => (
  <svg width={width} height={height} viewBox="0 0 50 50" fill="none" {...props}>
    <circle cx="25" cy="25" r="22" fill={color} />
  </svg>
);

export default DecorativePlant;
