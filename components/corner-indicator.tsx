type CornerPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface CornerIndicatorProps {
  color: string;
  filled: boolean;
  position?: CornerPosition;
}

/**
 * L-shaped corner indicator SVG.
 * Renders a solid L-shape with correct orientation for each corner.
 */
export function CornerIndicator({ color, filled, position = "top-left" }: CornerIndicatorProps) {
  // Get the correct transform for each corner position
  const getTransform = () => {
    switch (position) {
      case "top-left":
        return ""; // No transform needed
      case "top-right":
        return "scale(-1, 1) translate(-24, 0)"; // Flip horizontally
      case "bottom-left":
        return "scale(1, -1) translate(0, -24)"; // Flip vertically
      case "bottom-right":
        return "scale(-1, -1) translate(-24, -24)"; // Flip both
      default:
        return "";
    }
  };

  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <g transform={getTransform()}>
        {/* Vertical arm of L */}
        <rect
          x="0"
          y="0"
          width="6"
          height="24"
          fill={color}
          opacity={filled ? 1 : 0.5}
        />
        {/* Horizontal arm of L */}
        <rect
          x="0"
          y="0"
          width="24"
          height="6"
          fill={color}
          opacity={filled ? 1 : 0.5}
        />
      </g>
    </svg>
  );
}
