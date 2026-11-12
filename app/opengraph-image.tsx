import { ImageResponse } from "next/og";

export const alt = "AXVital: track what matters, discover what works";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Shared preview card for every route that does not define its own image.
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: "linear-gradient(135deg, #020617 0%, #0f172a 55%, #1e3a8a 100%)", color: "white", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800 }}>AX</div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>AXVital</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>Your health. Your data.</div>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, color: "#60a5fa" }}>Your answers.</div>
        </div>
        <div style={{ fontSize: 30, color: "#cbd5e1" }}>Track what matters, learn from your history, and test what works.</div>
      </div>
    ),
    size,
  );
}
