import * as React from "react";

interface ServerStationProps {
  color?: string;
  width?: number;
  height?: number;
}

const ServerStation = ({
  color = "#9CA3AF",
  width = 60,
  height = 40,
  ...props
}: ServerStationProps) => (
  <svg width={width} height={height} viewBox="0 0 60 40" fill="none" {...props}>
    <rect width="60" height="40" rx="6" fill={color} />
  </svg>
);

export default ServerStation;
