import * as React from "react";

interface HostStandProps {
  color?: string;
  width?: number;
  height?: number;
}

const HostStand = ({
  color = "#9CA3AF",
  width = 40,
  height = 35,
  ...props
}: HostStandProps) => (
  <svg width={width} height={height} viewBox="0 0 40 35" fill="none" {...props}>
    <rect width="40" height="35" rx="6" fill={color} />
  </svg>
);

export default HostStand;
