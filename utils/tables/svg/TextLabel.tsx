import React from "react";

const TextLabel = ({ color = "#888", width = 100, height = 50 }) => (
  <svg width={width} height={height} viewBox="0 0 100 50">
    <text
      x="50"
      y="25"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize="24"
      fontWeight="bold"
      fill={color}
    >
      Aa
    </text>
  </svg>
);

export default TextLabel;
