import * as React from "react";

interface Booth2PersonProps {
  color?: string;
  width?: number;
  height?: number;
}

const Booth2Person = ({
  color = "#F1F1F1",
  width = 70,
  height = 90,
  ...props
}: Booth2PersonProps) => (
  <svg width={width} height={height} viewBox="0 0 70 90" fill="none" {...props}>
    {/* Table */}
    <rect x="25" y="15" width="20" height="60" rx="4" fill={color} />
    {/* Left Booth Seat */}
    <rect x="0" y="10" width="15" height="70" rx="6" fill={color} />
    {/* Right Booth Seat */}
    <rect x="55" y="10" width="15" height="70" rx="6" fill={color} />
  </svg>
);

export default Booth2Person;
