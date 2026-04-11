import React from "react";

interface DecorativePlantProps {
  darkMode?: boolean;
  width?: number;
  height?: number;
}

const DecorativePlant: React.FC<DecorativePlantProps> = ({
  darkMode = false,
  width = 50,
  height = 60,
}) => {
  // Theme-aware colors
  const leafPrimary = darkMode ? "#4ADE80" : "#22C55E";
  const leafSecondary = darkMode ? "#22C55E" : "#16A34A";
  const leafHighlight = darkMode ? "#86EFAC" : "#4ADE80";
  const stem = darkMode ? "#22C55E" : "#15803D";
  const potBody = darkMode ? "#334155" : "#D4A574";
  const potRim = darkMode ? "#475569" : "#C4956A";
  const potShadow = darkMode ? "#1E293B" : "#A67C52";
  const soil = darkMode ? "#292524" : "#78350F";
  const shadowOpacity = darkMode ? 0.25 : 0.12;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 50 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Shadow beneath pot */}
      <ellipse
        cx="25"
        cy="57"
        rx="12"
        ry="2.5"
        fill={darkMode ? "#0F172A" : "#000"}
        opacity={shadowOpacity}
      />

      {/* Pot body */}
      <path
        d="M14 42 L36 42 L33 55 Q25 56 17 55 Z"
        fill={potBody}
      />
      
      {/* Pot shading */}
      <path
        d="M14 42 L17 55 Q25 56 25 55 L25 42 Z"
        fill={potShadow}
        opacity={0.3}
      />

      {/* Pot rim */}
      <rect
        x="12"
        y="38"
        width="26"
        height="5"
        rx="1"
        fill={potRim}
      />
      
      {/* Pot rim highlight */}
      <rect
        x="12"
        y="38"
        width="26"
        height="2"
        rx="1"
        fill={darkMode ? "#64748B" : "#E8C4A0"}
        opacity={0.5}
      />

      {/* Soil */}
      <ellipse
        cx="25"
        cy="42"
        rx="11"
        ry="3"
        fill={soil}
      />

      {/* Main stem */}
      <path
        d="M25 40 C25 35, 25 28, 25 22"
        stroke={stem}
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Left stem branch */}
      <path
        d="M25 32 C22 30, 18 28, 14 26"
        stroke={stem}
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Right stem branch */}
      <path
        d="M25 30 C28 28, 32 26, 36 24"
        stroke={stem}
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Lower left branch */}
      <path
        d="M25 36 C21 35, 17 34, 13 33"
        stroke={stem}
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* Lower right branch */}
      <path
        d="M25 35 C29 34, 33 33, 37 32"
        stroke={stem}
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* Top center leaf */}
      <ellipse
        cx="25"
        cy="16"
        rx="4"
        ry="7"
        fill={leafPrimary}
        transform="rotate(-5 25 16)"
      />
      <ellipse
        cx="24"
        cy="16"
        rx="2"
        ry="5"
        fill={leafHighlight}
        opacity={0.4}
        transform="rotate(-5 24 16)"
      />

      {/* Top left leaf */}
      <ellipse
        cx="14"
        cy="22"
        rx="3.5"
        ry="6"
        fill={leafPrimary}
        transform="rotate(-35 14 22)"
      />
      <ellipse
        cx="13"
        cy="22"
        rx="1.5"
        ry="4"
        fill={leafHighlight}
        opacity={0.4}
        transform="rotate(-35 13 22)"
      />

      {/* Top right leaf */}
      <ellipse
        cx="36"
        cy="20"
        rx="3.5"
        ry="6"
        fill={leafSecondary}
        transform="rotate(35 36 20)"
      />
      <ellipse
        cx="37"
        cy="20"
        rx="1.5"
        ry="4"
        fill={leafHighlight}
        opacity={0.3}
        transform="rotate(35 37 20)"
      />

      {/* Middle left leaf */}
      <ellipse
        cx="11"
        cy="31"
        rx="3"
        ry="5"
        fill={leafSecondary}
        transform="rotate(-45 11 31)"
      />

      {/* Middle right leaf */}
      <ellipse
        cx="39"
        cy="30"
        rx="3"
        ry="5"
        fill={leafPrimary}
        transform="rotate(45 39 30)"
      />

      {/* Small accent leaves */}
      <ellipse
        cx="20"
        cy="18"
        rx="2.5"
        ry="4.5"
        fill={leafSecondary}
        transform="rotate(-20 20 18)"
      />
      <ellipse
        cx="30"
        cy="17"
        rx="2.5"
        ry="4.5"
        fill={leafHighlight}
        opacity={0.7}
        transform="rotate(20 30 17)"
      />

      {/* Tiny detail leaves */}
      <ellipse
        cx="17"
        cy="26"
        rx="2"
        ry="3.5"
        fill={leafPrimary}
        opacity={0.8}
        transform="rotate(-25 17 26)"
      />
      <ellipse
        cx="33"
        cy="25"
        rx="2"
        ry="3.5"
        fill={leafSecondary}
        opacity={0.8}
        transform="rotate(25 33 25)"
      />
    </svg>
  );
};

export default DecorativePlant;
