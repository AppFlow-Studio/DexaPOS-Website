import * as React from "react";

interface PillarProps {
  color?: string;
  width?: number;
  height?: number;
}

const Pillar = ({
  color = "#9CA3AF",
  width = 40,
  height = 40,
  ...props
}: PillarProps) => (
  <svg width={width} height={height} viewBox="0 0 40 40" fill="none" {...props}>
    <rect width="40" height="40" rx="8" fill={color} />
  </svg>
);

export default Pillar;
