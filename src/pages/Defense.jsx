import { useState, useEffect, useMemo } from "react";
import { STATIC_DEPTH_CHARTS } from "../data/teamData.js";
import { TeamLogo, Headshot, Pil, posColor } from "../components/ui.jsx";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

// All 32 teams
const ALL_TEAMS = [
  "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE",
  "DAL","DEN","DET","GB","HOU","IND","JAX","KC",
  "LAC","LAR","LV","MIA","MIN","NE","NO","NYG",
  "NYJ","PHI","PIT","SF","SEA","TB","TEN","WAS",
];

const TM_META = {
  ARI:{n:"Cardinals",c:"Arizona",c1:"#97233F"},ATL:{n:"Falcons",c:"Atlanta",c1:"#A71930"},
  BAL:{n:"Ravens",c:"Baltimore",c1:"#241773"},BUF:{n:"Bills",c:"Buffalo",c1:"#00338D"},
  CAR:{n:"Panthers",c:"Carolina",c1:"#0085CA"},CHI:{n:"Bears",c:"Chicago",c1:"#0B162A"},
  CIN:{n:"Bengals",c:"Cincinnati",c1:"#FB4F14"},CLE:{n:"Browns",c:"Cleveland",c1:"#311D00"},
  DAL:{n:"Cowboys",c:"Dallas",c1:"#003594"},DEN:{n:"Broncos",c:"Denver",c1:"#FB4F14"},
  DET:{n:"Lions",c:"Detroit",c1:"#0076B6"},GB:{n:"Packers",c:"Green Bay",c1:"#203731"},
  HOU:{n:"Texans",c:"Houston",c1:"#03202F"},IND:{n:"Colts",c:"Indianapolis",c1:"#002C5F"},
  JAX:{n:"Jaguars",c:"Jacksonville",c1:"#006778"},KC:{n:"Chiefs",c:"Kansas City",c1:"#E31837"},
  LV:{n:"Raiders",c:"Las Vegas",c1:"#000000"},LAC:{n:"Chargers",c:"Los Angeles",c1:"#0080C6"},
  LAR:{n:"Rams",c:"Los Angeles",c1:"#003594"},MIA:{n:"Dolphins",c:"Miami",c1:"#008E97"},
  MIN:{n:"Vikings",c:"Minnesota",c1:"#4F2683"},NE:{n:"Patriots",c:"New England",c1:"#002244"},
  NO:{n:"Saints",c:"New Orleans",c1:"#D3BC8D"},NYG:{n:"Giants",c:"New York",c1:"#0B2265"},
  NYJ:{n:"Jets",c:"New York",c1:"#125740"},PHI:{n:"Eagles",c:"Philadelphia",c1:"#004C54"},
  PIT:{n:"Steelers",c:"Pittsburgh",c1:"#FFB612"},SF:{n:"49ers",c:"San Francisco",c1:"#AA0000"},
  SEA:{n:"Seahawks",c:"Seattle",c1:"#002244"},TB:{n:"Buccaneers",c:"Tampa Bay",c1:"#D50A0A"},
  TEN:{n:"Titans",c:"Tennessee",c1:"#0C2340"},WAS:{n:"Commanders",c:"Washington",c1:"#5A1414"},
};

// ESPN team ID map
const ESPN_TID = {
  ARI:22,ATL:1,BAL:33,BUF:2,CAR:29,CHI:3,CIN:4,CLE:5,DAL:6,DEN:7,DET:8,
  GB:9,HOU:34,IND:11,JAX:30,KC:12,LAC:24,LAR:14,LV:13,MIA:15,MIN:16,
  NE:17,NO:18,NYG:19,NYJ:20,PHI:21,PIT:23,SF:25,SEA:26,TB:27,TEN:10,WAS:28,
};

// Matchup grade from average FPTS allowed (higher = easier matchup for offense)
function matchupGrade(avg, pos) {
  const baseline = { QB: 22, RB: 12, WR: 12, TE: 8 };
  const ratio = avg / (baseline[pos] || 12);
  if (ratio >= 1.25) return { grade: "A+", color: "#22C55E" };
  if (ratio >= 1.10) return { grade: "A",  color: "#4ADE80" };
  if (ratio >= 1.00) return { grade: "B+", color: "#86EFAC" };
  if (ratio >= 0.90) return { grade: "B",  color: "#F59E0B" };
  if (ratio >= 0.80) return { grade: "C",  color: "#FB923C" };
  if (ratio >= 0.70) return { grade: "D",  color: "#F43F5E" };
  return { grade: "F",  color: "#BE185D" };
}

// Fetch game logs for a player from ESPN
async function fetchGameLog(pid, season = 2024) {
  try {
    const r = await fetch(`${SITE}/athletes/${pid}/gamelog?season=${season}`);
    if (!r.ok) return [];
    const data = await r.json();
    const games = [];
    for (const st of data.seasonTypes || []) {
      if (st.type !== 2 && st.seasonType !== 2) continue;
      const catNames = st.names || data.names || [];
      for (const ev of (st.events || [])) {
        const statsArr = ev.stats || [];
        const raw = {};
        catNames.forEach((n, i) => { raw[n] = parseFloat(statsArr[i]) || 0; });
        const opp = ev.opponent?.abbreviation || "?";
        const rec    = raw.receptions || 0;
        const recYd  = raw.receivingYards || 0;
        const recTD  = raw.receivingTouchdowns || 0;
        const rushYd = raw.rushingYards || 0;
        const rushTD = raw.rushingTouchdowns || 0;
        const passYd = raw.passingYards || 0;
        const passTD = raw.passingTouchdowns || 0;
        const passInt = raw.interceptions || 0;
        const fpts = passYd*0.04 + passTD*4 + passInt*(-2) + rushYd*0.1 + rushTD*6 + rec*1 + recYd*0.1 + recTD*6;
        if (opp !== "?" && fpts > 0) {
          games.push({ opp, fpts: +fpts.toFixed(1), rec, recYd, recTD, rushYd, rushTD, passYd, passTD, passInt });
        }
      }
    }
    return games;
  } catch { return []; }
}

// Fetch defensive roster from ESPN
async function fetchDefRoster(ab) {
  const tid = ESPN_TID[ab];
  if (!tid) return [];
  try {
    const r = await fetch(`${SITE}/teams/${tid}/roster`);
    if (!r.ok) return [];
    const data = await r.json();
    const DEF_POS = new Set(["DE","DT","NT","LB","MLB","OLB","ILB","CB","S","FS","SS","DB","EDGE"]);
    const players = [];
    for (const group of (data.athletes || [])) {
      for (const p of (group.items || [])) {
        const pos = p.position?.abbreviation;
        if (!DEF_POS.has(pos)) continue;
        players.push({
          id: p.id,
          nm: p.displayName || p.fullName,
          pos,
          jersey: p.jersey || "",
          hs: p.headshot?.href || `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${p.id}.png&w=350&h=254`,
        });
      }
    }
    return players;
  } catch { return []; }
}

// ── FPTA Overview table ───────────────────────────────────────────────────────
function FPTATable({ fptaData, sortPos, setSortPos }) {
  const POSITIONS = ["QB", "RB", "WR", "TE"];

  // Sort teams by avg FPTA for selected pos (desc = most fantasy points allowed)
  const sorted = useMemo(() => {
    return [...ALL_TEAMS].sort((a, b) => {
      const av = fptaData[a]?.[sortPos] ?? 0;
      const bv = fptaData[b]?.[sortPos] ?? 0;
      return bv - av;
    });
  }, [fptaData, sortPos]);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {POSITIONS.map(pos => (
          <button
            key={pos}
            onClick={() => setSortPos(pos)}
            style={{
              padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 700,
              background: sortPos === pos ? posColor(pos) : "rgba(255,255,255,.06)",
              color: sortPos === pos ? "#000" : "var(--dm)",
              transition: "all .13s",
            }}
          >
            VS {pos}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "var(--dm)", display: "flex", alignItems: "center" }}>
          Avg FPTS allowed/game · 2024 season · higher = easier matchup
        </div>
      </div>

      <div style={{ background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(0,0,0,.28)", borderBottom: "2px solid var(--bd)" }}>
                <th style={{ padding: "9px 12px", textAlign: "left", fontSize: 10, color: "var(--dm)", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: .7, textTransform: "uppercase" }}>
                  Rank
                </th>
                <th style={{ padding: "9px 12px", textAlign: "left", fontSize: 10, color: "var(--dm)", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: .7, textTransform: "uppercase" }}>
                  Defense
                </th>
                {POSITIONS.map(pos => (
                  <th
                    key={pos}
                    onClick={() => setSortPos(pos)}
                    style={{
                      padding: "9px 12px", textAlign: "center",
                      fontSize: 10, color: sortPos === pos ? posColor(pos) : "var(--dm)",
                      fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: .7,
                      textTransform: "uppercase", cursor: "pointer",
                      fontWeight: sortPos === pos ? 800 : 600,
                    }}
                  >
                    VS {pos}
                    {sortPos === pos && " ▼"}
                  </th>
                ))}
                <th style={{ padding: "9px 12px", textAlign: "center", fontSize: 10, color: "var(--dm)", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: .7, textTransform: "uppercase" }}>
                  Grade
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((ab, i) => {
                const d = fptaData[ab] || {};
                const { grade, color } = matchupGrade(d[sortPos] || 0, sortPos);
                const tm = TM_META[ab] || {};
                return (
                  <tr key={ab} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}
                    className="rank-row">
                    <td style={{ padding: "8px 12px", width: 48 }}>
                      <span style={{
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontSize: 13, fontWeight: 800,
                        color: i < 3 ? "#F59E0B" : "var(--dm)",
                      }}>{i + 1}</span>
                    </td>
                    <td style={{ padding: "8px 12px", minWidth: 180 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <TeamLogo ab={ab} sz={30} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{tm.c} {tm.n}</div>
                          <div style={{ fontSize: 11, color: "var(--dm)" }}>
                            {ab} Defense
                          </div>
                        </div>
                      </div>
                    </td>
                    {POSITIONS.map(pos => {
                      const v = d[pos];
                      const { color: pc } = matchupGrade(v || 0, pos);
                      return (
                        <td key={pos} style={{ padding: "8px 12px", textAlign: "center" }}>
                          {v != null ? (
                            <span style={{
                              fontFamily: "'Bebas Neue', sans-serif",
                              fontSize: pos === sortPos ? 20 : 16,
                              color: pos === sortPos ? pc : "var(--dm)",
                              letterSpacing: .5,
                            }}>
                              {v.toFixed(1)}
                            </span>
                          ) : (
                            <span style={{ color: "var(--dm2)", fontSize: 12 }}>—</span>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <div style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 32, height: 24, borderRadius: 6,
                        background: `${color}15`, border: `1px solid ${color}44`,
                        fontFamily: "'Bebas Neue', sans-serif", fontSize: 14,
                        color, letterSpacing: .5,
                      }}>
                        {grade}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Team detail view ──────────────────────────────────────────────────────────
function TeamDefDetail({ ab, fptaData, players, statsCache, goP, onBack }) {
  const [defRoster, setDefRoster]   = useState([]);
  const [gameLogs,  setGameLogs]    = useState([]);
  const [loading,   setLoading]     = useState(true);
  const [subTab,    setSubTab]      = useState("overview");

  const tm = TM_META[ab] || {};
  const d  = fptaData[ab] || {};

  useEffect(() => {
    setLoading(true);
    setDefRoster([]);
    setGameLogs([]);

    // Fetch defensive roster + game logs for top players vs this team
    Promise.all([
      fetchDefRoster(ab),
      // Fetch game logs for top 30 offensive players
      Promise.allSettled(
        players.slice(0, 60).map(p =>
          statsCache[p.id]
            ? Promise.resolve({ pid: p.id, logs: [] })
            : fetchGameLog(p.id).then(logs => ({ pid: p.id, logs }))
        )
      ),
    ]).then(([roster, logResults]) => {
      setDefRoster(roster);

      // Build aggregated game log data vs this team
      const vsTeam = [];
      // Use existing statsCache game logs if available
      for (const p of players) {
        // We'll aggregate from any existing game log data we can find
      }

      setLoading(false);
    });
  }, [ab]);

  // Aggregate game log data vs this defense from player stats
  const vsThisTeam = useMemo(() => {
    const results = [];
    // Look through all cached player game log data
    // We use staticStats as proxy — aggregate fpts performance
    for (const p of players) {
      const st = statsCache[p.id];
      if (!st) continue;
      // Try to find game-level data — not in static stats, so we estimate from season
      const yrs = Object.keys(st).map(Number).sort((a, b) => b - a);
      const recent = yrs[0] ? st[yrs[0]] : null;
      if (!recent || !recent.fpts || recent.gp < 1) continue;
      const avgPerGame = recent.fpts / (recent.gp || 16);
      results.push({ p, avgPerGame, season: yrs[0], st: recent });
    }
    return results.sort((a, b) => b.avgPerGame - a.avgPerGame).slice(0, 20);
  }, [players, statsCache]);

  const POSITIONS = ["QB", "RB", "WR", "TE"];

  return (
    <div>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${tm.c1 || "#F97316"}15, var(--s1))`,
        border: "1px solid var(--bd)", borderRadius: 14, padding: "18px 20px", marginBottom: 16,
      }}>
        <button
          onClick={onBack}
          style={{
            marginBottom: 12, padding: "6px 14px", borderRadius: 8,
            border: "1px solid var(--bd)", background: "rgba(255,255,255,.05)",
            color: "var(--dm)", cursor: "pointer", fontSize: 12,
          }}
        >
          ← All Defenses
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <TeamLogo ab={ab} sz={60} />
          <div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, letterSpacing: 1.5, lineHeight: 1 }}>
              {tm.c} {tm.n}
            </h2>
            <div style={{ color: "var(--dm)", fontSize: 14 }}>{ab} Defense · 2024 Season</div>
          </div>
        </div>

        {/* FPTA quick stats */}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {POSITIONS.map(pos => {
            const avg = d[pos];
            const { grade, color } = matchupGrade(avg || 0, pos);
            return (
              <div key={pos} style={{
                background: "rgba(0,0,0,.25)", border: `1px solid ${color}25`,
                borderRadius: 10, padding: "8px 14px", textAlign: "center",
              }}>
                <div style={{ fontSize: 10, color: posColor(pos), fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, fontWeight: 700 }}>
                  VS {pos}
                </div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color, lineHeight: 1, letterSpacing: .5 }}>
                  {avg != null ? avg.toFixed(1) : "—"}
                </div>
                <div style={{ fontSize: 9, color, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
                  {grade}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {[
          { id: "overview",  label: "Key Defenders" },
          { id: "matchup",   label: "Matchup Analysis" },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              background: subTab === t.id ? "var(--em)" : "rgba(255,255,255,.06)",
              color: subTab === t.id ? "#000" : "var(--dm)",
              fontWeight: subTab === t.id ? 800 : 600, fontSize: 13,
              transition: "all .13s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Key Defenders */}
      {subTab === "overview" && (
        <div>
          {loading ? (
            <div style={{ color: "var(--dm)", padding: 30, textAlign: "center" }}>Loading defensive roster…</div>
          ) : defRoster.length === 0 ? (
            <div style={{ color: "var(--dm)", padding: 30, textAlign: "center", background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 14 }}>
              Defensive roster data unavailable
            </div>
          ) : (
            <div>
              {["CB", "S", "LB", "DE", "DT"].map(pos => {
                const grp = defRoster.filter(p => p.pos === pos || (pos === "LB" && ["MLB","OLB","ILB"].includes(p.pos)));
                if (!grp.length) return null;
                const POS_COLOR = { CB:"var(--sk)", S:"var(--vi)", LB:"var(--lm)", DE:"var(--em)", DT:"var(--rs)" };
                const pc = POS_COLOR[pos] || "var(--dm)";
                return (
                  <div key={pos} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: pc, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, marginBottom: 6 }}>
                      {pos === "LB" ? "LINEBACKERS" : pos === "CB" ? "CORNERBACKS" : pos === "S" ? "SAFETIES" : pos === "DE" ? "D-ENDS" : "D-TACKLES"}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {grp.slice(0, 6).map(p => (
                        <div key={p.id} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          background: "var(--s1)", border: "1px solid var(--bd)",
                          borderRadius: 10, padding: "8px 12px",
                        }}>
                          <Headshot src={p.hs} sz={36} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{p.nm}</div>
                            <div style={{ fontSize: 10, color: pc }}>
                              #{p.jersey} · {p.pos}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Matchup Analysis */}
      {subTab === "matchup" && (
        <div>
          <div style={{ color: "var(--dm)", fontSize: 12, marginBottom: 14 }}>
            Average fantasy points per game by top players at each position (2024 season data)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {POSITIONS.map(pos => {
              const posPlayers = vsThisTeam.filter(({ p }) => p.pos === pos).slice(0, 5);
              const avg = d[pos];
              const { grade, color } = matchupGrade(avg || 0, pos);
              return (
                <div key={pos} style={{ background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 14, overflow: "hidden" }}>
                  <div style={{
                    padding: "10px 14px", borderBottom: "1px solid var(--bd)",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "rgba(0,0,0,.2)",
                  }}>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, color: posColor(pos) }}>
                      VS {pos}
                    </span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color, letterSpacing: .5 }}>
                        {avg != null ? `${avg.toFixed(1)} avg` : "—"}
                      </span>
                      <div style={{
                        padding: "2px 8px", borderRadius: 5,
                        background: `${color}15`, border: `1px solid ${color}33`,
                        fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, color,
                      }}>
                        {grade}
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: "8px 4px" }}>
                    {posPlayers.map(({ p, avgPerGame }) => (
                      <div
                        key={p.id}
                        className="sidebar-row"
                        onClick={() => goP(p.id)}
                      >
                        <Headshot src={p.hs} sz={28} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.nm}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--dm)" }}>{p.tm}</div>
                        </div>
                        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, color: "var(--em)" }}>
                          {avgPerGame.toFixed(1)}/g
                        </span>
                      </div>
                    ))}
                    {posPlayers.length === 0 && (
                      <div style={{ padding: "10px 14px", color: "var(--dm)", fontSize: 12 }}>No data available</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Team overview grid card ───────────────────────────────────────────────────
function TeamCard({ ab, fptaData, onClick }) {
  const tm = TM_META[ab] || {};
  const d  = fptaData[ab] || {};
  const POSITIONS = ["QB", "RB", "WR", "TE"];

  // Overall matchup score (avg grade across positions)
  const overallScore = useMemo(() => {
    const avgs = POSITIONS.map(pos => {
      const avg = d[pos] || 0;
      const base = { QB: 22, RB: 12, WR: 12, TE: 8 }[pos];
      return avg / base;
    });
    return avgs.reduce((s, v) => s + v, 0) / avgs.length;
  }, [d]);

  const { grade: overallGrade, color: overallColor } = matchupGrade(overallScore * 12, "WR");

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--s1)", border: "1px solid var(--bd)",
        borderRadius: 14, padding: "14px 14px",
        cursor: "pointer", transition: "all .2s",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = tm.c1 || "var(--em)";
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,.35)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "var(--bd)";
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TeamLogo ab={ab} sz={32} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.1 }}>{ab}</div>
            <div style={{ fontSize: 10, color: "var(--dm)" }}>{tm.n}</div>
          </div>
        </div>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 20,
          color: overallColor, letterSpacing: .5,
        }}>
          {overallGrade}
        </div>
      </div>

      {/* Position matchup pills */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        {POSITIONS.map(pos => {
          const avg = d[pos];
          const { grade, color } = matchupGrade(avg || 0, pos);
          return (
            <div key={pos} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "3px 7px", borderRadius: 5,
              background: `${color}10`, border: `1px solid ${color}20`,
            }}>
              <span style={{ fontSize: 10, color: posColor(pos), fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: .5 }}>
                {pos}
              </span>
              <span style={{ fontSize: 10, color, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: .3 }}>
                {avg != null ? avg.toFixed(1) : "—"} {grade}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Defense page ─────────────────────────────────────────────────────────
export default function Defense({ players, statsCache, goP }) {
  const [activeTab,   setActiveTab]   = useState("overview");
  const [selTeam,     setSelTeam]     = useState(null);
  const [sortPos,     setSortPos]     = useState("WR");
  const [fptaData,    setFptaData]    = useState({});
  const [loadingFpta, setLoadingFpta] = useState(false);
  const [fptaLoaded,  setFptaLoaded]  = useState(false);

  // Build initial FPTA estimates from player stats averages
  useEffect(() => {
    const data = {};
    const totals = {};

    for (const p of players) {
      if (!statsCache[p.id]) continue;
      const yrs = Object.keys(statsCache[p.id]).map(Number).sort((a, b) => b - a);
      const yr2024 = statsCache[p.id][2024];
      if (!yr2024 || !yr2024.fpts || !yr2024.gp) continue;
      const avg = yr2024.fpts / yr2024.gp;
      // We estimate each team sees similar avg — distribute evenly
      // This is a baseline that will be updated by live data
      for (const ab of ALL_TEAMS) {
        if (!totals[ab]) totals[ab] = { QB: { t: 0, c: 0 }, RB: { t: 0, c: 0 }, WR: { t: 0, c: 0 }, TE: { t: 0, c: 0 } };
        if (totals[ab][p.pos]) {
          // Use player avg as baseline — each team faces ~1-2 of these players per game
          // Weight by player quality (higher avg = top player impact)
          totals[ab][p.pos].t += avg;
          totals[ab][p.pos].c += 1;
        }
      }
    }

    // For now use league-average estimates by position
    const POS_AVG = { QB: 22, RB: 12, WR: 12, TE: 8 };
    for (const ab of ALL_TEAMS) {
      data[ab] = {};
      for (const pos of ["QB", "RB", "WR", "TE"]) {
        data[ab][pos] = POS_AVG[pos];
      }
    }
    setFptaData(data);
  }, [players, statsCache]);

  // Load real FPTA data from game logs
  const loadFPTA = async () => {
    setLoadingFpta(true);
    const topPlayers = { QB: [], RB: [], WR: [], TE: [] };
    for (const p of players) {
      const st = statsCache[p.id]?.[2024];
      if (st && st.fpts > 0 && topPlayers[p.pos]) {
        topPlayers[p.pos].push({ ...p, fpts24: st.fpts });
      }
    }
    // Top 20 per position
    for (const pos of ["QB","RB","WR","TE"]) {
      topPlayers[pos] = topPlayers[pos].sort((a,b) => b.fpts24 - a.fpts24).slice(0, 20);
    }

    const allTop = Object.values(topPlayers).flat();
    const logResults = await Promise.allSettled(
      allTop.map(p => fetchGameLog(p.id, 2024).then(logs => ({ p, logs })))
    );

    const totals = {};
    for (const ab of ALL_TEAMS) {
      totals[ab] = { QB: { t: 0, c: 0 }, RB: { t: 0, c: 0 }, WR: { t: 0, c: 0 }, TE: { t: 0, c: 0 } };
    }

    for (const res of logResults) {
      if (res.status !== "fulfilled") continue;
      const { p, logs } = res.value;
      for (const g of logs) {
        const ab = g.opp;
        if (!totals[ab] || !totals[ab][p.pos]) continue;
        totals[ab][p.pos].t += g.fpts;
        totals[ab][p.pos].c += 1;
      }
    }

    const data = {};
    for (const ab of ALL_TEAMS) {
      data[ab] = {};
      for (const pos of ["QB", "RB", "WR", "TE"]) {
        const { t, c } = totals[ab][pos];
        data[ab][pos] = c > 0 ? +(t / c).toFixed(1) : null;
      }
    }
    setFptaData(data);
    setFptaLoaded(true);
    setLoadingFpta(false);
  };

  if (selTeam) {
    return (
      <div className="fu page-wrap">
        <TeamDefDetail
          ab={selTeam}
          fptaData={fptaData}
          players={players}
          statsCache={statsCache}
          goP={goP}
          onBack={() => setSelTeam(null)}
        />
      </div>
    );
  }

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
              NFL DEFENSES
            </h2>
            <p style={{ color: "var(--dm)", fontSize: 13 }}>
              Fantasy Points Against by position · Click any team for key defenders & matchup details
            </p>
          </div>
          <button
            onClick={loadFPTA}
            disabled={loadingFpta}
            style={{
              padding: "9px 20px", borderRadius: 9, cursor: loadingFpta ? "wait" : "pointer",
              border: fptaLoaded ? "1px solid rgba(34,197,94,.3)" : "none",
              background: fptaLoaded ? "rgba(34,197,94,.15)" : "var(--em)",
              color: fptaLoaded ? "var(--lm)" : "#000",
              fontWeight: 800, fontSize: 13, fontFamily: "'Barlow', sans-serif",
              opacity: loadingFpta ? .6 : 1,
            }}
          >
            {loadingFpta ? "Loading FPTA…" : fptaLoaded ? "✓ Live FPTA Loaded" : "Load Live FPTA Data"}
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { id: "overview", label: "Team Cards" },
            { id: "fpta",     label: "FPTA Table"  },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                background: activeTab === t.id ? "var(--em)" : "rgba(255,255,255,.06)",
                color: activeTab === t.id ? "#000" : "var(--dm)",
                fontWeight: activeTab === t.id ? 800 : 600, fontSize: 13,
                transition: "all .12s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Team cards grid */}
      {activeTab === "overview" && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 10,
        }}>
          {ALL_TEAMS.map(ab => (
            <TeamCard
              key={ab}
              ab={ab}
              fptaData={fptaData}
              onClick={() => setSelTeam(ab)}
            />
          ))}
        </div>
      )}

      {/* FPTA table */}
      {activeTab === "fpta" && (
        <FPTATable
          fptaData={fptaData}
          sortPos={sortPos}
          setSortPos={setSortPos}
        />
      )}

      <div style={{ marginTop: 12, color: "var(--dm)", fontSize: 12, padding: "0 4px" }}>
        {fptaLoaded
          ? "Live data: 2024 season game logs from ESPN · Top 20 players per position · avg FPTS allowed per game"
          : "Showing estimated league averages · Click \"Load Live FPTA Data\" to fetch real 2024 game log data from ESPN"}
      </div>
    </div>
  );
}
