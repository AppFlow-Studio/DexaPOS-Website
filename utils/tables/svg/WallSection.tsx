import * as React from "react";

interface WallSectionProps {
  color?: string;
  width?: number;
  height?: number;
}

const WallSection = ({
  color = "#9CA3AF",
  width = 200,
  height = 10,
  ...props
}: WallSectionProps) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 200 10"
    fill="none"
    {...props}
  >
    <rect width="200" height="10" rx="5" fill={color} />
  </svg>
);

export default WallSection;
