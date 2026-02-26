import { useState, useEffect, useMemo, useRef } from "react";
import { rankPlayersV2, recomputeStatsCache, DEFAULT_FORMAT } from "../engine/projectionV2.js";
import { STATIC_DEPTH_CHARTS, STATIC_STANDINGS_25 } from "../data/teamData.js";
import { Headshot, TeamLogo, Pil, posColor, confColor } from "../components/ui.jsx";

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
    const r = await fetch(`${SLEEPER}/players/nfl/trending/${type}?lookback_hours=24&limit=25`);
    if (!r.ok) return [];
    const data = await r.json();
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch (_) {}
    return data;
  } catch (_) { return []; }
}

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

// Deterministic shuffle seeded by current day (changes daily)
function dailyShuffle(arr) {
  const seed = Math.floor(Date.now() / 86400000); // changes once per day
  const copy = [...arr];
  let s = seed;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ── Trending player card ──────────────────────────────────────────────────────
function TrendingCard({ p, proj, rank, goP }) {
  const pc = posColor(p.pos);
  const posRank = `${p.pos}${rank}`;
  return (
    <div
      onClick={() => goP(p.id)}
      style={{
        background: "var(--s1)", border: "1px solid var(--bd)",
        borderTop: `3px solid ${pc}`, borderRadius: 14,
        padding: "14px 16px", cursor: "pointer",
        transition: "all .2s",
        display: "flex", flexDirection: "column", gap: 10,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = pc;
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 22px rgba(0,0,0,.35)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "var(--bd)";
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Headshot src={p.hs} sz={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.nm}
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 3 }}>
            <span style={{
              fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12,
              fontWeight: 800, color: pc, letterSpacing: .3,
            }}>
              {posRank}
            </span>
            <span style={{ fontSize: 11, color: "var(--dm)" }}>· {p.tm}</span>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "var(--em)", lineHeight: 1, letterSpacing: .5 }}>
            {proj?.projection ?? "—"}
          </div>
          <div style={{ fontSize: 9, color: "var(--dm)", textTransform: "uppercase", letterSpacing: .5 }}>Proj FPTS</div>
        </div>
      </div>

      {proj?.note && (
        <div style={{
          borderLeft: "2px solid var(--em)", paddingLeft: 8,
          fontSize: 11, color: "var(--dm)", lineHeight: 1.5, fontStyle: "italic",
        }}>
          {proj.note}
        </div>
      )}

      {proj && (
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,.07)", borderRadius: 99, position: "relative", overflow: "hidden" }}>
            <div style={{
              position: "absolute", left: `${(proj.floor / 10) * 100}%`,
              width: `${((proj.ceiling - proj.floor) / 10) * 100}%`,
              height: "100%", background: `linear-gradient(90deg, var(--rs), var(--lm))`, borderRadius: 99,
            }} />
          </div>
          <span style={{ fontSize: 9, color: "var(--rs)", fontFamily: "'Barlow Condensed', sans-serif" }}>▼{proj.floor}</span>
          <span style={{ fontSize: 9, color: "var(--lm)", fontFamily: "'Barlow Condensed', sans-serif" }}>▲{proj.ceiling}</span>
        </div>
      )}
    </div>
  );
}

// ── Sleeper trending row ──────────────────────────────────────────────────────
function SleeperRow({ item, dir, players, goP }) {
  const p = players.find(pl => String(pl.id) === String(item.player_id));
  if (!p) return null;
  return (
    <div
      className="sidebar-row"
      onClick={() => goP(p.id)}
      style={{ padding: "8px 10px" }}
    >
      <Headshot src={p.hs} sz={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.nm}
        </div>
        <div style={{ fontSize: 11, color: "var(--dm)" }}>
          <span style={{ color: posColor(p.pos) }}>{p.pos}</span> · {p.tm}
        </div>
      </div>
      <span style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 12, fontWeight: 800,
        color: dir === "add" ? "var(--lm)" : "var(--rs)",
        whiteSpace: "nowrap",
      }}>
        {dir === "add" ? "▲" : "▼"} {item.count?.toLocaleString()}
      </span>
    </div>
  );
}

// ── Featured team card ────────────────────────────────────────────────────────
function FeaturedTeam({ ab, ranked, goT, goP }) {
  const tm = TM_META[ab] || {};
  const topPlayers = ranked.filter(p => p.tm === ab).slice(0, 3);
  const posRankMap = useMemo(() => {
    const counts = {};
    return ranked.map(p => {
      counts[p.pos] = (counts[p.pos] || 0) + 1;
      return { id: p.id, posRank: `${p.pos}${counts[p.pos]}` };
    });
  }, [ranked]);

  return (
    <div style={{
      background: `linear-gradient(135deg, ${tm.c1 || "#F97316"}12, var(--s1))`,
      border: `1px solid ${tm.c1 || "var(--bd)"}30`,
      borderRadius: 16, overflow: "hidden",
    }}>
      <div
        style={{
          padding: "16px 18px 12px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 12,
          borderBottom: "1px solid var(--bd)",
        }}
        onClick={() => goT(ab)}
      >
        <TeamLogo ab={ab} sz={44} />
        <div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 1, lineHeight: 1 }}>
            {tm.c?.toUpperCase()} {tm.n?.toUpperCase()}
          </div>
          <div style={{ fontSize: 11, color: "var(--dm)" }}>
            {ab} · {topPlayers.length} ranked players
          </div>
        </div>
      </div>
      <div style={{ padding: "6px 4px" }}>
        {topPlayers.map(p => {
          const pr = posRankMap.find(r => r.id === p.id);
          return (
            <div key={p.id} className="sidebar-row" onClick={() => goP(p.id)}>
              <Headshot src={p.hs} sz={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.nm}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <span style={{ fontSize: 10, color: posColor(p.pos), fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {pr?.posRank}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--dm)" }}>{p.role}</span>
                </div>
              </div>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "var(--em)", flexShrink: 0, letterSpacing: .3 }}>
                {p.projection}
              </span>
            </div>
          );
        })}
        {topPlayers.length === 0 && (
          <div style={{ padding: "10px 14px", color: "var(--dm)", fontSize: 12 }}>No ranked players found</div>
        )}
      </div>
    </div>
  );
}

// ── Insight / news card ───────────────────────────────────────────────────────
function InsightCard({ p, proj, rank, goP }) {
  if (!proj?.note) return null;
  const pc = posColor(p.pos);
  return (
    <div
      onClick={() => goP(p.id)}
      style={{
        background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 12,
        padding: "12px 14px", cursor: "pointer",
        display: "flex", gap: 10, alignItems: "flex-start",
        transition: "border-color .18s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = pc; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--bd)"; }}
    >
      <Headshot src={p.hs} sz={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>{p.nm}</span>
          <Pil ch={`${p.pos}${rank}`} c={pc} s={{ padding: "1px 6px", fontSize: 9 }} />
          <span style={{ fontSize: 11, color: "var(--dm)" }}>{p.tm}</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: "var(--em)" }}>
            {proj.projection} FPTS
          </span>
        </div>
        <p style={{ fontSize: 12, color: "var(--dm)", lineHeight: 1.55, margin: 0 }}>
          {proj.note}
        </p>
      </div>
    </div>
  );
}

// ── Main Home page ─────────────────────────────────────────────────────────────
export default function Home({ players, loading, statsCache, go, goP, goT }) {
  const [sleeperAdds,  setSleeperAdds]  = useState([]);
  const [sleeperDrops, setSleeperDrops] = useState([]);
  const [sleeperLoad,  setSleeperLoad]  = useState(true);

  useEffect(() => {
    Promise.all([fetchSleeperTrending("add"), fetchSleeperTrending("drop")]).then(([a, d]) => {
      setSleeperAdds(a);
      setSleeperDrops(d);
      setSleeperLoad(false);
    });
  }, []);

  const formatCache = useMemo(
    () => recomputeStatsCache(statsCache, DEFAULT_FORMAT),
    [statsCache]
  );

  const ranked = useMemo(() => {
    if (loading || !players.length) return [];
    return rankPlayersV2(players, formatCache, STATIC_DEPTH_CHARTS, STATIC_STANDINGS_25, DEFAULT_FORMAT);
  }, [players, formatCache, loading]);

  // Pos rank map
  const posRankMap = useMemo(() => {
    const counts = {};
    const map = {};
    for (const p of ranked) {
      counts[p.pos] = (counts[p.pos] || 0) + 1;
      map[p.id] = counts[p.pos];
    }
    return map;
  }, [ranked]);

  // Randomized featured players (top 30 shuffled, take first 6)
  const featuredPlayers = useMemo(() => {
    if (!ranked.length) return [];
    return dailyShuffle(ranked.slice(0, 30)).slice(0, 6);
  }, [ranked]);

  // Featured teams (random 3)
  const featuredTeams = useMemo(() => {
    const teams = [...new Set(ranked.map(p => p.tm))];
    return dailyShuffle(teams).slice(0, 3);
  }, [ranked]);

  // Rookies spotlight (exp === 0, top 4 by projection)
  const rookies = useMemo(() => {
    return ranked
      .filter(p => {
        const orig = players.find(pl => pl.id === p.id);
        return orig && (orig.exp === 0 || orig.exp === 1);
      })
      .slice(0, 4);
  }, [ranked, players]);

  // Insight feed (random 8 players with notes)
  const insights = useMemo(() => {
    const withNotes = ranked.filter(p => p.note);
    return dailyShuffle(withNotes).slice(0, 8);
  }, [ranked]);

  return (
    <div className="fu page-wrap">
      {/* Hero */}
      <div className="hero-section">
        <div className="hero-eyebrow">LIVE ESPN API · ALL ACTIVE PLAYERS · 2017–2025</div>
        <h1 className="hero-title">
          NFL Fantasy Football<br />
          <span style={{ color: "var(--em)" }}>Intelligence Hub</span>
        </h1>
        <p className="hero-subtitle">
          AI-powered player rankings, comparisons, and projections for all 32 NFL rosters.
          Real-time trending data from Sleeper — updated every session.
        </p>
        <div className="hero-cta-row">
          <button className="btn-primary" onClick={() => go("Rankings")}>View Rankings</button>
          <button className="btn-ghost"   onClick={() => go("Compare")}>Compare Players</button>
          <button className="btn-ghost"   onClick={() => go("Prospects")}>Prospects</button>
          <button className="btn-ghost"   onClick={() => go("Defense")}>Defense</button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { l: "Active Players", v: loading ? "…" : players.length, c: "var(--em)" },
          { l: "QBs",            v: loading ? "…" : players.filter(p=>p.pos==="QB").length, c: "var(--gd)" },
          { l: "RBs + WRs",      v: loading ? "…" : `${players.filter(p=>p.pos==="RB").length}+${players.filter(p=>p.pos==="WR").length}`, c: "var(--sk)" },
          { l: "TEs",            v: loading ? "…" : players.filter(p=>p.pos==="TE").length, c: "var(--vi)" },
        ].map(({ l, v, c }) => (
          <div key={l} className="stat-card" style={{ "--accent": c }}>
            <div className="stat-card-label">{l}</div>
            <div className="stat-card-value" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Main content grid: 2-col on large screens */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
        {/* Left column */}
        <div>
          {/* Trending / Featured Players */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 className="section-heading" style={{ margin: 0 }}>FEATURED PLAYERS</h2>
              <span style={{ fontSize: 11, color: "var(--dm)" }}>Refreshes daily</span>
            </div>
            {loading ? (
              <div style={{ color: "var(--dm)", padding: "20px 0" }}>Loading players…</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                {featuredPlayers.map(p => (
                  <TrendingCard
                    key={p.id}
                    p={p}
                    proj={p}
                    rank={posRankMap[p.id]}
                    goP={goP}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Rookies Spotlight */}
          {rookies.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h2 className="section-heading" style={{ margin: 0 }}>ROOKIE SPOTLIGHT</h2>
                <button
                  onClick={() => go("Prospects")}
                  style={{
                    padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer",
                    background: "rgba(255,255,255,.06)", color: "var(--dm)", fontSize: 12,
                    fontFamily: "'Barlow', sans-serif",
                  }}
                >
                  All Prospects →
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                {rookies.map(p => (
                  <TrendingCard
                    key={p.id}
                    p={p}
                    proj={p}
                    rank={posRankMap[p.id]}
                    goP={goP}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Player Insights Feed */}
          <div style={{ marginBottom: 20 }}>
            <h2 className="section-heading" style={{ marginBottom: 12 }}>PLAYER INSIGHTS</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {loading ? (
                <div style={{ color: "var(--dm)", padding: "20px 0" }}>Loading insights…</div>
              ) : insights.map(p => (
                <InsightCard
                  key={p.id}
                  p={p}
                  proj={p}
                  rank={posRankMap[p.id]}
                  goP={goP}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div>
          {/* Sleeper Trending */}
          <div className="sidebar-section" style={{ marginBottom: 16 }}>
            <div className="sidebar-header">
              <span className="sidebar-title">TRENDING ADDS</span>
              <span className="sidebar-badge">Sleeper 24h</span>
            </div>
            <div style={{ padding: "6px 0" }}>
              {sleeperLoad ? (
                <div style={{ padding: "16px 14px", color: "var(--dm)", fontSize: 12, textAlign: "center" }}>Loading…</div>
              ) : sleeperAdds.length === 0 ? (
                <div style={{ padding: "12px 14px", color: "var(--dm)", fontSize: 12 }}>No trending data</div>
              ) : (
                sleeperAdds.slice(0, 8).map((item, i) => (
                  <SleeperRow key={i} item={item} dir="add" players={players} goP={goP} />
                ))
              )}
            </div>
          </div>

          <div className="sidebar-section" style={{ marginBottom: 16 }}>
            <div className="sidebar-header">
              <span className="sidebar-title">TRENDING DROPS</span>
              <span className="sidebar-badge">Sleeper 24h</span>
            </div>
            <div style={{ padding: "6px 0" }}>
              {sleeperLoad ? (
                <div style={{ padding: "16px 14px", color: "var(--dm)", fontSize: 12, textAlign: "center" }}>Loading…</div>
              ) : sleeperDrops.slice(0, 5).map((item, i) => (
                <SleeperRow key={i} item={item} dir="drop" players={players} goP={goP} />
              ))}
            </div>
          </div>

          {/* Featured Teams */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h3 className="section-heading" style={{ fontSize: 18, margin: 0 }}>FEATURED TEAMS</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {featuredTeams.map(ab => (
                <FeaturedTeam key={ab} ab={ab} ranked={ranked} goT={goT} goP={goP} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick nav */}
      <div style={{
        marginTop: 24, padding: "16px 20px",
        background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 14,
        display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
      }}>
        <span style={{ color: "var(--dm)", fontSize: 13, marginRight: 4 }}>Quick nav:</span>
        {["Rankings", "Players", "Compare", "Prospects", "Teams", "Predictions", "Defense"].map(tab => (
          <button
            key={tab}
            onClick={() => go(tab)}
            className="btn-ghost"
            style={{ padding: "6px 14px", fontSize: 12 }}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}
