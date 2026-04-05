import React from "react";

interface ServerStationProps {
  color?: string;
  width?: number;
  height?: number;
}

const ServerStation: React.FC<ServerStationProps> = ({
  color = "#94A3B8",
  width = 60,
  height = 40,
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 60 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Station body */}
      <rect
        x="0.75"
        y="0.75"
        width="58.5"
        height="38.5"
        rx="4"
        fill="#1E2340"
        stroke={color}
        strokeWidth="1.5"
      />

      {/* Top shelf */}
      <rect
        x="6"
        y="5"
        width="36"
        height="13"
        rx="2"
        fill={color}
        fillOpacity="0.08"
        stroke={color}
        strokeWidth="0.75"
        strokeOpacity="0.5"
      />

      {/* Bottom shelf */}
      <rect
        x="6"
        y="22"
        width="36"
        height="13"
        rx="2"
        fill={color}
        fillOpacity="0.08"
        stroke={color}
        strokeWidth="0.75"
        strokeOpacity="0.5"
      />

      {/* Divider */}
      <line
        x1="6"
        y1="20"
        x2="42"
        y2="20"
        stroke={color}
        strokeWidth="0.5"
        strokeOpacity="0.3"
      />

      {/* POS / printer */}
      <rect
        x="46"
        y="6"
        width="9"
        height="28"
        rx="2"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="0.75"
      />

      {/* Paper slot */}
      <rect
        x="48"
        y="18"
        width="5"
        height="2"
        rx="1"
        fill={color}
        fillOpacity="0.3"
      />
    </svg>
  );
};

export default ServerStation;