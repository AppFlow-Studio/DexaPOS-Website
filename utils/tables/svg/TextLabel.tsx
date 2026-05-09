import React from "react";

interface TextLabelProps {
  darkMode?: boolean;
  color?: string;
  width?: number;
  height?: number;
  text?: string;
}

const TextLabel: React.FC<TextLabelProps> = ({
  darkMode = false,
  color = "#94A3B8",
  width = 100,
  height = 50,
  text = "Aa",
}) => {
  const baseHeight = 50;
  const scaleY = height / baseHeight;
  const lightTextColor = "#111827";

  const lightOpacity = 0.9;
  const darkOpacity = 0.7;

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
        fill={darkMode ? color : lightTextColor}
        fillOpacity={darkMode ? darkOpacity : lightOpacity}
      >
        {text}
      </text>
    </svg>
  );
};

export default TextLabel;
