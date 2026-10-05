import { useState } from "react";

export function initialOf(label) {
  const text = String(label || "").trim();
  return text ? text.charAt(0).toUpperCase() : "E";
}

export default function SafeImg({ src, alt, className, label, eager, width, height }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="brand-mark" role="img" aria-label={alt || "Image unavailable"}>
        {initialOf(label || alt)}
      </span>
    );
  }
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      width={width || 640}
      height={height || 420}
      loading={eager ? "eager" : "lazy"}
      onError={() => setFailed(true)}
    />
  );
}
