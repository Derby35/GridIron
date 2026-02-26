import { useState, useMemo } from "react";
import { rankPlayersV2, recomputeStatsCache, DEFAULT_FORMAT } from "../engine/projectionV2.js";
import { STATIC_DEPTH_CHARTS, STATIC_STANDINGS_25 } from "../data/teamData.js";
import { Pil, Headshot, TeamLogo, StCard, posColor, confColor } from "../components/ui.jsx";

const EXP_GROUPS = [
  { id: "rookie",  label: "ROOKIES",       subtitle: "1st Year",  minExp: 0, maxExp: 0 },
  { id: "second",  label: "2ND YEAR",      subtitle: "Sophomore", minExp: 1, maxExp: 1 },
  { id: "third",   label: "3RD YEAR",      subtitle: "Junior",    minExp: 2, maxExp: 2 },
  { id: "rising",  label: "RISING STARS",  subtitle: "Yrs 4–5 · Age ≤25", minExp: 3, maxExp: 5 },
];

const POS_COLORS = {
  QB: "var(--em)", RB: "var(--lm)", WR: "var(--sk)", TE: "var(--vi)",
};

// Draft round display (estimated from position rank order)
function RookieCard({ p, ranked, statsCache, goP, goT }) {
  const proj = ranked.find(r => r.id === p.id);
  const st   = statsCache[p.id];
  const recentYr = st ? Math.max(...Object.keys(st).map(Number)) : null;
  const lastSt   = recentYr ? st[recentYr] : null;
  const pc       = posColor(p.pos);

  return (
    <div
      onClick={() => goP(p.id)}
      style={{
        background: "var(--s1)",
        border: "1px solid var(--bd)",
        borderTop: `3px solid ${pc}`,
        borderRadius: 14, padding: 16,
        cursor: "pointer",
        transition: "border-color .18s, box-shadow .18s, transform .18s",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = pc;
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,.35)`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "var(--bd)";
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Headshot src={p.hs} sz={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.nm}
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 3 }}>
            <Pil ch={p.pos} c={pc} s={{ padding: "1px 7px", fontSize: 10 }} />
            <div
              style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}
              onClick={e => { e.stopPropagation(); goT(p.tm); }}
            >
              <TeamLogo ab={p.tm} sz={16} />
              <span style={{ fontSize: 11, color: "var(--dm)" }}>{p.tm}</span>
            </div>
            {p.age && <span style={{ fontSize: 11, color: "var(--dm)" }}>Age {p.age}</span>}
          </div>
        </div>
        {/* Year badge */}
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 13,
          color: "var(--dm)", letterSpacing: .5, textAlign: "right", flexShrink: 0,
        }}>
          Yr {(p.exp ?? 0) + 1}
        </div>
      </div>

      {/* Projection metrics */}
      {proj && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 28,
              color: "var(--em)", lineHeight: 1,
            }}>
              {proj.projection}
            </span>
            <div>
              <div style={{ fontSize: 9, color: "var(--dm)", textTransform: "uppercase", letterSpacing: .5 }}>
                Proj FPTS
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                <span style={{ fontSize: 10, color: "var(--rs)", fontFamily: "'Barlow Condensed', sans-serif" }}>▼{proj.floor}</span>
                <span style={{ fontSize: 10, color: "var(--lm)", fontFamily: "'Barlow Condensed', sans-serif" }}>▲{proj.ceiling}</span>
                <span style={{ fontSize: 10, color: confColor(proj.confidence), fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {Math.round(proj.confidence * 100)}% conf
                </span>
              </div>
            </div>
          </div>

          {/* Mini component bars */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
            {[
              { lbl: "Usage",      val: proj.usage,      c: "var(--em)" },
              { lbl: "High-Value", val: proj.highValue,  c: "var(--vi)" },
              { lbl: "Efficiency", val: proj.efficiency, c: "var(--sk)" },
              { lbl: "Recency",    val: proj.recency,    c: "var(--lm)" },
            ].map(({ lbl, val, c }) => (
              <div key={lbl}>
                <div style={{ fontSize: 9, color: "var(--dm)", marginBottom: 2, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: .4 }}>{lbl}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,.07)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${(val / 10) * 100}%`, height: "100%", background: c, borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: 9, color: "var(--dm)", fontFamily: "'Bebas Neue', sans-serif" }}>{val}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last season stats (if any) */}
      {lastSt ? (
        <div style={{
          borderTop: "1px solid var(--bd)", paddingTop: 10,
          display: "flex", flexWrap: "wrap", gap: 5,
        }}>
          <span style={{ fontSize: 10, color: "var(--dm)", fontFamily: "'Barlow Condensed', sans-serif", width: "100%", marginBottom: 2 }}>
            {recentYr} Season
          </span>
          {p.pos === "QB" && <>
            <StatPill l="P-Yds" v={lastSt.passYd?.toLocaleString()} c="var(--em)" />
            <StatPill l="TDs" v={lastSt.passTD} c="var(--lm)" />
            <StatPill l="INTs" v={lastSt.passInt} c="var(--rs)" />
            <StatPill l="FPTS" v={lastSt.fpts} c="var(--gd)" bold />
          </>}
          {p.pos === "RB" && <>
            <StatPill l="Rush Yds" v={lastSt.rushYd?.toLocaleString()} c="var(--em)" />
            <StatPill l="Rush TDs" v={lastSt.rushTD} c="var(--lm)" />
            <StatPill l="Rec" v={lastSt.rec} c="var(--sk)" />
            <StatPill l="FPTS" v={lastSt.fpts} c="var(--gd)" bold />
          </>}
          {(p.pos === "WR" || p.pos === "TE") && <>
            <StatPill l="Tgts" v={lastSt.tgt || "—"} c="var(--em)" />
            <StatPill l="Rec Yds" v={lastSt.recYd?.toLocaleString()} c="var(--sk)" />
            <StatPill l="TDs" v={lastSt.recTD} c="var(--lm)" />
            <StatPill l="FPTS" v={lastSt.fpts} c="var(--gd)" bold />
          </>}
        </div>
      ) : (
        <div style={{
          borderTop: "1px solid var(--bd)", paddingTop: 10,
          fontSize: 12, color: "var(--dm2)", fontStyle: "italic",
        }}>
          No prior season stats available
        </div>
      )}

      {/* Insight note */}
      {proj?.note && (
        <div style={{
          marginTop: 10, borderLeft: "2px solid var(--em)",
          paddingLeft: 8, fontSize: 11, color: "var(--dm)", lineHeight: 1.5,
          fontStyle: "italic",
        }}>
          {proj.note}
        </div>
      )}
    </div>
  );
}

function StatPill({ l, v, c, bold }) {
  return (
    <div style={{
      background: `${c}10`, border: `1px solid ${c}25`,
      borderRadius: 6, padding: "3px 7px",
      display: "flex", gap: 4, alignItems: "center",
    }}>
      <span style={{ fontSize: 9, color: "var(--dm)", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: .3 }}>{l}</span>
      <span style={{ fontSize: 11, color: c, fontWeight: bold ? 800 : 600, fontFamily: "'Bebas Neue', sans-serif" }}>
        {v ?? "—"}
      </span>
    </div>
  );
}

// ── Main Prospects page ────────────────────────────────────────────────────────
export default function Prospects({ players, loading, statsCache, goP, goT }) {
  const [activeGroup, setActiveGroup] = useState("rookie");
  const [posFilter,   setPosFilter]   = useState("ALL");
  const [q,           setQ]           = useState("");

  const format = DEFAULT_FORMAT;

  const formatCache = useMemo(
    () => recomputeStatsCache(statsCache, format),
    [statsCache]
  );

  const allRanked = useMemo(() => {
    if (loading || !players.length) return [];
    return rankPlayersV2(players, formatCache, STATIC_DEPTH_CHARTS, STATIC_STANDINGS_25, format);
  }, [players, formatCache, loading]);

  const group = EXP_GROUPS.find(g => g.id === activeGroup) || EXP_GROUPS[0];

  const prospects = useMemo(() => {
    let list = players.filter(p => {
      const exp = p.exp ?? 0;
      return exp >= group.minExp && exp <= group.maxExp &&
        (activeGroup !== "rising" || (p.age && p.age <= 25));
    });
    if (posFilter !== "ALL") list = list.filter(p => p.pos === posFilter);
    if (q) {
      const lq = q.toLowerCase();
      list = list.filter(p => p.nm.toLowerCase().includes(lq) || p.tm.toLowerCase().includes(lq));
    }
    // Sort by projection desc
    const projMap = {};
    allRanked.forEach(r => { projMap[r.id] = r.projection; });
    return list.sort((a, b) => (projMap[b.id] || 0) - (projMap[a.id] || 0));
  }, [players, group, posFilter, q, allRanked, activeGroup]);

  // Counts per group
  const groupCounts = useMemo(() => {
    const c = {};
    EXP_GROUPS.forEach(g => {
      c[g.id] = players.filter(p => {
        const exp = p.exp ?? 0;
        return exp >= g.minExp && exp <= g.maxExp &&
          (g.id !== "rising" || (p.age && p.age <= 25));
      }).length;
    });
    return c;
  }, [players]);

  return (
    <div className="fu page-wrap">
      {/* Header */}
      <div style={{
        background: "var(--s1)", border: "1px solid var(--bd)",
        borderRadius: 14, padding: "18px 20px", marginBottom: 16,
      }}>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 1.5, marginBottom: 4 }}>
          PROSPECTS & ROOKIES
        </h2>
        <p style={{ color: "var(--dm)", fontSize: 13, marginBottom: 14 }}>
          Young players and rising stars — ranked by projection score
        </p>

        {/* Group tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {EXP_GROUPS.map(g => (
            <button
              key={g.id}
              onClick={() => setActiveGroup(g.id)}
              style={{
                padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                background: activeGroup === g.id ? "var(--em)" : "rgba(255,255,255,.06)",
                color: activeGroup === g.id ? "#000" : "var(--dm)",
                fontWeight: activeGroup === g.id ? 800 : 600,
                fontSize: 13, fontFamily: "'Barlow', sans-serif",
                transition: "all .13s",
              }}
            >
              {g.label}
              <span style={{
                marginLeft: 6, fontSize: 10,
                background: activeGroup === g.id ? "rgba(0,0,0,.25)" : "rgba(255,255,255,.08)",
                padding: "1px 5px", borderRadius: 4,
              }}>
                {groupCounts[g.id] || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Position filter + search */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search player or team…"
            className="search-input"
            style={{ maxWidth: 220 }}
          />
          <div style={{ display: "flex", gap: 3 }}>
            {["ALL", "QB", "RB", "WR", "TE"].map(pos => (
              <button
                key={pos}
                onClick={() => setPosFilter(pos)}
                style={{
                  padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 600,
                  background: posFilter === pos
                    ? (pos === "ALL" ? "var(--em)" : posColor(pos))
                    : "rgba(255,255,255,.05)",
                  color: posFilter === pos ? "#000" : "var(--dm)",
                  transition: "all .12s",
                }}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <StCard l={`${group.label}`} v={prospects.length} c="var(--em)" />
        <StCard l="QBs" v={prospects.filter(p => p.pos === "QB").length} c="var(--gd)" />
        <StCard l="RBs" v={prospects.filter(p => p.pos === "RB").length} c="var(--lm)" />
        <StCard l="WRs" v={prospects.filter(p => p.pos === "WR").length} c="var(--sk)" />
        <StCard l="TEs" v={prospects.filter(p => p.pos === "TE").length} c="var(--vi)" />
      </div>

      {/* Cards grid */}
      {loading ? (
        <div style={{ color: "var(--dm)", padding: 40, textAlign: "center" }}>Loading…</div>
      ) : prospects.length === 0 ? (
        <div style={{
          background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 14,
          padding: 40, textAlign: "center", color: "var(--dm)",
        }}>
          No {group.label.toLowerCase()} found matching your filters.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
        }}>
          {prospects.map(p => (
            <RookieCard
              key={p.id}
              p={p}
              ranked={allRanked}
              statsCache={statsCache}
              goP={goP}
              goT={goT}
            />
          ))}
        </div>
      )}
    </div>
  );
}
