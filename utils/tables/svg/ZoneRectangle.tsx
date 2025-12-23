import React from "react";

const ZoneRectangle = ({ color = "#888", width = 100, height = 100 }) => (
  <svg width={width} height={height} viewBox="0 0 100 100">
    <rect
      width="100"
      height="100"
      fill={color}
      fillOpacity="0.2"
      stroke={color}
      strokeWidth="2"
      strokeDasharray="5,5"
    />
  </svg>
);

export default ZoneRectangle;
