import * as React from "react";

interface TableHighTopProps {
  color?: string;
  width?: number;
  height?: number;
}

const TableHighTop = ({
  color = "#F1F1F1",
  width = 60,
  height = 60,
  ...props
}: TableHighTopProps) => (
  <svg width={width} height={height} viewBox="0 0 60 60" fill="none" {...props}>
    {/* Table Top */}
    <circle cx="30" cy="30" r="28" fill={color} />
    {/* Base to distinguish it */}
    <rect
      x="25"
      y="25"
      width="10"
      height="10"
      rx="5"
      fill={color}
      opacity="0.6"
    />
  </svg>
);

export default TableHighTop;
