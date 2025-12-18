import * as React from "react";

interface BarSectionProps {
  color?: string;
  width?: number;
  height?: number;
}

const BarSection = ({
  color = "#9CA3AF",
  width = 170,
  height = 100,
  ...props
}: BarSectionProps) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 170 100"
    fill="none"
    {...props}
  >
    {/* The rectangle is inset to create a padded effect */}
    <rect x="10" y="30" width="150" height="40" rx="6" fill={color} />
  </svg>
);

export default BarSection;
