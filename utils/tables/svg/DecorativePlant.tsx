import React from "react";

interface DecorativePlantProps {
  color?: string;
  width?: number;
  height?: number;
}

const DecorativePlant: React.FC<DecorativePlantProps> = ({
  color = "#34D399",
  width = 50,
  height = 50,
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 50 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Pot shadow */}
      <ellipse cx="25" cy="57" rx="9" ry="2" fill="#000000" fillOpacity="0.18" />

      {/* Pot body */}
      <path
        d="M16 38 L34 38 L31 52 L19 52 Z"
        fill="#1A1F35"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
        strokeLinejoin="round"
      />

      {/* Pot highlight stripe */}
      <path
        d="M19 41 L31 41"
        stroke={color}
        strokeWidth="0.75"
        strokeOpacity="0.2"
        strokeLinecap="round"
      />

      {/* Pot rim */}
      <path
        d="M14 36 L36 36 L34 40 L16 40 Z"
        fill={color}
        fillOpacity="0.15"
        stroke={color}
        strokeWidth="0.9"
        strokeOpacity="0.6"
        strokeLinejoin="round"
      />

      {/* Stem */}
      <line
        x1="25"
        y1="36"
        x2="25"
        y2="28"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.5"
        strokeLinecap="round"
      />

      {/* Leaves */}
      <path
        d="M25 31 Q18 26 14 20 Q20 22 25 31Z"
        fill={color}
        fillOpacity="0.55"
        stroke={color}
        strokeWidth="0.5"
        strokeOpacity="0.4"
      />
      <path
        d="M25 29 Q32 24 36 18 Q30 21 25 29Z"
        fill={color}
        fillOpacity="0.55"
        stroke={color}
        strokeWidth="0.5"
        strokeOpacity="0.4"
      />

      {/* Back foliage */}
      <circle
        cx="25"
        cy="17"
        r="11"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="0.75"
        strokeOpacity="0.3"
      />

      {/* Main foliage */}
      <circle
        cx="19"
        cy="21"
        r="8"
        fill={color}
        fillOpacity="0.45"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.7"
      />
      <circle
        cx="31"
        cy="21"
        r="8"
        fill={color}
        fillOpacity="0.45"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.7"
      />
      <circle
        cx="25"
        cy="14"
        r="9"
        fill={color}
        fillOpacity="0.5"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.8"
      />
      <circle
        cx="25"
        cy="23"
        r="7"
        fill={color}
        fillOpacity="0.4"
        stroke={color}
        strokeWidth="0.75"
        strokeOpacity="0.5"
      />

      {/* Top highlight */}
      <circle cx="22" cy="10" r="3.5" fill={color} fillOpacity="0.35" />
      <circle cx="22" cy="10" r="1.5" fill="#ffffff" fillOpacity="0.18" />
    </svg>
  );
};

export default DecorativePlant;