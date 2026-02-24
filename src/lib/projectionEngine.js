// ─────────────────────────────────────────────────────────────────────────────
//  Opportunity-First Projection Engine
//  projection = Volume×0.40 + Efficiency×0.25 + Trend×0.20 + Matchup×0.15
// ─────────────────────────────────────────────────────────────────────────────

// ── Matchup placeholder ───────────────────────────────────────────────────────
// 5.0 = league-average.  Higher = softer defence at that position.
// Wire in real weekly opponent data here when ready.
const MATCHUP_MAP = {
  QB: {
    // Example: ARI:{value} — replace with real opponent PA data per week
  },
  RB: {},
  WR: {},
  TE: {},
};
const DEFAULT_MATCHUP = 5.0;
function matchupFor(pos, oppAb) {
  return MATCHUP_MAP[pos]?.[oppAb] ?? DEFAULT_MATCHUP;
}

// ── 1. Volume Score (0–10) ────────────────────────────────────────────────────
// How much opportunity does this player receive?
//   QB  → pass attempts per game  (38 att/g ≈ elite)
//   RB  → total touches per game  (22 tch/g ≈ elite bell-cow)
//   WR  → targets per game        (10 tgt/g ≈ elite)
//   TE  → targets per game        (7  tgt/g ≈ elite)
export function computeVolumeScore(stats, pos) {
  if (!stats) return 0;
  const gp = Math.max(stats.gp || 1, 1);
  let raw = 0;

  if (pos === "QB") {
    raw = Math.min(10, ((stats.passAtt || 0) / gp / 38) * 10);
  } else if (pos === "RB") {
    const touches = (stats.rushAtt || 0) + (stats.rec || 0);
    raw = Math.min(10, (touches / gp / 22) * 10);
  } else if (pos === "WR") {
    raw = Math.min(10, ((stats.tgt || 0) / gp / 10) * 10);
  } else if (pos === "TE") {
    raw = Math.min(10, ((stats.tgt || 0) / gp / 7) * 10);
  }

  return +Math.max(0, raw).toFixed(2);
}

// ── 2. Efficiency Score (0–10) ────────────────────────────────────────────────
// How well does the player convert opportunity into fantasy points?
//   QB  → fantasy pts per pass attempt  (0.55 ≈ elite)
//   RB  → fantasy pts per touch         (2.2  ≈ elite)
//   WR/TE → fantasy pts per target      (1.9  ≈ elite)
export function computeEfficiencyScore(stats, pos) {
  if (!stats) return 0;
  let raw = 0;

  if (pos === "QB") {
    const att = Math.max(stats.passAtt || 0, 1);
    const pts = (stats.passYd || 0) * 0.04 +
                (stats.passTD || 0) * 4 +
                (stats.passInt || 0) * -2;
    raw = Math.min(10, Math.max(0, (pts / att / 0.55) * 10));

  } else if (pos === "RB") {
    const touches = Math.max((stats.rushAtt || 0) + (stats.rec || 0), 1);
    const pts = (stats.rushYd || 0) * 0.1 + (stats.rushTD || 0) * 6 +
                (stats.rec    || 0) * 1   + (stats.recYd  || 0) * 0.1 +
                (stats.recTD  || 0) * 6;
    raw = Math.min(10, Math.max(0, (pts / touches / 2.2) * 10));

  } else { // WR, TE
    const tgt = Math.max(stats.tgt || stats.rec || 1, 1);
    const pts = (stats.rec   || 0) * 1  +
                (stats.recYd || 0) * 0.1 +
                (stats.recTD || 0) * 6;
    raw = Math.min(10, Math.max(0, (pts / tgt / 1.9) * 10));
  }

  return +raw.toFixed(2);
}

// ── 3. Trend Score (0–10) ─────────────────────────────────────────────────────
// Breakout detector: compares most recent season fantasy pts to prior season.
//   +50% YoY → ~10   |   flat → 5   |   −50% YoY → ~0
export function computeTrendScore(allStats) {
  if (!allStats) return 5.0;
  const years = Object.keys(allStats).map(Number).sort((a, b) => b - a);

  if (years.length === 0) return 5.0;
  if (years.length === 1) return years[0] >= 2024 ? 5.5 : 5.0; // single season

  const recent = allStats[years[0]]?.fpts || 0;
  const prior  = allStats[years[1]]?.fpts || 0;

  if (prior === 0) return recent > 0 ? 6.5 : 5.0;

  const pctChange = (recent - prior) / prior; // e.g. +0.50 = +50%
  // Clamp to ±100% change → maps to 0–10 with 5 at breakeven
  const raw = 5 + pctChange * 5;
  return +Math.min(10, Math.max(0, raw)).toFixed(2);
}

// ── 4. Matchup Score (0–10) ───────────────────────────────────────────────────
// Opponent positional vulnerability. Placeholder = league-average (5.0).
// Upgrade by populating MATCHUP_MAP with real weekly defensive rankings.
export function computeMatchupScore(pos, oppAb = null) {
  return +matchupFor(pos, oppAb).toFixed(2);
}

// ── Per-player projection ─────────────────────────────────────────────────────
export function projectPlayer(player, allStats, oppAb = null) {
  const years = allStats
    ? Object.keys(allStats).map(Number).sort((a, b) => b - a)
    : [];
  const recentYear  = years[0] ?? null;
  const recentStats = recentYear ? allStats[recentYear] : null;

  const volume     = computeVolumeScore(recentStats, player.pos);
  const efficiency = computeEfficiencyScore(recentStats, player.pos);
  const trend      = computeTrendScore(allStats);
  const matchup    = computeMatchupScore(player.pos, oppAb);

  const projection = +(volume * 0.40 + efficiency * 0.25 + trend * 0.20 + matchup * 0.15).toFixed(2);

  return {
    ...player,
    volume,
    efficiency,
    trend,
    matchup,
    projection,
    hasData: !!recentStats,
    recentYear,
    recentStats,
  };
}

// ── Rank all players ──────────────────────────────────────────────────────────
export function rankPlayers(players, statsCache) {
  return players
    .map(p => projectPlayer(p, statsCache[p.id] ?? null))
    .sort((a, b) => b.projection - a.projection);
}
