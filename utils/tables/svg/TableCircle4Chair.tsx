import * as React from "react";

interface TableCircle4ChairProps {
  color?: string;
  width?: number;
  height?: number;
}

const TableCircle4Chair = ({
  color = "#F1F1F1",
  width = 90,
  height = 90,
  ...props
}: TableCircle4ChairProps) => (
  <svg width={width} height={height} viewBox="0 0 90 90" fill="none" {...props}>
    {/* Table */}
    <circle cx="45" cy="45" r="28" fill={color} />

    {/* Top Chair */}
    <path
      d="M35 4C35 1.79086 36.7909 0 39 0H51C53.2091 0 55 1.79086 55 4V8H35V4Z"
      fill={color}
    />

    {/* Bottom Chair */}
    <path
      d="M35 86C35 88.2091 36.7909 90 39 90H51C53.2091 90 55 88.2091 55 86V82H35V86Z"
      fill={color}
    />

    {/* Left Chair */}
    <path
      d="M4 35C1.79086 35 0 36.7909 0 39V51C0 53.2091 1.79086 55 4 55H8V35H4Z"
      fill={color}
    />

    {/* Right Chair */}
    <path
      d="M86 35C88.2091 35 90 36.7909 90 39V51C90 53.2091 88.2091 55 86 55H82V35H86Z"
      fill={color}
    />
  </svg>
);

export default TableCircle4Chair;
