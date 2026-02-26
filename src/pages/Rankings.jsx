import { useState, useMemo } from "react";
import { rankPlayersV2, recomputeStatsCache, DEFAULT_FORMAT } from "../engine/projectionV2.js";
import { STATIC_DEPTH_CHARTS, STATIC_STANDINGS_25 } from "../data/teamData.js";
import { Pil, Headshot, TeamLogo, posColor, confColor } from "../components/ui.jsx";

// ── Tier thresholds ───────────────────────────────────────────────────────────
const TIERS = [
  { id: "S", label: "S", color: "#F59E0B", bg: "rgba(245,158,11,.12)", max: 5 },
  { id: "A", label: "A", color: "#22C55E", bg: "rgba(34,197,94,.1)",   max: 15 },
  { id: "B", label: "B", color: "#38BDF8", bg: "rgba(56,189,248,.1)",  max: 30 },
  { id: "C", label: "C", color: "#A78BFA", bg: "rgba(167,139,250,.1)", max: 60 },
  { id: "D", label: "D", color: "#F43F5E", bg: "rgba(244,63,94,.08)",  max: 9999 },
];

function getTier(overallRank) {
  return TIERS.find(t => overallRank <= t.max) || TIERS[TIERS.length - 1];
}

// Position rank display (WR1, WR2, QB1…)
function buildPosRanks(ranked) {
  const counts = {};
  return ranked.map(p => {
    counts[p.pos] = (counts[p.pos] || 0) + 1;
    return { ...p, posRank: `${p.pos}${counts[p.pos]}` };
  });
}

const SCORING_OPTS = [
  { key: "ppr",  label: "PPR"   },
  { key: "half", label: "½ PPR" },
  { key: "std",  label: "Std"   },
];
const TD_OPTS = [
  { key: 4, label: "4pt TD" },
  { key: 6, label: "6pt TD" },
];
const POS_FILTERS = ["ALL", "QB", "RB", "WR", "TE"];

// Color for pos rank badge (WR1=gold, WR2=silver, WR3=bronze, else dim)
const posRankColor = rank => {
  const n = parseInt(rank.replace(/\D/g, ""), 10);
  if (n === 1) return "#F59E0B";
  if (n === 2) return "#9CA3AF";
  if (n === 3) return "#CD7F32";
  return "var(--dm)";
};

// ── Tier divider row ──────────────────────────────────────────────────────────
function TierDivider({ tier }) {
  return (
    <tr>
      <td colSpan={8} style={{ padding: "4px 0 2px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "5px 12px", borderRadius: 6,
          background: tier.bg,
          borderLeft: `3px solid ${tier.color}`,
        }}>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 18,
            color: tier.color, letterSpacing: 1.5, lineHeight: 1,
          }}>
            {tier.label} TIER
          </span>
          <div style={{ flex: 1, height: 1, background: `${tier.color}25` }} />
        </div>
      </td>
    </tr>
  );
}

// ── Single rank row ───────────────────────────────────────────────────────────
function RankRow({ p, overallRank, goP, goT }) {
  const tier = getTier(overallRank);
  const pc   = posColor(p.pos);
  const prc  = posRankColor(p.posRank);

  return (
    <tr
      className="rank-row"
      onClick={() => goP(p.id)}
      style={{ borderLeft: `2px solid transparent` }}
    >
      {/* # */}
      <td style={{ padding: "8px 8px", width: 36 }}>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 13, fontWeight: 800,
          color: tier.color,
        }}>
          {overallRank}
        </span>
      </td>

      {/* Player */}
      <td style={{ padding: "8px 8px", minWidth: 180 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Headshot src={p.hs} sz={38} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{p.nm}</div>
            <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
              <span style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 11, fontWeight: 800, color: prc,
                letterSpacing: .3,
              }}>
                {p.posRank}
              </span>
              <span style={{ fontSize: 10, color: "var(--dm)" }}>
                {p.role}
              </span>
            </div>
          </div>
        </div>
      </td>

      {/* Team */}
      <td style={{ padding: "8px 8px", width: 70 }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}
          onClick={e => { e.stopPropagation(); goT(p.tm); }}
        >
          <TeamLogo ab={p.tm} sz={22} />
          <span style={{ fontSize: 12, color: "var(--dm)" }}>{p.tm}</span>
        </div>
      </td>

      {/* Projection */}
      <td style={{ padding: "8px 8px", width: 80 }}>
        <div style={{ display: "flex", flex: "column", gap: 2 }}>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 22,
            color: "var(--em)", lineHeight: 1,
          }}>
            {p.projection}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <span style={{ fontSize: 9, color: "var(--rs)", fontFamily: "'Barlow Condensed', sans-serif" }}>▼{p.floor}</span>
            <span style={{ fontSize: 9, color: "var(--lm)", fontFamily: "'Barlow Condensed', sans-serif" }}>▲{p.ceiling}</span>
          </div>
        </div>
      </td>

      {/* Tier badge */}
      <td style={{ padding: "8px 8px", width: 52 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 28, borderRadius: 7,
          background: tier.bg, border: `1px solid ${tier.color}44`,
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 16,
          color: tier.color, letterSpacing: 0.5,
        }}>
          {tier.label}
        </div>
      </td>

      {/* Usage */}
      <td style={{ padding: "8px 8px", width: 90 }}>
        <MiniScoreBar val={p.usage} color="var(--em)" />
      </td>

      {/* Efficiency */}
      <td style={{ padding: "8px 8px", width: 90 }}>
        <MiniScoreBar val={p.efficiency} color="var(--sk)" />
      </td>

      {/* Confidence */}
      <td style={{ padding: "8px 8px", width: 68 }}>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: confColor(p.confidence),
          fontFamily: "'Barlow Condensed', sans-serif",
        }}>
          {Math.round(p.confidence * 100)}%
        </span>
      </td>
    </tr>
  );
}

function MiniScoreBar({ val, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,.07)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${(val / 10) * 100}%`, height: "100%", background: color, borderRadius: 99 }} />
      </div>
      <span style={{
        fontSize: 10, color: "var(--dm)", minWidth: 22, textAlign: "right",
        fontFamily: "'Bebas Neue', sans-serif", letterSpacing: .3,
      }}>
        {val}
      </span>
    </div>
  );
}

// ── Main Rankings page ────────────────────────────────────────────────────────
export default function Rankings({ players, loading, statsCache, goP, goT }) {
  const [posFilter, setPosFilter] = useState("ALL");
  const [scoring,   setScoring]   = useState(DEFAULT_FORMAT.scoring);
  const [tdPts,     setTdPts]     = useState(DEFAULT_FORMAT.tdPts);
  const [q,         setQ]         = useState("");

  const format = useMemo(() => ({ scoring, tdPts }), [scoring, tdPts]);

  const formatCache = useMemo(
    () => recomputeStatsCache(statsCache, format),
    [statsCache, format]
  );

  const allRanked = useMemo(() => {
    if (loading || !players.length) return [];
    return rankPlayersV2(players, formatCache, STATIC_DEPTH_CHARTS, STATIC_STANDINGS_25, format);
  }, [players, formatCache, format, loading]);

  const filtered = useMemo(() => {
    let list = posFilter === "ALL" ? allRanked : allRanked.filter(p => p.pos === posFilter);
    if (q) {
      const lq = q.toLowerCase();
      list = list.filter(p => p.nm.toLowerCase().includes(lq) || p.tm.toLowerCase().includes(lq));
    }
    return list;
  }, [allRanked, posFilter, q]);

  // Build pos ranks on filtered list
  const withPosRanks = useMemo(() => buildPosRanks(filtered), [filtered]);

  // Group by tiers for rendering with dividers
  const rows = useMemo(() => {
    const out = [];
    let lastTier = null;
    withPosRanks.forEach((p, i) => {
      const tier = getTier(i + 1);
      if (tier.id !== lastTier) {
        out.push({ type: "divider", tier });
        lastTier = tier.id;
      }
      out.push({ type: "player", p, overallRank: i + 1 });
    });
    return out;
  }, [withPosRanks]);

  // Summary counts per tier
  const tierCounts = useMemo(() => {
    const counts = {};
    withPosRanks.forEach((_, i) => {
      const tier = getTier(i + 1);
      counts[tier.id] = (counts[tier.id] || 0) + 1;
    });
    return counts;
  }, [withPosRanks]);

  return (
    <div className="fu page-wrap">
      {/* Header */}
      <div style={{
        background: "var(--s1)", border: "1px solid var(--bd)",
        borderRadius: 14, padding: "18px 20px", marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
          <div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 1.5, marginBottom: 4 }}>
              PLAYER RANKINGS
            </h2>
            <p style={{ color: "var(--dm)", fontSize: 13 }}>
              Percentile-based • V2 Engine •{" "}
              {TIERS.map(t => (
                <span key={t.id} style={{ color: t.color, fontWeight: 700, marginRight: 8 }}>
                  {t.label}: {tierCounts[t.id] || 0}
                </span>
              ))}
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            <div className="scoring-strip">
              {SCORING_OPTS.map(o => (
                <button key={o.key} className={`scoring-btn${scoring === o.key ? " active" : ""}`} onClick={() => setScoring(o.key)}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="scoring-strip">
              {TD_OPTS.map(o => (
                <button key={o.key} className={`scoring-btn${tdPts === o.key ? " active" : ""}`} onClick={() => setTdPts(o.key)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search player or team…"
            className="search-input"
            style={{ maxWidth: 240 }}
          />
          <div style={{ display: "flex", gap: 3 }}>
            {POS_FILTERS.map(pos => (
              <button
                key={pos}
                onClick={() => setPosFilter(pos)}
                style={{
                  padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 600,
                  background: posFilter === pos
                    ? (pos === "ALL" ? "var(--em)" : posColor(pos))
                    : "rgba(255,255,255,.05)",
                  color: posFilter === pos ? "#000" : "var(--dm)",
                  transition: "all .13s",
                }}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="rank-table">
            <thead>
              <tr style={{ background: "rgba(0,0,0,.28)", borderBottom: "2px solid var(--bd)" }}>
                <th style={{ padding: "9px 8px", width: 36 }}>#</th>
                <th style={{ padding: "9px 8px" }}>Player</th>
                <th style={{ padding: "9px 8px", width: 70 }}>Team</th>
                <th style={{ padding: "9px 8px", width: 80, color: "var(--em)" }}>FPTS Proj</th>
                <th style={{ padding: "9px 8px", width: 52 }}>Tier</th>
                <th style={{ padding: "9px 8px", width: 90, color: "var(--em)" }}>Usage<span style={{ fontSize: 9, fontWeight: 400 }}> (35%)</span></th>
                <th style={{ padding: "9px 8px", width: 90, color: "var(--sk)" }}>Efficiency<span style={{ fontSize: 9, fontWeight: 400 }}> (15%)</span></th>
                <th style={{ padding: "9px 8px", width: 68, color: "var(--lm)" }}>Conf</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "var(--dm)" }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "var(--dm)" }}>No players match.</td></tr>
              ) : (
                rows.map((row, i) =>
                  row.type === "divider"
                    ? <TierDivider key={`d-${row.tier.id}`} tier={row.tier} />
                    : <RankRow key={row.p.id} p={row.p} overallRank={row.overallRank} goP={goP} goT={goT} />
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 10, color: "var(--dm)", fontSize: 12, padding: "0 4px" }}>
        Percentile-scaled within position group · Click any row to view full player profile · Pos rank (WR1, WR2…) is relative to current filter
      </div>
    </div>
  );
}
