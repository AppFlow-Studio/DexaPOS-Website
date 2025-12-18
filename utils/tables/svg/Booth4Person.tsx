import * as React from "react";

interface Booth4PersonProps {
  color?: string;
  width?: number;
  height?: number;
}

const Booth4Person = ({
  color = "#F1F1F1",
  width = 120,
  height = 90,
  ...props
}: Booth4PersonProps) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 120 90"
    fill="none"
    {...props}
  >
    {/* Table */}
    <rect x="35" y="15" width="50" height="60" rx="6" fill={color} />
    {/* Left Booth Seat */}
    <rect x="0" y="10" width="25" height="70" rx="6" fill={color} />
    {/* Right Booth Seat */}
    <rect x="95" y="10" width="25" height="70" rx="6" fill={color} />
  </svg>
);

export default Booth4Person;
