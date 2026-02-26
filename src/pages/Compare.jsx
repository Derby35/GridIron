import { useState, useMemo } from "react";
import { Headshot, TeamLogo, Pil, posColor } from "../components/ui.jsx";

const COMPARE_COLORS = ["#F97316", "#38BDF8", "#22C55E", "#A78BFA", "#F59E0B"];

// Stats to display per position
const STAT_ROWS = {
  QB: [
    { key: "fpts",     label: "Fantasy Points" },
    { key: "gp",       label: "Games Played"   },
    { key: "passYd",   label: "Pass Yards"      },
    { key: "passTD",   label: "Pass TDs"        },
    { key: "passInt",  label: "Interceptions"   },
    { key: "passAtt",  label: "Pass Attempts"   },
    { key: "passCmp",  label: "Completions"     },
    { key: "rushYd",   label: "Rush Yards"      },
    { key: "rushTD",   label: "Rush TDs"        },
  ],
  RB: [
    { key: "fpts",    label: "Fantasy Points" },
    { key: "gp",      label: "Games Played"   },
    { key: "rushAtt", label: "Rush Attempts"  },
    { key: "rushYd",  label: "Rush Yards"     },
    { key: "rushTD",  label: "Rush TDs"       },
    { key: "rec",     label: "Receptions"     },
    { key: "tgt",     label: "Targets"        },
    { key: "recYd",   label: "Rec Yards"      },
    { key: "recTD",   label: "Rec TDs"        },
  ],
  WR: [
    { key: "fpts",  label: "Fantasy Points" },
    { key: "gp",    label: "Games Played"   },
    { key: "tgt",   label: "Targets"        },
    { key: "rec",   label: "Receptions"     },
    { key: "recYd", label: "Rec Yards"      },
    { key: "recTD", label: "Rec TDs"        },
    { key: "rushYd", label: "Rush Yards"    },
  ],
  TE: [
    { key: "fpts",  label: "Fantasy Points" },
    { key: "gp",    label: "Games Played"   },
    { key: "tgt",   label: "Targets"        },
    { key: "rec",   label: "Receptions"     },
    { key: "recYd", label: "Rec Yards"      },
    { key: "recTD", label: "Rec TDs"        },
  ],
};

const SEASONS = [2025, 2024, 2023, 2022, 2021, 2020];

function getStatRows(players) {
  // Use rows for the most common position among selected players
  if (!players.length) return STAT_ROWS.WR;
  const pos = players[0].pos;
  return STAT_ROWS[pos] || STAT_ROWS.WR;
}

// Format a stat value for display
function fmt(val, key) {
  if (val === undefined || val === null || val === 0) return "—";
  if (key === "fpts") return (+val).toFixed(1);
  if (typeof val === "number" && val > 999) return val.toLocaleString();
  return val;
}

// Compare best value among players for a row (for highlighting)
function getBest(players, statsCache, season, key) {
  let best = -Infinity;
  for (const p of players) {
    const v = statsCache[p.id]?.[season]?.[key] ?? 0;
    if (v > best) best = v;
  }
  return best;
}

// ── Player card column ────────────────────────────────────────────────────────
function PlayerCol({ p, color, statsCache, season, statRows, onRemove, goP }) {
  const st = statsCache[p.id]?.[season] || {};
  const yrs = Object.keys(statsCache[p.id] || {}).map(Number).sort((a, b) => b - a);
  const bestSeason = yrs.length ? Math.max(...yrs.map(yr => statsCache[p.id][yr]?.fpts || 0)) : 0;

  return (
    <div style={{
      background: "var(--s1)",
      border: `1px solid ${color}33`,
      borderTop: `3px solid ${color}`,
      borderRadius: 14,
      overflow: "hidden",
      flex: 1,
      minWidth: 160,
    }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${color}10, var(--s2))`,
        padding: "14px 14px 10px",
        position: "relative",
      }}>
        <button
          onClick={onRemove}
          style={{
            position: "absolute", top: 8, right: 8,
            width: 22, height: 22, borderRadius: "50%",
            border: "1px solid var(--bd)", background: "rgba(0,0,0,.4)",
            color: "var(--dm)", cursor: "pointer", fontSize: 12,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >×</button>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Headshot src={p.hs} sz={56} />
          <div style={{ textAlign: "center" }}>
            <div
              style={{ fontWeight: 800, fontSize: 15, cursor: "pointer", lineHeight: 1.2 }}
              onClick={() => goP(p.id)}
            >
              {p.nm}
            </div>
            <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 5, flexWrap: "wrap" }}>
              <Pil ch={p.pos} c={posColor(p.pos)} s={{ padding: "1px 7px", fontSize: 10 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <TeamLogo ab={p.tm} sz={16} />
                <span style={{ fontSize: 11, color: "var(--dm)" }}>{p.tm}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 12 }}>
          {[
            { l: "Best Season", v: bestSeason > 0 ? bestSeason.toFixed(1) : "—" },
            { l: "Games", v: yrs.length > 0 ? (yrs.reduce((s, yr) => s + (statsCache[p.id][yr]?.gp || 0), 0)) : "—" },
          ].map(({ l, v }) => (
            <div key={l} style={{
              background: "rgba(0,0,0,.25)", borderRadius: 8, padding: "6px 8px", textAlign: "center",
            }}>
              <div style={{ fontSize: 9, color: "var(--dm)", textTransform: "uppercase", letterSpacing: .5 }}>{l}</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color, lineHeight: 1 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      {statRows.map((row, i) => {
        const val = st[row.key];
        return (
          <div key={row.key} style={{
            display: "flex", alignItems: "center", justifyContent: "flex-end",
            padding: "7px 14px",
            background: i % 2 === 0 ? "rgba(255,255,255,.015)" : "transparent",
            borderTop: i === 0 ? "1px solid var(--bd)" : "none",
          }}>
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 17,
              color: val && val > 0 ? color : "var(--dm2)",
              letterSpacing: .5,
            }}>
              {fmt(val, row.key)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Stat row label column ─────────────────────────────────────────────────────
function LabelCol({ statRows }) {
  return (
    <div style={{ width: 130, flexShrink: 0 }}>
      {/* Spacer matching player card header height */}
      <div style={{ height: 200 }} />
      {statRows.map((row, i) => (
        <div key={row.key} style={{
          padding: "7px 10px 7px 14px",
          fontSize: 12, color: "var(--dm)",
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 600, letterSpacing: .3,
          background: i % 2 === 0 ? "rgba(255,255,255,.015)" : "transparent",
          borderTop: i === 0 ? "1px solid var(--bd)" : "none",
          display: "flex", alignItems: "center",
        }}>
          {row.label}
        </div>
      ))}
    </div>
  );
}

// ── Player search ─────────────────────────────────────────────────────────────
function PlayerSearch({ players, selected, onAdd }) {
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    if (q.length < 2) return [];
    const lq = q.toLowerCase();
    return players
      .filter(p => !selected.includes(p.id) && (
        p.nm.toLowerCase().includes(lq) || p.tm.toLowerCase().includes(lq)
      ))
      .slice(0, 8);
  }, [q, players, selected]);

  return (
    <div style={{ position: "relative" }}>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search to add a player…"
        className="search-input"
        style={{ width: 280 }}
      />
      {results.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: "var(--s2)", border: "1px solid var(--bd)", borderRadius: 10,
          overflow: "hidden", zIndex: 20, boxShadow: "0 8px 30px rgba(0,0,0,.5)",
        }}>
          {results.map(p => (
            <div
              key={p.id}
              onClick={() => { onAdd(p.id); setQ(""); }}
              className="sidebar-row"
              style={{ margin: 0, borderRadius: 0, padding: "8px 12px" }}
            >
              <Headshot src={p.hs} sz={30} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{p.nm}</div>
                <div style={{ fontSize: 10, color: "var(--dm)" }}>
                  <span style={{ color: posColor(p.pos) }}>{p.pos}</span> · {p.tm}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Compare page ─────────────────────────────────────────────────────────
export default function Compare({ players, statsCache, goP }) {
  const [selected, setSelected] = useState([]); // array of player IDs
  const [season,   setSeason]   = useState(2024);

  const addPlayer  = id => selected.length < 5 && setSelected(s => [...s, id]);
  const removePlayer = id => setSelected(s => s.filter(x => x !== id));

  const selPlayers = selected.map(id => players.find(p => p.id === id)).filter(Boolean);
  const statRows   = getStatRows(selPlayers);

  return (
    <div className="fu page-wrap">
      {/* Header */}
      <div style={{
        background: "var(--s1)", border: "1px solid var(--bd)",
        borderRadius: 14, padding: "16px 20px", marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
          <div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 1.5, marginBottom: 2 }}>
              PLAYER COMPARISON
            </h2>
            <p style={{ color: "var(--dm)", fontSize: 13 }}>
              Compare up to 5 players side-by-side · Stats from {season} season
            </p>
          </div>

          {/* Season selector */}
          <div style={{ display: "flex", gap: 3 }}>
            {SEASONS.map(yr => (
              <button
                key={yr}
                onClick={() => setSeason(yr)}
                style={{
                  padding: "5px 11px", borderRadius: 7, border: "none",
                  background: season === yr ? "var(--em)" : "rgba(255,255,255,.05)",
                  color: season === yr ? "#000" : "var(--dm)",
                  fontWeight: season === yr ? 800 : 500, fontSize: 12, cursor: "pointer",
                  transition: "all .12s",
                }}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <PlayerSearch players={players} selected={selected} onAdd={addPlayer} />
          {selected.length > 0 && (
            <button
              onClick={() => setSelected([])}
              style={{
                padding: "7px 14px", borderRadius: 8, border: "1px solid var(--bd)",
                background: "rgba(255,255,255,.04)", color: "var(--dm)", cursor: "pointer",
                fontSize: 12, fontFamily: "'Barlow', sans-serif",
              }}
            >
              Clear All
            </button>
          )}
          <span style={{ fontSize: 12, color: "var(--dm)" }}>
            {selected.length}/5 players selected
          </span>
        </div>
      </div>

      {/* Empty state */}
      {selPlayers.length === 0 && (
        <div style={{
          background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 14,
          padding: "60px 40px", textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚖️</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 1, marginBottom: 8 }}>
            ADD PLAYERS TO COMPARE
          </div>
          <p style={{ color: "var(--dm)", fontSize: 14, maxWidth: 400, margin: "0 auto" }}>
            Search for up to 5 players above to compare their stats side-by-side across any season.
          </p>
        </div>
      )}

      {/* Comparison grid */}
      {selPlayers.length > 0 && (
        <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
          <LabelCol statRows={statRows} />
          <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 0 }}>
            {selPlayers.map((p, i) => (
              <PlayerCol
                key={p.id}
                p={p}
                color={COMPARE_COLORS[i % COMPARE_COLORS.length]}
                statsCache={statsCache}
                season={season}
                statRows={statRows}
                onRemove={() => removePlayer(p.id)}
                goP={goP}
              />
            ))}
          </div>
        </div>
      )}

      {/* Bottom player search bubbles */}
      {selPlayers.length > 0 && selPlayers.length < 5 && (
        <div style={{ marginTop: 16, padding: "14px 16px", background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 12 }}>
          <p style={{ color: "var(--dm)", fontSize: 12, marginBottom: 8 }}>
            Add more players to compare ({5 - selPlayers.length} slots remaining):
          </p>
          <PlayerSearch players={players} selected={selected} onAdd={addPlayer} />
        </div>
      )}
    </div>
  );
}
