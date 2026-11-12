// Minimal trend line. Gaps (null) are skipped; the latest point gets a dot.
export function Sparkline({
  values,
  min,
  max,
  width = 112,
  height = 34,
  className = "text-accent-fg",
}: {
  values: (number | null)[];
  min?: number;
  max?: number;
  width?: number;
  height?: number;
  className?: string;
}) {
  const known = values.filter((v): v is number => v !== null);
  if (known.length < 2) return null;
  // Auto-scale with a minimum span so small changes read as small, not dramatic.
  const minSpan = 3;
  let lo = min ?? Math.min(...known);
  let hi = max ?? Math.max(...known);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const span = hi - lo;
  const pad = 3;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const points = values
    .map((v, i) =>
      v === null
        ? null
        : [pad + i * step, pad + (height - pad * 2) * (1 - (v - lo) / span)].map(
            (n) => Math.round(n * 10) / 10,
          ),
    )
    .filter((p): p is number[] => p !== null);
  const last = points[points.length - 1];
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`shrink-0 ${className}`}
    >
      <polyline
        points={points.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="3" fill="currentColor" />
    </svg>
  );
}
