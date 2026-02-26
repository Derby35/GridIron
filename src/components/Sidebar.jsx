import { useState, useEffect } from "react";
import { Pil, Headshot, posColor } from "./ui.jsx";

const SLEEPER = "https://api.sleeper.app/v1";

async function fetchSleeperTrending(type = "add") {
  const key = `gi_sleeper_${type}`;
  try {
    const c = localStorage.getItem(key);
    if (c) {
      const { ts, data } = JSON.parse(c);
      if (Date.now() - ts < 3_600_000) return data;
    }
  } catch (_) {}
  try {
    const r = await fetch(
      `${SLEEPER}/players/nfl/trending/${type}?lookback_hours=24&limit=20`
    );
    if (!r.ok) return [];
    const data = await r.json();
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch (_) {}
    return data;
  } catch (_) { return []; }
}

// ── Trending section ──────────────────────────────────────────────────────────
function TrendingSection({ players, goP }) {
  const [adds, setAdds] = useState([]);
  const [drops, setDrops] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchSleeperTrending("add"), fetchSleeperTrending("drop")]).then(
      ([a, d]) => { setAdds(a); setDrops(d); setLoading(false); }
    );
  }, []);

  const resolvePlayer = sleeperId =>
    players.find(p => p.id === sleeperId || String(p.id) === String(sleeperId));

  const TrendRow = ({ item, dir }) => {
    const p = resolvePlayer(item.player_id);
    if (!p) return null;
    return (
      <div className="sidebar-row" onClick={() => goP(p.id)}>
        <Headshot src={p.hs} sz={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.nm}
          </div>
          <div style={{ fontSize: 10, color: "var(--dm)" }}>{p.tm} · {p.pos}</div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: dir === "add" ? "var(--lm)" : "var(--rs)",
          whiteSpace: "nowrap",
        }}>
          {dir === "add" ? "+" : "-"}{item.count?.toLocaleString()}
        </span>
      </div>
    );
  };

  return (
    <div className="sidebar-section">
      <div className="sidebar-header">
        <span className="sidebar-title">TRENDING (24h)</span>
        <span className="sidebar-badge">Sleeper</span>
      </div>
      {loading ? (
        <div style={{ padding: "18px 14px", color: "var(--dm)", fontSize: 12, textAlign: "center" }}>
          Loading...
        </div>
      ) : (
        <div style={{ padding: "6px 0" }}>
          {adds.slice(0, 5).map((item, i) => (
            <TrendRow key={`add-${i}`} item={item} dir="add" />
          ))}
          {adds.length === 0 && drops.length === 0 && (
            <div style={{ padding: "12px 14px", color: "var(--dm)", fontSize: 12 }}>
              No trending data
            </div>
          )}
          {drops.length > 0 && (
            <>
              <div style={{ margin: "4px 10px", borderTop: "1px solid var(--bd)", paddingTop: 4 }} />
              {drops.slice(0, 5).map((item, i) => (
                <TrendRow key={`drop-${i}`} item={item} dir="drop" />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Top Ranked section ────────────────────────────────────────────────────────
function TopRankedSection({ ranked, goP }) {
  const top = ranked.slice(0, 10);
  return (
    <div className="sidebar-section">
      <div className="sidebar-header">
        <span className="sidebar-title">TOP RANKED</span>
        <span className="sidebar-badge">Overall</span>
      </div>
      <div style={{ padding: "6px 0" }}>
        {top.map((p, i) => (
          <div key={p.id} className="sidebar-row" onClick={() => goP(p.id)}>
            <span style={{
              width: 18, fontSize: 11, fontWeight: 800,
              color: i < 3 ? "var(--em)" : "var(--dm)",
              fontFamily: "'Barlow Condensed', sans-serif",
              flexShrink: 0, textAlign: "right",
            }}>
              {i + 1}
            </span>
            <Headshot src={p.hs} sz={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.nm}
              </div>
              <div style={{ fontSize: 10, color: "var(--dm)" }}>
                {p.tm} · <span style={{ color: posColor(p.pos) }}>{p.pos}</span>
              </div>
            </div>
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 15, color: "var(--em)", letterSpacing: 0.5, flexShrink: 0,
            }}>
              {p.projection}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── By-position top 3 ─────────────────────────────────────────────────────────
function PositionLeaders({ ranked, goP }) {
  const byPos = {};
  for (const p of ranked) {
    if (!byPos[p.pos]) byPos[p.pos] = [];
    if (byPos[p.pos].length < 3) byPos[p.pos].push(p);
  }

  return (
    <div className="sidebar-section">
      <div className="sidebar-header">
        <span className="sidebar-title">POSITION LEADERS</span>
      </div>
      <div style={{ padding: "8px 6px" }}>
        {["QB", "RB", "WR", "TE"].map(pos => (
          <div key={pos} style={{ marginBottom: 10 }}>
            <div style={{
              fontSize: 10, fontWeight: 700,
              color: posColor(pos), letterSpacing: 1,
              fontFamily: "'Barlow Condensed', sans-serif",
              marginBottom: 2, paddingLeft: 10,
            }}>
              {pos}
            </div>
            {(byPos[pos] || []).map((p, i) => (
              <div key={p.id} className="sidebar-row" onClick={() => goP(p.id)}>
                <span style={{
                  fontSize: 10, width: 14,
                  color: i === 0 ? posColor(pos) : "var(--dm)",
                  fontWeight: 700,
                  fontFamily: "'Barlow Condensed', sans-serif",
                  textAlign: "right", flexShrink: 0,
                }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.nm}
                </span>
                <span style={{
                  fontSize: 12, fontFamily: "'Bebas Neue', sans-serif",
                  color: posColor(pos), letterSpacing: 0.5, flexShrink: 0,
                }}>
                  {p.projection}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Sidebar export ───────────────────────────────────────────────────────
export default function Sidebar({ ranked = [], players = [], goP }) {
  return (
    <aside className="players-sidebar">
      <TrendingSection players={players} goP={goP} />
      <TopRankedSection ranked={ranked} goP={goP} />
      <PositionLeaders ranked={ranked} goP={goP} />
    </aside>
  );
}
