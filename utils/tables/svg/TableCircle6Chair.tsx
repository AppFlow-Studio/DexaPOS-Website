import React from "react";

interface TableCircle6ChairProps {
  darkMode?: boolean;
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const ANGLES = [0, 60, 120, 180, 240, 300];
const CHAIR_ORBIT = 38;
const CHAIR_W = 16;
const CHAIR_H = 12;

const TableCircle6Chair: React.FC<TableCircle6ChairProps> = ({
  darkMode = false,
  color = "#2DD4BF",
  width = 150,
  height = 150,
}) => {
  const lightStroke = color;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 150 150"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {ANGLES.map((angleDeg) => {
        const rad = (angleDeg * Math.PI) / 180;
        const cx = 75 + CHAIR_ORBIT * 1.25 * Math.sin(rad);
        const cy = 75 - CHAIR_ORBIT * 1.25 * Math.cos(rad);

        return (
          <g
            key={angleDeg}
            transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}
          >
            <rect
              x={-CHAIR_W / 2}
              y={-CHAIR_H / 2}
              width={CHAIR_W}
              height={CHAIR_H}
              rx="3"
              fill={color}
              fillOpacity={darkMode ? 0.12 : 0.12}
              stroke={darkMode ? color : lightStroke}
              strokeWidth="1"
              strokeOpacity={darkMode ? 0.5 : 0.5}
            />
          </g>
        );
      })}

      {/* Table surface */}
      <circle
        cx="75"
        cy="75"
        r="41"
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.18}
        stroke={darkMode ? color : lightStroke}
        strokeWidth="1.5"
        strokeOpacity={darkMode ? 0.8 : 0.8}
      />
    </svg>
  );
};

export default TableCircle6Chair;
