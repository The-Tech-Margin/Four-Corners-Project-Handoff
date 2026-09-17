"use client";

interface SpectralLoaderProps {
  size?: "sm" | "md" | "lg";
  text?: string;
}

export function SpectralLoader({ size = "md", text }: SpectralLoaderProps) {
  const sizeClasses = {
    sm: "w-12 h-12",
    md: "w-16 h-16",
    lg: "w-24 h-24",
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="relative">
        {/* Outer rotating ring */}
        <div
          className={`${sizeClasses[size]} rounded-full animate-spin`}
          style={{
            background:
              "conic-gradient(from 0deg, #f59e0b, #a855f7, #3b82f6, #fb923c, #f59e0b)",
            animationDuration: "2s",
          }}
        />

        {/* Inner circle */}
        <div className="absolute inset-1 rounded-full bg-bg" />

        {/* Center pulse */}
        <div className="absolute inset-3 rounded-full bg-gradient-to-br from-accent/40 to-accent/10 animate-pulse" />
      </div>

      {text && <p className="text-sm text-gray-400 animate-pulse">{text}</p>}
    </div>
  );
}
