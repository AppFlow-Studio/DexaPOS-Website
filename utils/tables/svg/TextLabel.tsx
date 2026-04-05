import React from "react";

interface TextLabelProps {
  color?: string;
  width?: number;
  height?: number;
}

const TextLabel: React.FC<TextLabelProps> = ({
  color = "#94A3B8",
  width = 100,
  height = 50,
}) => {
  const defaultHeight = 50;
  const scaleY = (height || defaultHeight) / defaultHeight;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 50"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="50"
        y="25"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={24 * scaleY}
        fontWeight="bold"
        fill={color}
        fillOpacity="0.7"
      >
        Aa
      </text>
    </svg>
  );
};

export default TextLabel;