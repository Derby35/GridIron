import { useState, useEffect, useMemo } from "react";
import { rankPlayersV2, recomputeStatsCache, DEFAULT_FORMAT } from "../engine/projectionV2.js";
import { STATIC_DEPTH_CHARTS, STATIC_STANDINGS_25 } from "../data/teamData.js";
import { Headshot, TeamLogo, Pil, StCard, posColor } from "../components/ui.jsx";

// ── 2-day localStorage cache ──────────────────────────────────────────────────
const TWO_DAYS = 172_800_000;
function getCached(key) {
  try {
    const c = JSON.parse(localStorage.getItem(key));
    if (c && Date.now() - c.ts < TWO_DAYS) return c.data;
  } catch (_) {}
  return null;
}
function setCached(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch (_) {}
}

// ── Fetch Sleeper players → ADP (search_rank) + injury status ─────────────────
// Sleeper /players/nfl is ~6MB raw; we filter to active skill-position players
async function fetchSleeperDraftData() {
  const cached = getCached("gi_sleeper_nfl");
  if (cached) return cached;
  try {
    const r = await fetch("https://api.sleeper.app/v1/players/nfl");
    if (!r.ok) return {};
    const raw = await r.json();
    const out = {};
    for (const p of Object.values(raw)) {
      const pos = p.fantasy_positions?.[0];
      if (!["QB","RB","WR","TE"].includes(pos)) continue;
      if (!p.active || !p.team) continue;
      const espnId = p.espn_id?.toString();
      if (!espnId) continue;
      out[espnId] = {
        rank:          p.search_rank     || 999,
        injuryStatus:  p.injury_status   || null,
        injuryPart:    p.injury_body_part || null,
        injuryNotes:   p.injury_notes    || null,
        yahooId:       p.yahoo_id        || null,
        sleeperId:     p.player_id,
      };
    }
    setCached("gi_sleeper_nfl", out);
    return out;
  } catch (_) { return {}; }
}

// ── Fetch ESPN Fantasy ADP ────────────────────────────────────────────────────
// Uses the ESPN fantasy.espn.com public endpoint — may fail due to CORS in some browsers.
// Falls back gracefully to Sleeper rank when unavailable.
async function fetchEspnADP() {
  const cached = getCached("gi_espn_adp_2025");
  if (cached) return cached;
  try {
    const r = await fetch(
      "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2025/players?scoringPeriodId=0&view=kona_player_info",
      { headers: { "X-Fantasy-Source": "kona", "X-Fantasy-Platform": "kona-PROD-2.16.0" } }
    );
    if (!r.ok) return {};
    const data = await r.json();
    const out = {};
    for (const entry of (data.players || [])) {
      const id  = entry.id?.toString();
      const adp = entry.playerPoolEntry?.averageDraftPositionPPR
               ?? entry.playerPoolEntry?.averageDraftPosition;
      if (id && adp && adp < 999) out[id] = Math.round(adp * 10) / 10;
    }
    setCached("gi_espn_adp_2025", out);
    return out;
  } catch (_) { return {}; }
}

// ── Injury status badge ───────────────────────────────────────────────────────
const INJ_CFG = {
  "IR":          { bg: "rgba(244,63,94,.15)",   c: "#F43F5E", short: "IR"  },
  "Out":         { bg: "rgba(244,63,94,.13)",   c: "#F43F5E", short: "OUT" },
  "Doubtful":    { bg: "rgba(245,158,11,.13)",  c: "#F59E0B", short: "D"   },
  "Questionable":{ bg: "rgba(245,158,11,.10)",  c: "#F59E0B", short: "Q"   },
  "PUP-R":       { bg: "rgba(167,139,250,.12)", c: "#A78BFA", short: "PUP" },
  "COV":         { bg: "rgba(56,189,248,.12)",  c: "#38BDF8", short: "COV" },
};
export function InjBadge({ status, full = false }) {
  if (!status) return null;
  const cfg = INJ_CFG[status] || { bg: "rgba(255,255,255,.08)", c: "var(--dm)", short: status.slice(0,3) };
  return (
    <span style={{
      background: cfg.bg, color: cfg.c,
      border: `1px solid ${cfg.c}33`,
      borderRadius: 5, padding: full ? "2px 8px" : "1px 5px",
      fontSize: full ? 12 : 10,
      fontFamily: "'Barlow Condensed', sans-serif",
      fontWeight: 700, letterSpacing: .4,
      whiteSpace: "nowrap",
    }}>
      {full ? status : cfg.short}
    </span>
  );
}

// Pick number within the round  (e.g. rank 14 in 12-team = Round 2, Pick 2)
function RoundPick({ rank, teamSize = 12 }) {
  const round = Math.ceil(rank / teamSize);
  const pick  = ((rank - 1) % teamSize) + 1;
  const colors = ["#F59E0B","#22C55E","#38BDF8","#A78BFA","#F97316",
                  "rgba(255,255,255,.5)","rgba(255,255,255,.4)"];
  const c = colors[Math.min(round - 1, colors.length - 1)];
  return (
    <span style={{
      fontFamily: "'Bebas Neue', sans-serif", fontSize: 11,
      color: c, letterSpacing: .5,
    }}>
      R{round}.{pick}
    </span>
  );
}

// ── Draft table row ───────────────────────────────────────────────────────────
function DraftRow({ entry, rank, goP, goT }) {
  const { p, prevFP, projFP, sleeperRank, espnADP, injuryStatus, injuryPart, injuryNotes } = entry;
  const pc = posColor(p.pos);

  return (
    <tr className="rank-row" onClick={() => goP(p.id)}>
      {/* Rank + round */}
      <td style={{ padding: "7px 8px", width: 44 }}>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 800, fontSize: 15, color: "var(--dm)", lineHeight: 1,
        }}>{rank}</div>
        <RoundPick rank={rank} />
      </td>

      {/* Player info */}
      <td style={{ padding: "7px 8px", minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Headshot src={p.hs} sz={38} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{p.nm}</div>
            <div style={{ display: "flex", gap: 4, marginTop: 2, alignItems: "center", flexWrap: "wrap" }}>
              <Pil ch={p.pos} c={pc} s={{ padding: "1px 6px", fontSize: 9 }} />
              {p.age && <span style={{ fontSize: 10, color: "var(--dm)" }}>Age {p.age}</span>}
              {p.exp !== undefined && (
                <span style={{ fontSize: 10, color: "var(--dm)" }}>Yr {p.exp + 1}</span>
              )}
              {injuryStatus && <InjBadge status={injuryStatus} />}
            </div>
            {injuryStatus && injuryPart && (
              <div style={{ fontSize: 10, color: "var(--dm)", marginTop: 2, fontStyle: "italic" }}>
                {injuryPart}{injuryNotes ? ` — ${injuryNotes}` : ""}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Team */}
      <td style={{ padding: "7px 8px", width: 65 }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
          onClick={e => { e.stopPropagation(); goT(p.tm); }}
        >
          <TeamLogo ab={p.tm} sz={20} />
          <span style={{ fontSize: 11, color: "var(--dm)" }}>{p.tm}</span>
        </div>
      </td>

      {/* Projected FP */}
      <td style={{ padding: "7px 8px", width: 90 }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 24,
          color: "var(--em)", lineHeight: 1,
        }}>
          {projFP > 0 ? projFP : "—"}
        </div>
        <div style={{ fontSize: 9, color: "var(--dm)", fontFamily: "'Barlow Condensed', sans-serif" }}>
          proj fpts
        </div>
      </td>

      {/* Previous year FP */}
      <td style={{ padding: "7px 8px", width: 90 }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 24,
          color: prevFP > 0 ? "var(--gd)" : "var(--dm2)", lineHeight: 1,
        }}>
          {prevFP > 0 ? prevFP : "—"}
        </div>
        <div style={{ fontSize: 9, color: "var(--dm)", fontFamily: "'Barlow Condensed', sans-serif" }}>
          2024 fpts
        </div>
      </td>

      {/* Sleeper ADP */}
      <td style={{ padding: "7px 8px", width: 76 }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 20,
          color: sleeperRank < 300 ? "var(--sk)" : "var(--dm)", lineHeight: 1,
        }}>
          {sleeperRank < 900 ? sleeperRank : "—"}
        </div>
        <div style={{ fontSize: 9, color: "var(--dm)", fontFamily: "'Barlow Condensed', sans-serif" }}>
          sleeper
        </div>
      </td>

      {/* ESPN ADP */}
      <td style={{ padding: "7px 8px", width: 76 }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 20,
          color: espnADP ? "var(--vi)" : "var(--dm2)", lineHeight: 1,
        }}>
          {espnADP ? espnADP.toFixed(1) : "—"}
        </div>
        <div style={{ fontSize: 9, color: "var(--dm)", fontFamily: "'Barlow Condensed', sans-serif" }}>
          espn adp
        </div>
      </td>
    </tr>
  );
}

// ── Sort + filter controls ────────────────────────────────────────────────────
const SCORING_OPTS = [
  { key: "ppr",  label: "PPR"   },
  { key: "half", label: "½ PPR" },
  { key: "std",  label: "Std"   },
];
const POS_FILTERS = ["ALL","QB","RB","WR","TE"];
const SORT_OPTS = [
  { key: "adp",     label: "Sleeper ADP" },
  { key: "espnADP", label: "ESPN ADP"    },
  { key: "projFP",  label: "Proj FP"    },
  { key: "prevFP",  label: "2024 FP"    },
];

// ── Main Draft page ───────────────────────────────────────────────────────────
export default function Draft({ players, loading, statsCache, goP, goT }) {
  const [scoring,     setScoring]     = useState(DEFAULT_FORMAT.scoring);
  const [posFilter,   setPosFilter]   = useState("ALL");
  const [q,           setQ]           = useState("");
  const [sortKey,     setSortKey]     = useState("adp");
  const [sleeperData, setSleeperData] = useState({});
  const [espnADP,     setEspnADP]     = useState({});
  const [fetching,    setFetching]    = useState(false);
  const [espnLoaded,  setEspnLoaded]  = useState(false);
  const [sleeperLoaded, setSleeperLoaded] = useState(false);

  useEffect(() => {
    setFetching(true);
    Promise.allSettled([fetchSleeperDraftData(), fetchEspnADP()]).then(([sRes, eRes]) => {
      if (sRes.status === "fulfilled" && sRes.value) {
        setSleeperData(sRes.value);
        setSleeperLoaded(true);
      }
      if (eRes.status === "fulfilled" && eRes.value) {
        setEspnADP(eRes.value);
        setEspnLoaded(Object.keys(eRes.value).length > 0);
      }
      setFetching(false);
    });
  }, []);

  const format = useMemo(() => ({ scoring, tdPts: DEFAULT_FORMAT.tdPts }), [scoring]);

  const formatCache = useMemo(
    () => recomputeStatsCache(statsCache, format),
    [statsCache, format]
  );

  const allRanked = useMemo(() => {
    if (loading || !players.length) return [];
    return rankPlayersV2(players, formatCache, STATIC_DEPTH_CHARTS, STATIC_STANDINGS_25, format);
  }, [players, formatCache, format, loading]);

  // Build draft entries — combine V2 projections with ADP + injury data
  const draftEntries = useMemo(() => {
    return allRanked.map(p => {
      const prevFP = statsCache[p.id]?.[2024]?.fpts || 0;
      const sl     = sleeperData[p.id] || {};
      return {
        p,
        prevFP,
        projFP:        p.projection,
        sleeperRank:   sl.rank     || 999,
        espnADP:       espnADP[p.id] || null,
        injuryStatus:  sl.injuryStatus || null,
        injuryPart:    sl.injuryPart   || null,
        injuryNotes:   sl.injuryNotes  || null,
      };
    });
  }, [allRanked, sleeperData, espnADP, statsCache]);

  // Filter + sort
  const displayed = useMemo(() => {
    let list = posFilter === "ALL" ? draftEntries : draftEntries.filter(e => e.p.pos === posFilter);
    if (q) {
      const lq = q.toLowerCase();
      list = list.filter(e =>
        e.p.nm.toLowerCase().includes(lq) || e.p.tm.toLowerCase().includes(lq)
      );
    }
    const sorters = {
      adp:     (a, b) => (a.sleeperRank || 999) - (b.sleeperRank || 999),
      espnADP: (a, b) => (a.espnADP || 999) - (b.espnADP || 999),
      projFP:  (a, b) => b.projFP  - a.projFP,
      prevFP:  (a, b) => b.prevFP  - a.prevFP,
    };
    return [...list].sort(sorters[sortKey] || sorters.adp);
  }, [draftEntries, posFilter, q, sortKey]);

  const injuredCount  = displayed.filter(e => e.injuryStatus).length;
  const espnAdpCount  = displayed.filter(e => e.espnADP).length;

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
              FANTASY DRAFT BOARD
            </h2>
            <p style={{ color: "var(--dm)", fontSize: 13 }}>
              ADP from Sleeper &amp; ESPN · 2024 stats from ESPN · 2025 projections from V2 engine · Injuries from Sleeper (cached 48 hrs)
            </p>
          </div>
          {/* Scoring format */}
          <div className="scoring-strip">
            {SCORING_OPTS.map(o => (
              <button
                key={o.key}
                className={`scoring-btn${scoring === o.key ? " active" : ""}`}
                onClick={() => setScoring(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search player or team…"
            className="search-input"
            style={{ maxWidth: 220 }}
          />
          {/* Position filter */}
          <div style={{ display: "flex", gap: 3 }}>
            {POS_FILTERS.map(pos => (
              <button
                key={pos}
                onClick={() => setPosFilter(pos)}
                style={{
                  padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 600, transition: "all .12s",
                  background: posFilter === pos
                    ? (pos === "ALL" ? "var(--em)" : posColor(pos))
                    : "rgba(255,255,255,.05)",
                  color: posFilter === pos ? "#000" : "var(--dm)",
                }}
              >
                {pos}
              </button>
            ))}
          </div>
          {/* Sort options */}
          <div style={{ display: "flex", gap: 3 }}>
            {SORT_OPTS.map(o => (
              <button
                key={o.key}
                onClick={() => setSortKey(o.key)}
                style={{
                  padding: "5px 11px", borderRadius: 7, border: "none", cursor: "pointer",
                  fontSize: 11, transition: "all .12s",
                  fontWeight: sortKey === o.key ? 800 : 500,
                  background: sortKey === o.key ? "rgba(249,115,22,.18)" : "rgba(255,255,255,.04)",
                  color: sortKey === o.key ? "var(--em)" : "var(--dm)",
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status indicators */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <DataSource
            label="Sleeper"
            status={fetching ? "loading" : sleeperLoaded ? "ok" : "error"}
            detail={sleeperLoaded ? `${Object.keys(sleeperData).length} players` : fetching ? "fetching…" : "failed"}
          />
          <DataSource
            label="ESPN ADP"
            status={fetching ? "loading" : espnLoaded ? "ok" : "warn"}
            detail={espnLoaded ? `${espnAdpCount} ADPs` : fetching ? "fetching…" : "CORS blocked — Sleeper rank used"}
          />
          <DataSource
            label="Yahoo"
            status="warn"
            detail="Requires OAuth — not available"
          />
          {injuredCount > 0 && (
            <span style={{
              fontSize: 11, color: "#F43F5E",
              background: "rgba(244,63,94,.1)", border: "1px solid rgba(244,63,94,.2)",
              borderRadius: 6, padding: "2px 8px",
            }}>
              ⚠ {injuredCount} injured / questionable
            </span>
          )}
        </div>
      </div>

      {/* Summary stat cards */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <StCard l="Players" v={displayed.length} c="var(--em)" />
        <StCard l="Injured / Q" v={injuredCount} c="var(--rs)" />
        <StCard l="Top Proj" v={displayed[0]?.projFP || "—"} c="var(--lm)" />
        <StCard l="Top 2024 FP" v={displayed.reduce((b, e) => Math.max(b, e.prevFP), 0) || "—"} c="var(--gd)" />
        <StCard l="ESPN ADPs" v={espnAdpCount || "—"} c="var(--vi)" />
      </div>

      {/* Draft table */}
      <div style={{ background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="rank-table">
            <thead>
              <tr style={{ background: "rgba(0,0,0,.28)", borderBottom: "2px solid var(--bd)" }}>
                <th style={{ padding: "9px 8px", width: 44 }}># / Rd</th>
                <th style={{ padding: "9px 8px" }}>Player</th>
                <th style={{ padding: "9px 8px", width: 65 }}>Team</th>
                <th style={{ padding: "9px 8px", width: 90, color: "var(--em)" }}>Proj FP</th>
                <th style={{ padding: "9px 8px", width: 90, color: "var(--gd)" }}>2024 FP</th>
                <th style={{ padding: "9px 8px", width: 76, color: "var(--sk)" }}>Sleeper ADP</th>
                <th style={{ padding: "9px 8px", width: 76, color: "var(--vi)" }}>ESPN ADP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--dm)" }}>Loading roster…</td></tr>
              ) : fetching && draftEntries.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 30, textAlign: "center", color: "var(--dm)" }}>Fetching ADP &amp; injury data…</td></tr>
              ) : displayed.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--dm)" }}>No players match.</td></tr>
              ) : (
                displayed.map((entry, i) => (
                  <DraftRow key={entry.p.id} entry={entry} rank={i + 1} goP={goP} goT={goT} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 10, color: "var(--dm)", fontSize: 12, padding: "0 4px", lineHeight: 1.8 }}>
        ADP = Average Draft Position (12-team default) · Sleeper rank from api.sleeper.app/v1/players/nfl (cached 48 hr) ·
        ESPN ADP from ESPN Fantasy public endpoint (CORS-dependent) ·
        Yahoo Fantasy requires OAuth 1.0a — live data not available without user credentials ·
        Click any row to view full player profile
      </div>
    </div>
  );
}

// ── Data source status pill ───────────────────────────────────────────────────
function DataSource({ label, status, detail }) {
  const cfg = {
    ok:      { c: "#22C55E", icon: "●" },
    warn:    { c: "#F59E0B", icon: "◐" },
    error:   { c: "#F43F5E", icon: "○" },
    loading: { c: "var(--dm)", icon: "⟳" },
  }[status] || { c: "var(--dm)", icon: "—" };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ color: cfg.c, fontSize: 10 }}>{cfg.icon}</span>
      <span style={{ fontSize: 11, color: "var(--tx)", fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 10, color: "var(--dm)" }}>{detail}</span>
    </div>
  );
}
