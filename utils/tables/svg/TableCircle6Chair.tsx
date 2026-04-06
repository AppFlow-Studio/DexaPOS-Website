import React from "react";

interface TableCircle6ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const ANGLES = [0, 60, 120, 180, 240, 300];
const CENTER = 60;
const CHAIR_ORBIT = 38;
const CHAIR_W = 16;
const CHAIR_H = 12;

const TableCircle6Chair: React.FC<TableCircle6ChairProps> = ({
  color = "#2DD4BF",
  width = 120,
  height = 120,
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Chairs */}
      {ANGLES.map((angleDeg) => {
        const rad = (angleDeg * Math.PI) / 180;
        const cx = CENTER + CHAIR_ORBIT * Math.sin(rad);
        const cy = CENTER - CHAIR_ORBIT * Math.cos(rad);

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
              fillOpacity="0.12"
              stroke={color}
              strokeWidth="1"
              strokeOpacity="0.5"
            />
          </g>
        );
      })}

      {/* Table */}
      <circle
        cx="60"
        cy="60"
        r="32"
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.8"
      />
    </svg>
  );
};

export default TableCircle6Chair;