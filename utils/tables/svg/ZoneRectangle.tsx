import React from "react";

interface ZoneRectangleProps {
  color?: string;
  width?: number;
  height?: number;
}

const ZoneRectangle: React.FC<ZoneRectangleProps> = ({
  color = "#2DD4BF",
  width = 200,
  height = 200,
}) => {
  const defaultSize = 200;
  const scaleX = (width || defaultSize) / defaultSize;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <rect
        width="200"
        height="200"
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