// ─────────────────────────────────────────────────────────────────────────────
//  Shared UI primitives — imported by any page / component that needs them
// ─────────────────────────────────────────────────────────────────────────────

const IMG = "https://a.espncdn.com/i/teamlogos/nfl/500";
const HEAD = id =>
  `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${id}.png&w=350&h=254`;

// ── Position colour map ───────────────────────────────────────────────────────
export const posColor = p =>
  p === "QB" ? "var(--em)"
  : p === "RB" ? "var(--lm)"
  : p === "WR" ? "var(--sk)"
  : "var(--vi)";

// ── Team logo <img> ───────────────────────────────────────────────────────────
export const TeamLogo = ({ ab, sz = 40, onClick }) => (
  <img
    src={`${IMG}/${ab?.toLowerCase()}.png`}
    alt={ab}
    width={sz}
    height={sz}
    className="team-logo"
    style={{ cursor: onClick ? "pointer" : "default" }}
    onClick={onClick}
    onError={e => { e.target.style.opacity = ".3"; }}
  />
);

// ── Player headshot <img> ─────────────────────────────────────────────────────
export const Headshot = ({ src, sz = 52 }) => (
  <img
    src={src}
    alt=""
    width={sz}
    height={sz}
    className="headshot"
    onError={e => {
      e.target.style.background = "linear-gradient(135deg,#1a1a2e,#16213e)";
      e.target.src = "";
    }}
  />
);

// ── Pill badge ────────────────────────────────────────────────────────────────
export const Pil = ({ ch, c = "var(--em)", s = {} }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "4px 11px",
      borderRadius: 999,
      background: `${c}15`,
      border: `1px solid ${c}33`,
      color: c,
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 0.5,
      ...s,
    }}
  >
    {ch}
  </span>
);

// ── Stat card ─────────────────────────────────────────────────────────────────
export const StCard = ({ l, v, c = "var(--em)" }) => (
  <div className="stat-card" style={{ "--accent": c }}>
    <div className="stat-card-label">{l}</div>
    <div className="stat-card-value" style={{ color: c }}>{v ?? "—"}</div>
  </div>
);

// ── Mini bar (floor/proj/ceiling range) ───────────────────────────────────────
export const MiniBar = ({ floor, projection, ceiling }) => {
  const pct = v => `${Math.round(v * 10)}%`;
  return (
    <div style={{ minWidth: 80 }}>
      <div className="range-bar-wrap">
        <div
          className="range-bar-fill"
          style={{
            left: pct(floor),
            width: `${Math.round((ceiling - floor) * 10)}%`,
          }}
        />
        <div
          className="range-bar-tick"
          style={{ left: pct(projection) }}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 3,
          fontSize: 10,
          color: "var(--dm)",
          fontFamily: "'Barlow Condensed', sans-serif",
        }}
      >
        <span style={{ color: "var(--rs)" }}>{floor}</span>
        <span style={{ color: "var(--em)", fontWeight: 700 }}>{projection}</span>
        <span style={{ color: "var(--lm)" }}>{ceiling}</span>
      </div>
    </div>
  );
};

// ── Recharts tooltip ──────────────────────────────────────────────────────────
export const ChartTT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "rgba(4,6,12,.95)",
        border: "1px solid var(--bd)",
        borderRadius: 10,
        padding: "8px 12px",
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 700, color: "var(--em)", marginBottom: 3 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: p.color || p.stroke,
            }}
          />
          <span style={{ color: "var(--dm)" }}>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>
            {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── Loading spinner ───────────────────────────────────────────────────────────
export const Spinner = ({ msg = "Loading..." }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 70,
      gap: 14,
    }}
  >
    <div
      className="spin"
      style={{
        width: 36,
        height: 36,
        border: "3px solid var(--bd)",
        borderTopColor: "var(--em)",
        borderRadius: "50%",
      }}
    />
    <span style={{ color: "var(--dm)", fontSize: 14 }}>{msg}</span>
  </div>
);

// ── Table cell style objects (for inline styles on <th> and <td>) ─────────────
export const th = {
  padding: "7px 8px",
  textAlign: "left",
  color: "var(--dm)",
  fontWeight: 600,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  fontFamily: "'Barlow Condensed', sans-serif",
};

export const td = {
  padding: "7px 8px",
  textAlign: "left",
  fontSize: 13,
};

// ── Confidence colour (green → yellow → red) ──────────────────────────────────
export const confColor = c =>
  c >= 0.8 ? "var(--lm)" : c >= 0.55 ? "var(--gd)" : "var(--rs)";

export { HEAD };
