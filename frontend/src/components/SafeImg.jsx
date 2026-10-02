import { useState } from "react";

export function initialOf(label) {
  const text = String(label || "").trim();
  return text ? text.charAt(0).toUpperCase() : "E";
}

export default function SafeImg({ src, alt, className, label, eager }) {
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
      loading={eager ? "eager" : "lazy"}
      onError={() => setFailed(true)}
    />
  );
}
