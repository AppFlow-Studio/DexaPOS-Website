import * as React from "react";

interface TableCircle2ChairProps {
  color?: string;
  width?: number;
  height?: number;
}

const TableCircle2Chair = ({
  color = "#F1F1F1",
  width = 80,
  height = 80,
  ...props
}: TableCircle2ChairProps) => (
  <svg width={width} height={height} viewBox="0 0 80 80" fill="none" {...props}>
    {/* Table */}
    <circle cx="40" cy="40" r="25" fill={color} />

    {/* Top Chair */}
    <path
      d="M28 4C28 1.79086 29.7909 0 32 0H48C50.2091 0 52 1.79086 52 4V8H28V4Z"
      fill={color}
    />

    {/* Bottom Chair */}
    <path
      d="M28 76C28 78.2091 29.7909 80 32 80H48C50.2091 80 52 78.2091 52 76V72H28V76Z"
      fill={color}
    />
  </svg>
);

export default TableCircle2Chair;
