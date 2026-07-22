import React from "react";

const sizeMap = {
  xs: 20,
  sm: 40,
  md: 60,
  lg: 80,
  xl: 100,
};

interface SpinnerProps {
  size?: keyof typeof sizeMap | number;
  strokeWidth?: number;
  color?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ size = "md", strokeWidth = 6, color = "#3182ce" }) => {
  const finalSize = typeof size === "number" ? size : sizeMap[size];

  const center = finalSize / 2;
  const radius = (finalSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div style={{ width: finalSize, height: finalSize }}>
      <svg width={finalSize} height={finalSize} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke="#e2e8f0"
          strokeWidth={1}
          fill="transparent"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.75}
          strokeLinecap="round"
          fill="transparent"
          style={{
            animation: "spinner-rotate 1.5s linear infinite",
            transformOrigin: "center",
          }}
        />
      </svg>
      <style>{`
        @keyframes spinner-rotate {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Spinner;
