import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, AreaChart, Area, CartesianGrid, Cell, Legend,
} from "recharts";

import { rankPlayersV2, DEFAULT_FORMAT } from "../engine/projectionV2.js";
import { recomputeStatsCache }           from "../engine/projectionV2.js";
import { STATIC_DEPTH_CHARTS, STATIC_STANDINGS_25 } from "../data/teamData.js";

import Sidebar  from "../components/Sidebar.jsx";
import { Pil, StCard, Headshot, TeamLogo, MiniBar, ChartTT, Spinner, confColor, posColor, th, td } from "../components/ui.jsx";
import RankingsPage from "./Rankings.jsx";
import { InjBadge } from "./Draft.jsx";

// ── Injury helpers ────────────────────────────────────────────────────────────
const TWO_DAYS = 172_800_000;
function getCachedInj(key) {
  try {
    const c = JSON.parse(localStorage.getItem(key));
    if (c && Date.now() - c.ts < TWO_DAYS) return c.data;
  } catch (_) {}
  return null;
}
function setCachedInj(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch (_) {}
}

async function fetchAthleteProfile(id) {
  const k = `gi_athlete_${id}`;
  const cached = getCachedInj(k);
  if (cached !== null) return cached;
  try {
    const r = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/athletes/${id}`
    );
    if (!r.ok) { setCachedInj(k, []); return []; }
    const d = await r.json();
    const injuries = d.athlete?.injuries || [];
    setCachedInj(k, injuries);
    return injuries;
  } catch (_) {
    setCachedInj(k, []);
    return [];
  }
}

function getSleeperInjury(playerId) {
  try {
    const c = JSON.parse(localStorage.getItem("gi_sleeper_nfl"));
    if (c && Date.now() - c.ts < TWO_DAYS) return c.data?.[playerId] || null;
  } catch (_) {}
  return null;
}

// Games missed per season from statsCache (NFL = 17 games from 2021, 16 before)
function careerGamesMissed(stats) {
  if (!stats) return [];
  return Object.entries(stats)
    .map(([yr, s]) => {
      const max    = +yr >= 2021 ? 17 : 16;
      const gp     = s.gp || 0;
      const missed = Math.max(0, max - gp);
      return { year: +yr, gp, max, missed };
    })
    .filter(s => s.missed > 0 && s.gp > 0)
    .sort((a, b) => b.year - a.year);
}

// ── Injury section for player detail ─────────────────────────────────────────
function InjurySection({ playerId, stats }) {
  const [espnInjuries, setEspnInjuries] = useState(null); // null = not loaded yet
  const sleeperInj = useMemo(() => getSleeperInjury(playerId), [playerId]);
  const missed     = useMemo(() => careerGamesMissed(stats), [stats]);

  useEffect(() => {
    setEspnInjuries(null);
    fetchAthleteProfile(playerId).then(injuries => setEspnInjuries(injuries));
  }, [playerId]);

  const hasData = sleeperInj?.injuryStatus || (espnInjuries && espnInjuries.length > 0) || missed.length > 0;

  return (
    <div style={{
      background: "var(--s1)", border: "1px solid var(--bd)",
      borderRadius: 14, padding: 16, marginBottom: 12,
    }}>
      <div style={{
        fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, marginBottom: 14,
      }}>
        INJURY HISTORY &amp; STATUS
      </div>

      {/* Current status from Sleeper */}
      {sleeperInj?.injuryStatus ? (
        <div style={{
          marginBottom: 14, padding: "10px 14px",
          background: "rgba(244,63,94,.05)", border: "1px solid rgba(244,63,94,.15)",
          borderRadius: 10,
        }}>
          <div style={{ fontSize: 10, color: "var(--dm)", marginBottom: 6, fontWeight: 600 }}>
            CURRENT STATUS · via Sleeper
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <InjBadge status={sleeperInj.injuryStatus} full />
            {sleeperInj.injuryPart && (
              <span style={{ fontSize: 13, color: "var(--tx)", fontWeight: 600 }}>{sleeperInj.injuryPart}</span>
            )}
            {sleeperInj.injuryNotes && (
              <span style={{ fontSize: 12, color: "var(--dm)", fontStyle: "italic" }}>{sleeperInj.injuryNotes}</span>
            )}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 12, fontSize: 12, color: "var(--dm)" }}>
          No current injury status on record (Sleeper){sleeperInj === null ? " — load Draft page to fetch Sleeper data" : ""}
        </div>
      )}

      {/* ESPN injury log */}
      {espnInjuries === null ? (
        <div style={{ fontSize: 12, color: "var(--dm)", padding: "6px 0", marginBottom: 12 }}>
          Loading ESPN injury history…
        </div>
      ) : espnInjuries.length > 0 ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "var(--dm)", fontWeight: 600, marginBottom: 8 }}>
            ESPN INJURY LOG
          </div>
          {espnInjuries.slice(0, 8).map((inj, i) => (
            <div key={i} style={{
              display: "flex", gap: 12, alignItems: "flex-start",
              padding: "7px 0", borderBottom: "1px solid var(--bd)",
            }}>
              <span style={{ fontSize: 11, color: "var(--dm)", minWidth: 82, whiteSpace: "nowrap" }}>
                {inj.date
                  ? new Date(inj.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : "—"}
              </span>
              <span style={{ fontSize: 12, color: "var(--rs)", fontWeight: 700 }}>
                {inj.type?.description || inj.detail || "Injury"}
              </span>
              <span style={{ fontSize: 12, color: "var(--tx)" }}>
                {inj.status?.name || inj.shortComment || ""}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 12 }}>
          No ESPN injury records found.
        </div>
      )}

      {/* Career games missed */}
      {missed.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "var(--dm)", fontWeight: 600, marginBottom: 8 }}>
            GAMES MISSED BY SEASON
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {missed.map(s => (
              <div key={s.year} style={{
                background: s.missed >= 8 ? "rgba(244,63,94,.10)" : "rgba(245,158,11,.08)",
                border: `1px solid ${s.missed >= 8 ? "rgba(244,63,94,.25)" : "rgba(245,158,11,.2)"}`,
                borderRadius: 10, padding: "8px 12px", textAlign: "center", minWidth: 64,
              }}>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: "var(--dm)" }}>
                  {s.year}
                </div>
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: 28,
                  color: s.missed >= 8 ? "var(--rs)" : "var(--gd)", lineHeight: 1,
                }}>
                  {s.missed}
                </div>
                <div style={{ fontSize: 9, color: "var(--dm)" }}>games missed</div>
                <div style={{ fontSize: 9, color: "var(--dm)" }}>{s.gp} / {s.max} GP</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasData && espnInjuries !== null && (
        <div style={{ fontSize: 12, color: "var(--dm)", fontStyle: "italic", padding: "8px 0" }}>
          No injury history found for this player.
        </div>
      )}
    </div>
  );
}

// ── Team metadata (passed in from App) ───────────────────────────────────────
// We'll use TM as a prop from the parent.

// ── Fetch helpers (player game log — still live, ESPN allows browser fetches) ─
const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

async function fetchPlayerGameLog(athleteId, season = 2024) {
  try {
    const r = await fetch(`${SITE}/athletes/${athleteId}/gamelog?season=${season}`);
    if (!r.ok) return [];
    const data = await r.json();
    const games = [];
    const cats  = data.seasonTypes || [];
    for (const st of cats) {
      if (st.type !== 2 && st.seasonType !== 2) continue;
      const catNames = st.names || data.names || [];
      for (const ev of (st.events || [])) {
        const statsArr = ev.stats || [];
        const raw = {};
        for (let i = 0; i < catNames.length && i < statsArr.length; i++) {
          raw[catNames[i]] = parseFloat(statsArr[i]) || 0;
        }
        const opp = ev.opponent?.abbreviation || ev.opponent?.displayName || "?";
        const rec = raw.receptions || 0;
        const recYd = raw.receivingYards || 0;
        const recTD = raw.receivingTouchdowns || 0;
        const rushYd = raw.rushingYards || 0;
        const rushTD = raw.rushingTouchdowns || 0;
        const passYd = raw.passingYards || 0;
        const passTD = raw.passingTouchdowns || 0;
        const passInt = raw.interceptions || 0;
        const fpts = Math.round(
          passYd*0.04 + passTD*4 + passInt*-2 +
          rushYd*0.1 + rushTD*6 + rec*1 + recYd*0.1 + recTD*6
        );
        if (opp !== "?" && (fpts > 0 || recYd > 0 || rushYd > 0 || passYd > 0)) {
          games.push({ opp, fpts, rec, recYd, recTD, rushYd, rushTD, passYd, passTD, passInt });
        }
      }
    }
    return games;
  } catch (_) { return []; }
}

function calcPlayerSeasonProjection(allStats, forYear) {
  if (!allStats) return 0;
  const prior = Object.keys(allStats).map(Number).filter(y => y < forYear).sort((a,b)=>b-a).slice(0,3);
  if (!prior.length) return 0;
  const weights = [0.55, 0.30, 0.15];
  let proj = 0, wt = 0;
  for (let i = 0; i < prior.length; i++) {
    const s = allStats[prior[i]];
    if (s?.fpts > 0) { proj += s.fpts * weights[i]; wt += weights[i]; }
  }
  return wt > 0 ? Math.round(proj / wt) : 0;
}

// ── Scoring format labels ─────────────────────────────────────────────────────
const SCORING_OPTS = [
  { key: "ppr",  label: "PPR"  },
  { key: "half", label: "½ PPR" },
  { key: "std",  label: "Std"  },
];
const TD_OPTS = [
  { key: 4, label: "4pt TD" },
  { key: 6, label: "6pt TD" },
];

const SORT_OPTS = [
  ["projection", "Overall"],
  ["ceiling",    "Ceiling ▲"],
  ["floor",      "Floor ▼"],
  ["usage",      "Usage"],
  ["highValue",  "High-Value"],
  ["efficiency", "Efficiency"],
  ["recency",    "Recency"],
];

const projColor = v => v >= 7 ? "var(--lm)" : v >= 5 ? "var(--gd)" : v >= 3 ? "var(--em)" : "var(--rs)";

// ── Rankings table row (collapsed) ────────────────────────────────────────────
function RankRow({ p, rank, expanded, setExpanded, goT, goP }) {
  const isOpen = expanded === p.id;
  const pc     = posColor(p.pos);
  return (
    <>
      <tr
        className={`rank-row${isOpen ? " expanded" : ""}${rank === 1 ? " r1" : rank === 2 ? " r2" : rank === 3 ? " r3" : ""}`}
        onClick={() => setExpanded(isOpen ? null : p.id)}
      >
        <td style={{ ...td, color: "var(--dm)", fontWeight: 700, fontSize: 12, width: 36 }}>{rank}</td>

        {/* Player */}
        <td style={td}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src={p.hs} alt={p.nm} width={40} height={40} className="headshot"
              onClick={e => { e.stopPropagation(); goP(p.id); }}
              onError={e => { e.target.style.opacity = ".2"; }}
            />
            <div>
              <div
                style={{ fontWeight: 800, fontSize: 14, cursor: "pointer" }}
                onClick={e => { e.stopPropagation(); goP(p.id); }}
              >
                {p.nm}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                <span style={{
                  fontSize: 10, color: "var(--dm)", background: "rgba(255,255,255,.06)",
                  borderRadius: 4, padding: "1px 5px", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: .3,
                }}>
                  {p.role}
                </span>
                <span style={{ fontSize: 10, color: confColor(p.confidence), fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {Math.round(p.confidence * 100)}% conf
                </span>
              </div>
            </div>
          </div>
        </td>

        {/* Pos */}
        <td style={{ ...td, width: 46 }}>
          <Pil ch={p.pos} c={pc} s={{ padding: "2px 7px", fontSize: 10 }} />
        </td>

        {/* Team */}
        <td style={{ ...td, width: 60 }}>
          <div
            style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}
            onClick={e => { e.stopPropagation(); goT(p.tm); }}
          >
            <TeamLogo ab={p.tm} sz={22} />
            <span style={{ fontSize: 12, color: "var(--dm)" }}>{p.tm}</span>
          </div>
        </td>

        {/* Projection + range bar */}
        <td style={{ ...td, width: 170 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 24,
              color: projColor(p.projection), minWidth: 36, lineHeight: 1,
            }}>
              {p.projection}
            </span>
            <div>
              <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 10, color: "var(--rs)", fontFamily: "'Barlow Condensed', sans-serif" }}>▼{p.floor}</span>
                <span style={{ fontSize: 10, color: "var(--lm)", fontFamily: "'Barlow Condensed', sans-serif" }}>▲{p.ceiling}</span>
              </div>
              <div style={{
                width: 70, height: 5, background: "rgba(255,255,255,.06)",
                borderRadius: 99, position: "relative", overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute",
                  left: `${(p.floor / 10) * 100}%`,
                  width: `${((p.ceiling - p.floor) / 10) * 100}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, var(--rs), var(--lm))",
                  borderRadius: 99,
                }} />
                <div style={{
                  position: "absolute",
                  left: `${(p.projection / 10) * 100 - 1}%`,
                  width: 2, height: "100%",
                  background: "var(--tx)", borderRadius: 1,
                }} />
              </div>
            </div>
          </div>
        </td>

        {/* Component mini-bars */}
        <td style={td}>
          <MiniBarLocal val={p.usage}      color="var(--em)" />
        </td>
        <td style={td}>
          <MiniBarLocal val={p.highValue}  color="var(--vi)" />
        </td>
        <td style={td}>
          <MiniBarLocal val={p.efficiency} color="var(--sk)" />
        </td>
        <td style={td}>
          <MiniBarLocal val={p.recency}    color="var(--lm)" />
        </td>

        <td style={{ ...td, textAlign: "center", color: "var(--dm)", fontSize: 12, userSelect: "none" }}>
          {isOpen ? "▲" : "▼"}
        </td>
      </tr>

      {/* Expanded detail row */}
      {isOpen && (
        <tr>
          <td colSpan={10} style={{ padding: "16px 18px", background: "rgba(0,0,0,.18)", borderBottom: "1px solid var(--bd)" }}>
            <ExpandedRow p={p} goP={goP} />
          </td>
        </tr>
      )}
    </>
  );
}

// Simple mini bar for score 0-10
function MiniBarLocal({ val, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 80 }}>
      <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,.07)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${(val / 10) * 100}%`, height: "100%", background: color, borderRadius: 99, transition: "width .4s" }} />
      </div>
      <span style={{ fontSize: 11, color: "var(--dm)", minWidth: 28, textAlign: "right", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: .5 }}>
        {val}
      </span>
    </div>
  );
}

// ── Expanded breakdown row ────────────────────────────────────────────────────
function ExpandedRow({ p, goP }) {
  const rs = p.recentStats;
  const gp = rs?.gp || 1;
  const perGame = (val, div) => div > 0 ? (val / div).toFixed(1) : "—";

  return (
    <>
      {/* Headline */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 1.5, color: "var(--em)" }}>{p.nm}</span>
        {[
          ["PROJ",  p.projection, "var(--gd)"],
          ["FLOOR", p.floor,      "var(--rs)"],
          ["CEIL",  p.ceiling,    "var(--lm)"],
          ["CONF",  `${Math.round(p.confidence * 100)}%`, confColor(p.confidence)],
          ["BOOM",  `${p.boomPct}%`, "var(--vi)"],
          ["BUST",  `${p.bustPct}%`, "var(--rs)"],
        ].map(([lbl, val, clr]) => (
          <span key={lbl} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, color: clr, letterSpacing: 1 }}>
            {lbl} {val}
          </span>
        ))}
        <Pil ch={p.role} c={posColor(p.pos)} s={{ fontSize: 10, fontWeight: 700 }} />
      </div>

      {/* Note */}
      {p.note && (
        <div style={{
          fontSize: 12, color: "var(--dm)", fontStyle: "italic",
          marginBottom: 12, lineHeight: 1.6,
          borderLeft: "2px solid var(--em)", paddingLeft: 10,
        }}>
          {p.note}
        </div>
      )}

      {/* 6 component cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10, marginBottom: 14 }}>
        {[
          {
            key: "usage", label: "USAGE (35%)", color: "var(--em)", score: p.usage,
            detail: rs ? (
              p.pos === "QB" ? `${perGame(rs.passAtt || 0, gp)} att/g · percentile vs QB peers`
              : p.pos === "RB" ? `${perGame((rs.rushAtt || 0) + (rs.rec || 0), gp)} touches/g · vs RB peers`
              : `${perGame(rs.tgt || 0, gp)} tgt/g · vs ${p.pos} peers`
            ) : "Insufficient data",
          },
          {
            key: "highValue", label: "HIGH-VALUE (20%)", color: "var(--vi)", score: p.highValue,
            detail: rs ? (
              p.pos === "QB" ? `${rs.passTD || 0} TD · ${rs.rushYd || 0} rush yds — TD equity + mobility`
              : p.pos === "RB" ? `${rs.rushTD || 0} rush TD · ${rs.rec || 0} rec — goal-line + pass-game`
              : `${perGame(rs.recYd || 0, Math.max(rs.tgt || 1, 1))} yds/tgt · ${rs.recTD || 0} TD`
            ) : "Insufficient data",
          },
          {
            key: "efficiency", label: "EFFICIENCY (15%)", color: "var(--sk)", score: p.efficiency,
            detail: rs ? (
              p.pos === "QB" ? `${perGame(rs.passYd || 0, Math.max(rs.passAtt || 1, 1))} yds/att · ${rs.passTD || 0}TD/${rs.passInt || 0}INT`
              : p.pos === "RB" ? `${perGame(rs.rushYd || 0, Math.max(rs.rushAtt || 1, 1))} yds/carry · ${rs.fpts || 0} fpts`
              : `${perGame(rs.recYd || 0, Math.max(rs.tgt || rs.rec || 1, 1))} yds/tgt · ${rs.fpts || 0} fpts`
            ) : "Insufficient data",
          },
          {
            key: "recency", label: "RECENCY (15%)", color: "var(--lm)", score: p.recency,
            detail: p.recentYear
              ? `Weighted 3-yr avg fpts/g (55/30/15%) · ${p.recentYear} base · conf ${Math.round(p.confidence * 100)}%`
              : "Insufficient history",
          },
          {
            key: "environment", label: "ENVIRONMENT (10%)", color: "var(--gd)", score: p.environment,
            detail: "Depth chart position · team offensive quality from 2025 standings",
          },
          {
            key: "matchup", label: "MATCHUP (5%)", color: "rgba(255,255,255,.4)", score: p.matchup,
            detail: "League-average placeholder (5.0) — upgrade with weekly opponent DVOA/EPA data",
          },
        ].map(item => (
          <div key={item.key} style={{
            background: "rgba(255,255,255,.03)", border: `1px solid ${item.color}22`,
            borderRadius: 10, padding: "10px 13px",
          }}>
            <div style={{ fontSize: 10, color: item.color, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: .8, marginBottom: 3 }}>
              {item.label}
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: item.color, lineHeight: 1, marginBottom: 4 }}>
              {item.score}
            </div>
            <div style={{ fontSize: 11, color: "var(--dm)", lineHeight: 1.4 }}>{item.detail}</div>
          </div>
        ))}
      </div>

      {/* Formula lines */}
      <div style={{ fontSize: 12, color: "var(--dm)", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: .3, marginBottom: 8 }}>
        <span style={{ color: "var(--tx)", fontWeight: 600 }}>Projection = </span>
        <span style={{ color: "var(--em)" }}>{p.usage}×0.35</span> +{" "}
        <span style={{ color: "var(--vi)" }}>{p.highValue}×0.20</span> +{" "}
        <span style={{ color: "var(--sk)" }}>{p.efficiency}×0.15</span> +{" "}
        <span style={{ color: "var(--lm)" }}>{p.recency}×0.15</span> +{" "}
        <span style={{ color: "var(--gd)" }}>{p.environment}×0.10</span> +{" "}
        <span style={{ color: "rgba(255,255,255,.4)" }}>{p.matchup}×0.05</span>
        <span style={{ color: "var(--gd)", fontWeight: 700, fontSize: 14, marginLeft: 8 }}> = {p.projection}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--dm)", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: .3 }}>
        <span style={{ color: "var(--rs)", fontWeight: 600 }}>Floor {p.floor}</span>
        {" "}(usage×0.50 + eff×0.20 + recency×conf×0.15 + env×0.15){"  "}·{"  "}
        <span style={{ color: "var(--lm)", fontWeight: 600 }}>Ceiling {p.ceiling}</span>
        {" "}(highVal×0.45 + usage×0.25 + eff×0.20 + env×0.10){"  "}·{"  "}
        <span style={{ color: "rgba(255,255,255,.5)" }}>Volatility {p.volatility}/10</span>
      </div>

      {/* Stat pills */}
      {rs && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          <Pil ch={`${rs.gp || "?"} GP`} c="var(--tx)" s={{ fontSize: 11 }} />
          {p.pos === "QB" && <>
            <Pil ch={`${(rs.passYd || 0).toLocaleString()} pass yds`} c="var(--em)" s={{ fontSize: 11 }} />
            <Pil ch={`${rs.passTD || 0} TD`}   c="var(--lm)" s={{ fontSize: 11 }} />
            <Pil ch={`${rs.passInt || 0} INT`}  c="var(--rs)" s={{ fontSize: 11 }} />
            <Pil ch={`${rs.passAtt || 0} att`}  c="var(--sk)" s={{ fontSize: 11 }} />
            <Pil ch={`${(rs.rushYd || 0).toLocaleString()} rush yds`} c="var(--vi)" s={{ fontSize: 11 }} />
          </>}
          {p.pos === "RB" && <>
            <Pil ch={`${rs.rushAtt || 0} car`}   c="var(--em)" s={{ fontSize: 11 }} />
            <Pil ch={`${(rs.rushYd || 0).toLocaleString()} rush yds`} c="var(--sk)" s={{ fontSize: 11 }} />
            <Pil ch={`${rs.rushTD || 0} rush TD`} c="var(--lm)" s={{ fontSize: 11 }} />
            <Pil ch={`${rs.rec || 0} rec / ${rs.tgt || "?"} tgt`} c="var(--vi)" s={{ fontSize: 11 }} />
            <Pil ch={`${(rs.recYd || 0).toLocaleString()} rec yds`} c="var(--gd)" s={{ fontSize: 11 }} />
          </>}
          {(p.pos === "WR" || p.pos === "TE") && <>
            <Pil ch={`${rs.tgt || "?"} tgt`}  c="var(--em)" s={{ fontSize: 11 }} />
            <Pil ch={`${rs.rec || 0} rec`}     c="var(--sk)" s={{ fontSize: 11 }} />
            <Pil ch={`${(rs.recYd || 0).toLocaleString()} yds`} c="var(--lm)" s={{ fontSize: 11 }} />
            <Pil ch={`${rs.recTD || 0} TD`}    c="var(--gd)" s={{ fontSize: 11 }} />
            <Pil ch={rs.tgt && rs.rec ? `${(rs.rec / rs.tgt * 100).toFixed(0)}% catch` : "—"} c="var(--vi)" s={{ fontSize: 11 }} />
          </>}
          <Pil ch={`${rs.fpts || 0} FPTS`} c="var(--gd)" s={{ fontSize: 11, fontWeight: 800 }} />
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <button
          onClick={e => { e.stopPropagation(); goP(p.id); }}
          style={{
            padding: "8px 18px", borderRadius: 8, border: "1px solid var(--em)",
            background: "rgba(249,115,22,.12)", color: "var(--em)", cursor: "pointer",
            fontSize: 13, fontWeight: 700, fontFamily: "'Barlow', sans-serif",
          }}
        >
          View Full Profile & Charts →
        </button>
      </div>
    </>
  );
}

// ── Rankings table ────────────────────────────────────────────────────────────
function RankingsTable({ ranked, q, setQ, posFilter, setPosFilter, sortKey, setSortKey, goT, goP }) {
  const [expanded, setExpanded] = useState(null);

  const displayed = useMemo(() => {
    let list = posFilter === "ALL" ? ranked : ranked.filter(p => p.pos === posFilter);
    if (q) {
      const lq = q.toLowerCase();
      list = list.filter(p => p.nm.toLowerCase().includes(lq) || p.tm.toLowerCase().includes(lq));
    }
    const fns = {
      projection: (a,b) => b.projection - a.projection,
      ceiling:    (a,b) => b.ceiling    - a.ceiling,
      floor:      (a,b) => b.floor      - a.floor,
      usage:      (a,b) => b.usage      - a.usage,
      highValue:  (a,b) => b.highValue  - a.highValue,
      efficiency: (a,b) => b.efficiency - a.efficiency,
      recency:    (a,b) => b.recency    - a.recency,
    };
    return [...list].sort(fns[sortKey] || fns.projection);
  }, [ranked, posFilter, q, sortKey]);

  const topCeiling = displayed.length ? Math.max(...displayed.map(p => p.ceiling)) : "—";
  const topFloor   = displayed.length ? Math.max(...displayed.map(p => p.floor))   : "—";

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
        <StCard l="Players Ranked" v={displayed.length} c="var(--em)" />
        <StCard l="Top Projection" v={displayed[0]?.projection ?? "—"} c="var(--lm)" />
        <StCard l="Top Ceiling" v={typeof topCeiling === "number" ? topCeiling.toFixed(2) : topCeiling} c="var(--gd)" />
        <StCard l="Top Floor" v={typeof topFloor === "number" ? topFloor.toFixed(2) : topFloor} c="var(--sk)" />
      </div>

      {/* Main table */}
      <div style={{ background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="rank-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--bd)", background: "rgba(0,0,0,.25)" }}>
                <th style={{ ...th, width: 36 }}>#</th>
                <th style={th}>Player</th>
                <th style={{ ...th, width: 46 }}>Pos</th>
                <th style={{ ...th, width: 60 }}>Team</th>
                <th style={{ ...th, width: 170 }}>Proj · Floor · Ceiling</th>
                <th style={{ ...th, width: 105, color: "var(--em)" }}>
                  Usage <span style={{ fontSize: 9, fontWeight: 400 }}>(35%)</span>
                </th>
                <th style={{ ...th, width: 105, color: "var(--vi)" }}>
                  High-Val <span style={{ fontSize: 9, fontWeight: 400 }}>(20%)</span>
                </th>
                <th style={{ ...th, width: 105, color: "var(--sk)" }}>
                  Efficiency <span style={{ fontSize: 9, fontWeight: 400 }}>(15%)</span>
                </th>
                <th style={{ ...th, width: 105, color: "var(--lm)" }}>
                  Recency <span style={{ fontSize: 9, fontWeight: 400 }}>(15%)</span>
                </th>
                <th style={{ ...th, width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {displayed.map((p, i) => (
                <RankRow
                  key={p.id}
                  p={p}
                  rank={i + 1}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  goT={goT}
                  goP={goP}
                />
              ))}
            </tbody>
          </table>
        </div>
        {displayed.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--dm)" }}>No players match your search.</div>
        )}
      </div>

      <div style={{ marginTop: 12, color: "var(--dm)", fontSize: 12, padding: "0 4px", lineHeight: 1.7 }}>
        Percentile-based scoring within each position · Usage = touches/targets per game · High-Value = TD equity + air yards proxy + target/rush share · Recency = 3-year weighted fpts/game (55/30/15%) · Environment = depth chart + team wins · Floor/Ceiling computed separately · click any row for full breakdown
      </div>
    </div>
  );
}

// ── Player detail view ────────────────────────────────────────────────────────
function PlayerDetail({ pl, stats, statsCache, setStatsCache, goT, TM }) {
  const [yr, setYr] = useState(null);
  const [gameLog, setGameLog] = useState([]);
  const [fetchingLog, setFetchingLog] = useState(false);

  const seasons = stats ? Object.entries(stats).sort((a, b) => +a[0] - +b[0]) : [];
  const ay = yr || (seasons.length ? seasons[seasons.length - 1][0] : null);
  const st = stats?.[ay];

  useEffect(() => {
    setYr(null);
    setFetchingLog(true);
    fetchPlayerGameLog(pl.id, 2024).then(log => {
      setGameLog(log || []);
      setFetchingLog(false);
    }).catch(() => {
      setGameLog([]);
      setFetchingLog(false);
    });
  }, [pl.id]);

  const chartData = seasons.map(([y, s]) => ({
    year: y,
    "Fantasy Pts": s.fpts || 0,
    "Projected PPR": calcPlayerSeasonProjection(stats, +y),
    "Pass Yds": s.passYd || 0,
    "Rush Yds": s.rushYd || 0,
    "Rec Yds":  s.recYd  || 0,
    "Pass TD":  s.passTD || 0,
    "Rush TD":  s.rushTD || 0,
    "Rec TD":   s.recTD  || 0,
    "Receptions": s.rec  || 0,
    "INT":      s.passInt || 0,
  }));

  const matchupData = useMemo(() => {
    if (!gameLog.length) return [];
    const totals = {};
    for (const g of gameLog) {
      if (!totals[g.opp]) totals[g.opp] = { total: 0, count: 0 };
      totals[g.opp].total += g.fpts;
      totals[g.opp].count += 1;
    }
    return Object.entries(totals)
      .map(([opp, d]) => ({ opp, avg: +(d.total / d.count).toFixed(1), games: d.count }))
      .sort((a, b) => b.avg - a.avg);
  }, [gameLog]);

  const teamData = TM?.[pl.tm] || {};

  return (
    <div className="fu">
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg,${teamData.c1 || "#F97316"}20,var(--s1))`,
        border: "1px solid var(--bd)", borderRadius: 14, padding: 18, marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Headshot src={pl.hs} sz={80} />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, letterSpacing: 2, lineHeight: 1 }}>
              {pl.nm}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
              <Pil ch={pl.pos} c={posColor(pl.pos)} />
              <span
                style={{ cursor: "pointer", color: "var(--dm)", fontSize: 14, textDecoration: "underline" }}
                onClick={() => goT(pl.tm)}
              >
                {teamData.c} {teamData.n}
              </span>
              <span style={{ color: "var(--dm)", fontSize: 14 }}>
                #{pl.n}{pl.age ? ` • Age ${pl.age}` : ""}{pl.exp ? ` • ${pl.exp}yr exp` : ""}
              </span>
            </div>
          </div>
          <TeamLogo ab={pl.tm} sz={50} />
        </div>
        {seasons.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 12, flexWrap: "wrap" }}>
            {seasons.map(([y]) => (
              <button key={y} onClick={() => setYr(y)} style={{
                padding: "5px 11px", borderRadius: 7, border: "none",
                background: ay === y ? "var(--em)" : "rgba(255,255,255,.05)",
                color: ay === y ? "#000" : "var(--tx)",
                fontWeight: ay === y ? 800 : 500, fontSize: 13, cursor: "pointer",
              }}>{y}</button>
            ))}
          </div>
        )}
      </div>

      {!stats || seasons.length === 0 ? (
        <div style={{ background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 14, padding: 36, textAlign: "center", color: "var(--dm)" }}>
          No historical stats found. Player may be a rookie or data unavailable.
        </div>
      ) : (
        <>
          {/* Stat cards */}
          {st && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <StCard l="GP" v={st.gp || "—"} c="var(--tx)" />
              {pl.pos === "QB" && <>
                <StCard l="Pass Yds" v={st.passYd?.toLocaleString()} c="var(--em)" />
                <StCard l="Pass TD"  v={st.passTD}  c="var(--lm)" />
                <StCard l="INT"      v={st.passInt}  c="var(--rs)" />
                <StCard l="Rush Yds" v={st.rushYd?.toLocaleString()} c="var(--sk)" />
                <StCard l="Rush TD"  v={st.rushTD}   c="var(--vi)" />
                <StCard l="Rating"   v={st.passRat ? st.passRat.toFixed(1) : "—"} c="var(--gd)" />
              </>}
              {pl.pos === "RB" && <>
                <StCard l="Rush Yds" v={st.rushYd?.toLocaleString()} c="var(--em)" />
                <StCard l="Rush TD"  v={st.rushTD}   c="var(--lm)" />
                <StCard l="Rec"      v={st.rec}       c="var(--sk)" />
                <StCard l="Rec Yds"  v={st.recYd?.toLocaleString()} c="var(--vi)" />
                <StCard l="Rec TD"   v={st.recTD}     c="var(--gd)" />
              </>}
              {(pl.pos === "WR" || pl.pos === "TE") && <>
                <StCard l="Rec"     v={st.rec}       c="var(--em)" />
                <StCard l="Rec Yds" v={st.recYd?.toLocaleString()} c="var(--sk)" />
                <StCard l="Rec TD"  v={st.recTD}     c="var(--lm)" />
                <StCard l="Rush Yds" v={st.rushYd?.toLocaleString() || "0"} c="var(--vi)" />
                <StCard l="Rush TD"  v={st.rushTD || 0} c="var(--gd)" />
              </>}
              <StCard l="FPTS" v={st.fpts} c="var(--gd)" />
            </div>
          )}

          {/* Charts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 14, padding: 14 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, marginBottom: 10 }}>FANTASY POINTS (PPR)</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="fpGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#F97316" stopOpacity={.3} />
                      <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                  <XAxis dataKey="year" /><YAxis />
                  <Tooltip content={<ChartTT />} />
                  <Area type="monotone" dataKey="Fantasy Pts" stroke="#F97316" fill="url(#fpGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 14, padding: 14 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, marginBottom: 10 }}>YARDS BY SEASON</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                  <XAxis dataKey="year" /><YAxis />
                  <Tooltip content={<ChartTT />} /><Legend iconSize={10} />
                  {pl.pos === "QB" && <Bar dataKey="Pass Yds" fill="#F97316" radius={[3,3,0,0]} />}
                  <Bar dataKey="Rush Yds" fill="#22C55E" radius={[3,3,0,0]} />
                  <Bar dataKey="Rec Yds"  fill="#38BDF8" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 14, padding: 14 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, marginBottom: 10 }}>TOUCHDOWNS BY SEASON</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                  <XAxis dataKey="year" /><YAxis />
                  <Tooltip content={<ChartTT />} /><Legend iconSize={10} />
                  {pl.pos === "QB" && <Line type="monotone" dataKey="Pass TD" stroke="#F97316" strokeWidth={2} dot={{ fill: "#F97316", r: 4 }} />}
                  <Line type="monotone" dataKey="Rush TD" stroke="#22C55E" strokeWidth={2} dot={{ fill: "#22C55E", r: 4 }} />
                  <Line type="monotone" dataKey="Rec TD"  stroke="#38BDF8" strokeWidth={2} dot={{ fill: "#38BDF8", r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 14, padding: 14 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, marginBottom: 10 }}>
                PROJECTED vs ACTUAL (PPR)
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                  <XAxis dataKey="year" /><YAxis />
                  <Tooltip content={<ChartTT />} /><Legend iconSize={10} />
                  <Line type="monotone" dataKey="Fantasy Pts"    stroke="#F97316" strokeWidth={2.5} dot={{ fill: "#F97316", r: 4 }} name="Actual PPR" />
                  <Line type="monotone" dataKey="Projected PPR"  stroke="#38BDF8" strokeWidth={2} strokeDasharray="6 3" dot={{ fill: "#38BDF8", r: 3 }} name="Proj PPR" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Matchup chart */}
          <div style={{ background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 14, padding: 14, marginBottom: 12 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, marginBottom: 4 }}>AVG PPR POINTS VS OPPONENT (2024)</div>
            <div style={{ color: "var(--dm)", fontSize: 12, marginBottom: 10 }}>Average fantasy points scored against each team faced — sorted highest to lowest</div>
            {fetchingLog ? (
              <Spinner msg="Loading game log..." />
            ) : matchupData.length === 0 ? (
              <div style={{ color: "var(--dm)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                Game log data not available for this player.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, matchupData.length * 28)}>
                <BarChart data={matchupData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="opp" type="category" width={44} tick={{ fontSize: 12 }} />
                  <Tooltip content={<ChartTT />} />
                  <Bar dataKey="avg" name="Avg PPR" radius={[0, 4, 4, 0]}>
                    {matchupData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.avg >= 20 ? "#22C55E" : entry.avg >= 10 ? "#F97316" : "#F43F5E"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Injury section */}
          <InjurySection playerId={pl.id} stats={stats} />

          {/* Career stats table */}
          <div style={{ background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 14, padding: 14, overflowX: "auto" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, marginBottom: 10 }}>CAREER STATS (2017–2025)</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--bd)" }}>
                  <th style={th}>Year</th><th style={th}>GP</th>
                  <th style={th}>Pass Yd</th><th style={th}>P-TD</th><th style={th}>INT</th>
                  <th style={th}>Rush Yd</th><th style={th}>R-TD</th>
                  <th style={th}>Rec</th><th style={th}>Rec Yd</th><th style={th}>Re-TD</th>
                  <th style={th}>FPTS</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map(([y, s]) => (
                  <tr key={y} onClick={() => setYr(y)} style={{
                    borderBottom: "1px solid var(--bd)", cursor: "pointer",
                    background: ay === y ? "rgba(249,115,22,.06)" : "transparent",
                  }}>
                    <td style={td}><strong>{y}</strong></td>
                    <td style={td}>{s.gp || "—"}</td>
                    <td style={td}>{s.passYd ? s.passYd.toLocaleString() : "—"}</td>
                    <td style={{ ...td, color: s.passTD ? "var(--lm)" : "var(--dm)" }}>{s.passTD || "—"}</td>
                    <td style={{ ...td, color: s.passInt ? "var(--rs)" : "var(--dm)" }}>{s.passInt || "—"}</td>
                    <td style={td}>{s.rushYd ? s.rushYd.toLocaleString() : "—"}</td>
                    <td style={{ ...td, color: s.rushTD ? "var(--lm)" : "var(--dm)" }}>{s.rushTD || "—"}</td>
                    <td style={td}>{s.rec || "—"}</td>
                    <td style={td}>{s.recYd ? s.recYd.toLocaleString() : "—"}</td>
                    <td style={{ ...td, color: s.recTD ? "var(--lm)" : "var(--dm)" }}>{s.recTD || "—"}</td>
                    <td style={{ ...td, color: "var(--gd)", fontWeight: 700 }}>{s.fpts || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Players page ─────────────────────────────────────────────────────────
export default function Players({
  players, loading, sel, setSel,
  statsCache, setStatsCache,
  goT, goP, TM,
}) {
  const [q,          setQ]          = useState("");
  const [posFilter,  setPosFilter]  = useState("ALL");
  const [sortKey,    setSortKey]    = useState("projection");
  const [scoring,    setScoring]    = useState(DEFAULT_FORMAT.scoring);
  const [tdPts,      setTdPts]      = useState(DEFAULT_FORMAT.tdPts);
  const [mainView,   setMainView]   = useState("players"); // "players" | "rankings"

  const format = useMemo(() => ({ scoring, tdPts }), [scoring, tdPts]);

  // Recompute cache for selected format (memoized so it's only recalculated on format change)
  const formatCache = useMemo(
    () => recomputeStatsCache(statsCache, format),
    [statsCache, format]
  );

  const ranked = useMemo(
    () => {
      if (loading || !players.length) return [];
      return rankPlayersV2(players, formatCache, STATIC_DEPTH_CHARTS, STATIC_STANDINGS_25, format);
    },
    [players, formatCache, format, loading]
  );

  const pl = sel ? players.find(p => p.id === sel) : null;

  // When in Rankings sub-view and no player selected, render Rankings page directly
  if (mainView === "rankings" && !sel) {
    return (
      <div className="fu page-wrap">
        {/* Sub-tab strip */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[["players","Player List"],["rankings","Tier Rankings"]].map(([k,l]) => (
            <button key={k} onClick={() => setMainView(k)} style={{
              padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: "'Barlow', sans-serif", fontSize: 13, fontWeight: k === mainView ? 800 : 600,
              background: k === mainView ? "var(--em)" : "rgba(255,255,255,.06)",
              color: k === mainView ? "#000" : "var(--dm)", transition: "all .13s",
            }}>{l}</button>
          ))}
        </div>
        <RankingsPage players={players} loading={loading} statsCache={statsCache} goP={goP} goT={goT} />
      </div>
    );
  }

  return (
    <div className="fu page-wrap">
      {/* ── Sub-tab strip (only when not in player detail) ── */}
      {!sel && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[["players","Player List"],["rankings","Tier Rankings"]].map(([k,l]) => (
            <button key={k} onClick={() => setMainView(k)} style={{
              padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: "'Barlow', sans-serif", fontSize: 13, fontWeight: k === mainView ? 800 : 600,
              background: k === mainView ? "var(--em)" : "rgba(255,255,255,.06)",
              color: k === mainView ? "#000" : "var(--dm)", transition: "all .13s",
            }}>{l}</button>
          ))}
        </div>
      )}

      {/* ── Page header ── */}
      <div style={{
        background: "var(--s1)", border: "1px solid var(--bd)",
        borderRadius: 14, padding: 18, marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
          <div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 1.5, marginBottom: 4 }}>
              {pl ? pl.nm : "PLAYERS & RANKINGS"}
            </h2>
            {!pl && (
              <p style={{ color: "var(--dm)", fontSize: 13, lineHeight: 1.7 }}>
                <span style={{ color: "var(--em)", fontWeight: 700 }}>35% Usage</span> ·{" "}
                <span style={{ color: "var(--vi)", fontWeight: 700 }}>20% High-Value</span> ·{" "}
                <span style={{ color: "var(--sk)", fontWeight: 700 }}>15% Efficiency</span> ·{" "}
                <span style={{ color: "var(--lm)", fontWeight: 700 }}>15% Recency</span> ·{" "}
                <span style={{ color: "var(--gd)", fontWeight: 700 }}>10% Environment</span>
                <span style={{ color: "var(--dm)", fontSize: 11 }}> · percentile-scaled · click any row for breakdown</span>
              </p>
            )}
          </div>

          {/* Scoring format controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
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
            <div className="scoring-strip">
              {TD_OPTS.map(o => (
                <button
                  key={o.key}
                  className={`scoring-btn${tdPts === o.key ? " active" : ""}`}
                  onClick={() => setTdPts(o.key)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filters + search */}
        {!pl && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search player or team…"
              className="search-input"
            />

            {/* Pos filter */}
            <div style={{ display: "flex", gap: 4 }}>
              {["ALL", "QB", "RB", "WR", "TE"].map(p => (
                <button key={p} onClick={() => setPosFilter(p)} style={{
                  padding: "6px 13px", borderRadius: 7, border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 600,
                  background: posFilter === p ? (p === "ALL" ? "var(--em)" : posColor(p)) : "rgba(255,255,255,.05)",
                  color: posFilter === p ? "#000" : "var(--dm)",
                }}>
                  {p}
                </button>
              ))}
            </div>

            {/* Sort */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {SORT_OPTS.map(([k, l]) => (
                <button key={k} onClick={() => setSortKey(k)} style={{
                  padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer",
                  fontSize: 12, whiteSpace: "nowrap",
                  background: sortKey === k ? "var(--em)" : "rgba(255,255,255,.05)",
                  color: sortKey === k ? "#000" : "var(--dm)",
                  fontWeight: sortKey === k ? 800 : 500,
                }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Back to rankings button when in detail view */}
        {pl && (
          <button
            onClick={() => setSel(null)}
            style={{
              padding: "7px 16px", borderRadius: 8, border: "1px solid var(--bd)",
              background: "rgba(255,255,255,.05)", color: "var(--dm)",
              cursor: "pointer", fontSize: 13, fontFamily: "'Barlow', sans-serif",
            }}
          >
            ← Back to Rankings
          </button>
        )}
      </div>

      {/* ── Body layout: main + sidebar ── */}
      {loading ? (
        <Spinner msg="Loading roster data..." />
      ) : (
        <div className="players-layout">
          {/* Main content */}
          <main>
            {pl ? (
              <PlayerDetail
                pl={pl}
                stats={statsCache[pl.id]}
                statsCache={statsCache}
                setStatsCache={setStatsCache}
                goT={goT}
                TM={TM}
              />
            ) : (
              <RankingsTable
                ranked={ranked}
                q={q}
                setQ={setQ}
                posFilter={posFilter}
                setPosFilter={setPosFilter}
                sortKey={sortKey}
                setSortKey={setSortKey}
                goT={goT}
                goP={goP}
              />
            )}
          </main>

          {/* Right sidebar */}
          <Sidebar ranked={ranked} players={players} goP={goP} />
        </div>
      )}
    </div>
  );
}
