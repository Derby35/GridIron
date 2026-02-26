import logoSvg from "../assets/gridiron-intel-logo.svg";

/**
 * Grid Iron Intel logo — renders the SVG asset with a text fallback.
 *
 * Props:
 *   size   — pixel dimension (square)  default 40
 *   text   — show "Grid Iron Intel" wordmark beside logo  default false
 *   onClick — click handler
 */
export default function Logo({ size = 40, text = false, onClick }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
      }}
      onClick={onClick}
    >
      <img
        src={logoSvg}
        alt="Grid Iron Intel"
        width={size}
        height={size}
        style={{ flexShrink: 0, display: "block" }}
        onError={e => {
          // SVG failed — show "GII" text badge fallback
          e.target.style.display = "none";
          if (e.target.nextSibling) e.target.nextSibling.style.display = "flex";
        }}
      />
      {/* Text fallback badge (hidden by default, shown if SVG fails) */}
      <div
        aria-hidden="true"
        style={{
          display: "none",
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.22),
          background: "linear-gradient(135deg,var(--em),var(--gd))",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: Math.round(size * 0.38),
          color: "#000",
          letterSpacing: 1,
          flexShrink: 0,
        }}
      >
        GII
      </div>

      {text && (
        <span
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: Math.round(size * 0.5),
            letterSpacing: 2,
            lineHeight: 1,
            color: "var(--tx)",
            whiteSpace: "nowrap",
          }}
        >
          GRID IRON{" "}
          <span style={{ color: "var(--em)" }}>INTEL</span>
        </span>
      )}
    </div>
  );
}
