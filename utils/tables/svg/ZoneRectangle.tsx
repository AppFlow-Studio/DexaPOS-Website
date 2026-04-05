import React from "react";

interface ZoneRectangleProps {
  color?: string;
  width?: number;
  height?: number;
}

const ZoneRectangle: React.FC<ZoneRectangleProps> = ({
  color = "#2DD4BF",
  width = 100,
  height = 100,
}) => {
  const defaultSize = 100;
  const scaleX = (width || defaultSize) / defaultSize;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <rect
        width="100"
        height="100"
        fill={color}
        fillOpacity="0.07"
        stroke={color}
        strokeWidth={1.5 * scaleX}
        strokeDasharray="6,4"
        strokeOpacity="0.6"
      />
    </svg>
  );
};

export default ZoneRectangle;