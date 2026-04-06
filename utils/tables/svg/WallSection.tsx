import React from "react";

interface WallSectionProps {
  color?: string;
  width?: number;
  height?: number;
}

const WallSection: React.FC<WallSectionProps> = ({
  color = "#94A3B8",
  width = 200,
  height = 10,
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      {/* Wall body */}
      <rect
        x="0"
        y="0"
        width="200"
        height="10"
        fill="#1E2340"
        stroke={color}
        strokeWidth="1.5"
      />

      {/* Inner highlight line */}
      <line
        x1="0"
        y1="3"
        x2="200"
        y2="3"
        stroke={color}
        strokeWidth="0.5"
        strokeOpacity="0.35"
      />

      {/* Bottom shadow line */}
      <line
        x1="0"
        y1="7.5"
        x2="200"
        y2="7.5"
        stroke={color}
        strokeWidth="0.5"
        strokeOpacity="0.15"
      />
    </svg>
  );
};

export default WallSection;