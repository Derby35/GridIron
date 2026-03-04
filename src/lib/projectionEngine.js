// ─────────────────────────────────────────────────────────────────────────────
//  Elite Projection Engine
//  projection = expectedVolume × expectedEfficiency × contextMultiplier × riskMultiplier
//
//  Data sources:
//    · DEFENSE_PROFILES — 2024/25 season defensive data for all 32 NFL teams
//    · matchupAdjustment  = (def.fantasyPtsAllowedPos - leagueAvgPos) / leagueAvgPos
//    · pressureImpact     = QB efficiency × def.pressureRate
//    · trendScore         = (recentFpts/g - weightedAvg) / weightedAvg
//    · teamScoringEnv     = (teamWins / 17 - 0.5) × 0.4
//    · contextMultiplier  = 1 + matchupAdj×0.35 + pressureImpact×0.2 + trendScore×0.25 + teamEnv×0.2
//    · riskMultiplier     = 1 - volatility×0.25 - injuryRisk×0.25
// ─────────────────────────────────────────────────────────────────────────────

// ── 32-Team Defensive Profiles (2024/25 Season) ───────────────────────────────
// fantasyPtsAllowedPos: avg fantasy pts allowed per game to that position
// pressureRate: QB pressure rate (used for QB-specific context adjustment)
// epaAllowedPerPlay: EPA per play allowed (negative = elite defense)
export const DEFENSE_PROFILES = {
  ARI: { fantasyPtsAllowedQB:24.1, fantasyPtsAllowedRB:14.2, fantasyPtsAllowedWR:13.8, fantasyPtsAllowedTE:9.1,  pressureRate:0.26, epaAllowedPerPlay: 0.09 },
  ATL: { fantasyPtsAllowedQB:21.8, fantasyPtsAllowedRB:12.6, fantasyPtsAllowedWR:11.9, fantasyPtsAllowedTE:7.8,  pressureRate:0.29, epaAllowedPerPlay: 0.03 },
  BAL: { fantasyPtsAllowedQB:17.4, fantasyPtsAllowedRB: 9.8, fantasyPtsAllowedWR: 9.2, fantasyPtsAllowedTE:5.9,  pressureRate:0.38, epaAllowedPerPlay:-0.11 },
  BUF: { fantasyPtsAllowedQB:19.2, fantasyPtsAllowedRB:11.1, fantasyPtsAllowedWR:10.4, fantasyPtsAllowedTE:6.8,  pressureRate:0.34, epaAllowedPerPlay:-0.06 },
  CAR: { fantasyPtsAllowedQB:25.9, fantasyPtsAllowedRB:15.1, fantasyPtsAllowedWR:14.7, fantasyPtsAllowedTE:10.2, pressureRate:0.22, epaAllowedPerPlay: 0.14 },
  CHI: { fantasyPtsAllowedQB:22.6, fantasyPtsAllowedRB:13.4, fantasyPtsAllowedWR:12.7, fantasyPtsAllowedTE:8.4,  pressureRate:0.27, epaAllowedPerPlay: 0.05 },
  CIN: { fantasyPtsAllowedQB:23.4, fantasyPtsAllowedRB:13.8, fantasyPtsAllowedWR:13.1, fantasyPtsAllowedTE:8.7,  pressureRate:0.25, epaAllowedPerPlay: 0.07 },
  CLE: { fantasyPtsAllowedQB:20.1, fantasyPtsAllowedRB:11.8, fantasyPtsAllowedWR:11.2, fantasyPtsAllowedTE:7.3,  pressureRate:0.32, epaAllowedPerPlay:-0.02 },
  DAL: { fantasyPtsAllowedQB:21.3, fantasyPtsAllowedRB:12.2, fantasyPtsAllowedWR:11.6, fantasyPtsAllowedTE:7.6,  pressureRate:0.30, epaAllowedPerPlay: 0.01 },
  DEN: { fantasyPtsAllowedQB:16.8, fantasyPtsAllowedRB: 9.4, fantasyPtsAllowedWR: 8.8, fantasyPtsAllowedTE:5.6,  pressureRate:0.40, epaAllowedPerPlay:-0.13 },
  DET: { fantasyPtsAllowedQB:22.9, fantasyPtsAllowedRB:13.6, fantasyPtsAllowedWR:13.0, fantasyPtsAllowedTE:8.5,  pressureRate:0.27, epaAllowedPerPlay: 0.04 },
  GB:  { fantasyPtsAllowedQB:20.7, fantasyPtsAllowedRB:12.0, fantasyPtsAllowedWR:11.4, fantasyPtsAllowedTE:7.4,  pressureRate:0.31, epaAllowedPerPlay:-0.01 },
  HOU: { fantasyPtsAllowedQB:19.8, fantasyPtsAllowedRB:11.5, fantasyPtsAllowedWR:10.9, fantasyPtsAllowedTE:7.1,  pressureRate:0.33, epaAllowedPerPlay:-0.04 },
  IND: { fantasyPtsAllowedQB:21.6, fantasyPtsAllowedRB:12.4, fantasyPtsAllowedWR:11.8, fantasyPtsAllowedTE:7.7,  pressureRate:0.29, epaAllowedPerPlay: 0.02 },
  JAX: { fantasyPtsAllowedQB:24.5, fantasyPtsAllowedRB:14.4, fantasyPtsAllowedWR:13.7, fantasyPtsAllowedTE:9.0,  pressureRate:0.24, epaAllowedPerPlay: 0.11 },
  KC:  { fantasyPtsAllowedQB:18.2, fantasyPtsAllowedRB:10.1, fantasyPtsAllowedWR: 9.8, fantasyPtsAllowedTE:6.2,  pressureRate:0.31, epaAllowedPerPlay:-0.08 },
  LAC: { fantasyPtsAllowedQB:20.4, fantasyPtsAllowedRB:11.9, fantasyPtsAllowedWR:11.3, fantasyPtsAllowedTE:7.3,  pressureRate:0.30, epaAllowedPerPlay:-0.01 },
  LAR: { fantasyPtsAllowedQB:21.1, fantasyPtsAllowedRB:12.1, fantasyPtsAllowedWR:11.5, fantasyPtsAllowedTE:7.5,  pressureRate:0.30, epaAllowedPerPlay: 0.00 },
  LV:  { fantasyPtsAllowedQB:25.2, fantasyPtsAllowedRB:14.8, fantasyPtsAllowedWR:14.1, fantasyPtsAllowedTE:9.4,  pressureRate:0.23, epaAllowedPerPlay: 0.12 },
  MIA: { fantasyPtsAllowedQB:22.3, fantasyPtsAllowedRB:13.1, fantasyPtsAllowedWR:12.4, fantasyPtsAllowedTE:8.1,  pressureRate:0.28, epaAllowedPerPlay: 0.03 },
  MIN: { fantasyPtsAllowedQB:19.5, fantasyPtsAllowedRB:11.3, fantasyPtsAllowedWR:10.7, fantasyPtsAllowedTE:7.0,  pressureRate:0.33, epaAllowedPerPlay:-0.05 },
  NE:  { fantasyPtsAllowedQB:20.9, fantasyPtsAllowedRB:12.1, fantasyPtsAllowedWR:11.5, fantasyPtsAllowedTE:7.5,  pressureRate:0.30, epaAllowedPerPlay: 0.01 },
  NO:  { fantasyPtsAllowedQB:21.4, fantasyPtsAllowedRB:12.3, fantasyPtsAllowedWR:11.7, fantasyPtsAllowedTE:7.6,  pressureRate:0.29, epaAllowedPerPlay: 0.02 },
  NYG: { fantasyPtsAllowedQB:24.8, fantasyPtsAllowedRB:14.6, fantasyPtsAllowedWR:13.9, fantasyPtsAllowedTE:9.2,  pressureRate:0.23, epaAllowedPerPlay: 0.12 },
  NYJ: { fantasyPtsAllowedQB:18.6, fantasyPtsAllowedRB:10.5, fantasyPtsAllowedWR: 9.9, fantasyPtsAllowedTE:6.4,  pressureRate:0.36, epaAllowedPerPlay:-0.09 },
  PHI: { fantasyPtsAllowedQB:17.9, fantasyPtsAllowedRB:10.0, fantasyPtsAllowedWR: 9.5, fantasyPtsAllowedTE:6.1,  pressureRate:0.37, epaAllowedPerPlay:-0.10 },
  PIT: { fantasyPtsAllowedQB:18.4, fantasyPtsAllowedRB:10.3, fantasyPtsAllowedWR: 9.7, fantasyPtsAllowedTE:6.3,  pressureRate:0.37, epaAllowedPerPlay:-0.09 },
  SF:  { fantasyPtsAllowedQB:19.0, fantasyPtsAllowedRB:10.7, fantasyPtsAllowedWR:10.1, fantasyPtsAllowedTE:6.6,  pressureRate:0.35, epaAllowedPerPlay:-0.07 },
  SEA: { fantasyPtsAllowedQB:21.9, fantasyPtsAllowedRB:12.7, fantasyPtsAllowedWR:12.1, fantasyPtsAllowedTE:7.9,  pressureRate:0.28, epaAllowedPerPlay: 0.04 },
  TB:  { fantasyPtsAllowedQB:20.6, fantasyPtsAllowedRB:11.9, fantasyPtsAllowedWR:11.3, fantasyPtsAllowedTE:7.3,  pressureRate:0.31, epaAllowedPerPlay:-0.01 },
  TEN: { fantasyPtsAllowedQB:23.7, fantasyPtsAllowedRB:13.9, fantasyPtsAllowedWR:13.2, fantasyPtsAllowedTE:8.8,  pressureRate:0.25, epaAllowedPerPlay: 0.08 },
  WAS: { fantasyPtsAllowedQB:22.0, fantasyPtsAllowedRB:12.8, fantasyPtsAllowedWR:12.2, fantasyPtsAllowedTE:7.9,  pressureRate:0.28, epaAllowedPerPlay: 0.03 },
};

// League averages for matchupAdjustment normalization
const LEAGUE_AVG_FPTS = { QB: 22, RB: 12, WR: 12, TE: 8, K: 9 };

// ── Utilities ──────────────────────────────────────────────────────────────────
const clamp   = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt2    = v => +v.toFixed(2);
const safeDiv = (n, d, fb = 0) => (d && d > 0 ? n / d : fb);

// ── 1. Volume Score (0–10) ────────────────────────────────────────────────────
// expectedVolume = snapShare×0.4 + targetShare×0.3 + carryShare×0.3
// Without Sleeper depth_chart_order, we estimate snap share from usage depth.
export function computeVolumeScore(stats, pos) {
  if (!stats) return 0;
  const gp = Math.max(stats.gp || 1, 1);

  // Games-played penalty: players with few games get proportionally less volume credit
  const gpPct = Math.min((stats.gp || 0) / 10, 1); // full credit at 10+ games

  // Kicker: volume = field goal attempts per game (3.5/g = elite)
  if (pos === "K") {
    const fgaPerGame = safeDiv(stats.fga || 0, gp);
    return fmt2(clamp(fgaPerGame / 3.5 * 10 * gpPct, 0, 10));
  }

  // League-average thresholds per position per game
  const LEAG_TGT_PG  = { QB: 0.5, RB: 3.5, WR: 7.0, TE: 4.0 };
  const LEAG_RUSH_PG = { QB:  4,  RB: 16,  WR: 0.5, TE: 0.2 };

  // Snap share proxy: assume 80% for players with meaningful stats, scale by output
  const tgtPG  = safeDiv(stats.tgt     || 0, gp);
  const rushPG = safeDiv(stats.rushAtt || 0, gp);
  const fptsGP = safeDiv(stats.fpts    || 0, gp);

  // Snap share estimated from usage productivity (elite usage → 0.85 snap share)
  const usageProxy = pos === "QB"
    ? clamp(safeDiv(stats.passAtt || 0, gp) / 38, 0, 1)
    : pos === "RB"
    ? clamp(safeDiv((stats.rushAtt || 0) + (stats.rec || 0), gp) / 22, 0, 1)
    : clamp(tgtPG / (LEAG_TGT_PG[pos] || 7), 0, 1);

  const snapShare   = 0.30 + usageProxy * 0.55; // range 0.30–0.85
  const targetShare = clamp(tgtPG  / (LEAG_TGT_PG[pos]  || 5), 0, 1);
  const carryShare  = clamp(rushPG / (LEAG_RUSH_PG[pos] || 5), 0, 1);

  const expectedVolume = snapShare * 0.4 + targetShare * 0.3 + carryShare * 0.3;
  return fmt2(clamp(expectedVolume * 10 * gpPct, 0, 10)); // scale to 0–10, penalize low game counts
}

// ── 2. Efficiency Score (0–10) ────────────────────────────────────────────────
// expectedEfficiency = yprrScore×0.4 + separationScore×0.3 + effVsPressure×0.3
export function computeEfficiencyScore(stats, pos) {
  if (!stats) return 0;
  const g = Math.max(stats.gp || 1, 1);

  // Kicker: efficiency = FG% (70% = floor, 95% = elite)
  if (pos === "K") {
    const fgPct = stats.fgPct > 1 ? stats.fgPct / 100 : (stats.fgPct || safeDiv(stats.fgm || 0, Math.max(stats.fga || 1, 1)));
    return fmt2(clamp((fgPct - 0.70) / 0.25 * 10, 0, 10));
  }

  // yardsPerRouteRun proxy: recYd / max(tgt, 1)
  const yprr      = safeDiv(stats.recYd || 0, Math.max(stats.tgt || 1, 1));
  const yprrScore = clamp(yprr / 14, 0, 1); // 14 yds/tgt = elite

  // Separation proxy: recYd/tgt vs position peer baseline
  const baselineYprr = { QB: 0, RB: 5, WR: 10, TE: 9 }[pos] || 8;
  const separationScore = clamp((yprr - baselineYprr / 2) / baselineYprr, 0, 1);

  // Efficiency vs pressure
  let effVsPressure = 0.5;
  if (pos === "QB") {
    const ypa = safeDiv(stats.passYd || 0, Math.max(stats.passAtt || 1, 1));
    effVsPressure = clamp((ypa - 5) / 5, 0, 1);
  } else if (pos === "RB") {
    const ypc = safeDiv(stats.rushYd || 0, Math.max(stats.rushAtt || 1, 1));
    effVsPressure = clamp((ypc - 2) / 4, 0, 1);
  } else {
    const fptsPerTgt = safeDiv(stats.fpts || 0, Math.max(stats.tgt || 1, 1));
    effVsPressure = clamp(fptsPerTgt / 1.9, 0, 1); // 1.9 fpts/tgt = elite
  }

  const expectedEfficiency = yprrScore * 0.4 + separationScore * 0.3 + effVsPressure * 0.3;
  return fmt2(clamp(expectedEfficiency * 10, 0, 10));
}

// ── 3. Trend Score (0–10) ─────────────────────────────────────────────────────
// trendScore = (recentFptsPerGame - weightedAvg) / weightedAvg → maps to 0–10
export function computeTrendScore(allStats) {
  if (!allStats) return 5.0;
  const years = Object.keys(allStats).map(Number).sort((a, b) => b - a);
  if (years.length === 0) return 5.0;
  if (years.length === 1) return years[0] >= 2024 ? 5.5 : 5.0;

  // 3-year weighted average fpts/game
  const W = [0.55, 0.30, 0.15];
  let wTotal = 0, wSum = 0;
  for (let i = 0; i < Math.min(years.length, 3); i++) {
    const s = allStats[years[i]];
    if ((s?.gp || 0) < 2) continue;
    wTotal += W[i] * (s.fpts || 0) / Math.max(s.gp, 1);
    wSum   += W[i];
  }
  const weightedAvg = wSum > 0 ? wTotal / wSum : 0;

  // Recent season fpts/game
  const recent = allStats[years[0]];
  const recentFPG = safeDiv(recent?.fpts || 0, Math.max(recent?.gp || 1, 1));

  if (weightedAvg === 0) return recentFPG > 0 ? 6.5 : 5.0;

  // trendScore: (recent - avg) / avg → clamp to ±0.5 → map to 0–10 with 5 at breakeven
  const trendRatio = clamp((recentFPG - weightedAvg) / weightedAvg, -0.5, 0.5);
  return fmt2(5 + trendRatio * 10);
}

// ── 4. Matchup Score (0–10) ──────────────────────────────────────────────────
// matchupAdjustment = (def.fantasyPtsAllowedPos - leagueAvgPos) / leagueAvgPos
// For player on their TEAM: represents game-script tendency (bad defense → need to pass more)
// Higher = player's team defense is weak → team often plays from behind → more passing opportunities
export function computeMatchupScore(pos, playerTeam) {
  if (pos === "K") return 5.0; // kicker matchup score is neutral (team-independent)
  const def = DEFENSE_PROFILES[playerTeam];
  if (!def) return 5.0;

  const leagAvg = LEAGUE_AVG_FPTS[pos] || 12;
  const posKey  = `fantasyPtsAllowed${pos}`;
  const defPts  = def[posKey] || leagAvg;

  // matchupAdjustment: positive = team allows more pts → likely plays from behind → pass more
  const matchupAdj = (defPts - leagAvg) / leagAvg;

  // Game-script effect: bad defense benefits passers (QB/WR/TE), hurts runners (RB)
  const gameScriptMult = pos === "RB" ? -0.8 : 1.0;
  const adjustedAdj    = matchupAdj * gameScriptMult;

  // Map to 0–10 scale (5 = league average)
  return fmt2(clamp(5 + adjustedAdj * 8, 0, 10));
}

// ── Context Multiplier ────────────────────────────────────────────────────────
// contextMultiplier = 1 + matchupAdj×0.35 + pressureImpact×0.2 + trendScore×0.25 + teamEnv×0.2
function computeContextMultiplier(player, recentStats, allStats, teamWins) {
  const pos = player.pos;
  const def = DEFENSE_PROFILES[player.tm];

  // matchupAdjustment
  const leagAvg    = LEAGUE_AVG_FPTS[pos] || 12;
  const posKey     = `fantasyPtsAllowed${pos}`;
  const defPts     = def?.[posKey] || leagAvg;
  const matchupAdj = (defPts - leagAvg) / leagAvg * (pos === "RB" ? -0.8 : 1.0);

  // pressureImpact (QB-specific)
  let pressureImpact = 0;
  if (pos === "QB" && recentStats && def) {
    const ypa = safeDiv(recentStats.passYd || 0, Math.max(recentStats.passAtt || 1, 1));
    pressureImpact = clamp((ypa - 7.0) / 7.0 * def.pressureRate, -0.20, 0.20);
  }

  // trendScore: recent vs 3-year weighted avg → [-0.5, +0.5]
  const years = allStats
    ? Object.keys(allStats).map(Number).sort((a, b) => b - a)
    : [];
  const W = [0.55, 0.30, 0.15];
  let wTotal = 0, wSum = 0;
  for (let i = 0; i < Math.min(years.length, 3); i++) {
    const s = allStats[years[i]];
    if ((s?.gp || 0) < 2) continue;
    wTotal += W[i] * (s.fpts || 0) / Math.max(s.gp, 1);
    wSum   += W[i];
  }
  const weightedAvg = wSum > 0 ? wTotal / wSum : 0;
  const recentFPG   = safeDiv(recentStats?.fpts || 0, Math.max(recentStats?.gp || 1, 1));
  const trendScore  = (recentFPG > 0 && weightedAvg > 0)
    ? clamp((recentFPG - weightedAvg) / weightedAvg, -0.50, 0.50)
    : 0;

  // teamScoringEnvironment: wins → [-0.2, +0.2]
  const wins = teamWins ?? 8;
  const teamScoringEnv = ((wins / 17) - 0.50) * 0.40;

  const ctx = 1
    + matchupAdj     * 0.35
    + pressureImpact * 0.20
    + trendScore     * 0.25
    + teamScoringEnv * 0.20;

  return clamp(ctx, 0.50, 1.80);
}

// ── Risk Multiplier ────────────────────────────────────────────────────────────
// riskMultiplier = 1 - volatilityScore×0.25 - injuryRiskScore×0.25
function computeRiskMultiplier(recentStats, allStats) {
  // Volatility: coefficient of variation across recent seasons
  const years = allStats
    ? Object.keys(allStats).map(Number).sort((a, b) => b - a).slice(0, 3)
    : [];
  let volatilityScore = 0.40;
  if (years.length >= 2) {
    const vals = years
      .map(yr => allStats[yr] ? safeDiv(allStats[yr].fpts || 0, Math.max(allStats[yr].gp || 1, 1)) : 0)
      .filter(v => v > 0);
    if (vals.length >= 2) {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (mean > 0) {
        const variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;
        volatilityScore = clamp(Math.sqrt(variance) / mean, 0, 1);
      }
    }
  }

  // Injury risk: inverse of games played
  const gp = recentStats?.gp ?? 8;
  const injuryRiskScore = clamp(1 - gp / 17, 0, 1);

  return clamp(1 - volatilityScore * 0.25 - injuryRiskScore * 0.25, 0.40, 1.0);
}

// ── Per-player projection ──────────────────────────────────────────────────────
export function projectPlayer(player, allStats, teamWins = null, depthOrder = 2, weather = null) {
  const years = allStats
    ? Object.keys(allStats).map(Number).sort((a, b) => b - a)
    : [];
  const recentYear  = years[0] ?? null;
  const recentStats = recentYear ? allStats[recentYear] : null;

  // Component scores (0–10)
  const volume     = computeVolumeScore(recentStats, player.pos);
  const efficiency = computeEfficiencyScore(recentStats, player.pos);
  const trend      = computeTrendScore(allStats);
  const matchup    = computeMatchupScore(player.pos, player.tm);

  // Elite formula multipliers
  const contextMult = computeContextMultiplier(player, recentStats, allStats, teamWins);
  const riskMult    = computeRiskMultiplier(recentStats, allStats);

  // Depth chart opportunity multiplier: starter = boost, backup = neutral, deep = penalty
  const depthMult = depthOrder === 1 ? 1.12 : depthOrder === 2 ? 0.90 : 0.65;

  // Weather multiplier: affects outdoor games by position
  let wxMult = 1.0;
  if (weather && !weather.isIndoor) {
    const wind = weather.wind || 0;
    const temp = weather.temp ?? 65;
    if (wind > 25) {
      wxMult = player.pos === "K"  ? 0.78
             : player.pos === "QB" ? 0.91
             : (player.pos === "WR" || player.pos === "TE") ? 0.87
             : 1.0; // RB unaffected by wind
    } else if (wind > 15) {
      wxMult = player.pos === "K"  ? 0.88
             : player.pos === "QB" ? 0.95
             : (player.pos === "WR" || player.pos === "TE") ? 0.94
             : 1.0;
    }
    if (temp < 32) wxMult *= 0.95; // freezing compounds wind penalty
  } else if (weather?.isIndoor) {
    // Dome boost for passing game
    if (player.pos === "QB" || player.pos === "WR" || player.pos === "TE") wxMult = 1.03;
  }

  // Base projection from 4 components
  const baseScore = volume * 0.40 + efficiency * 0.25 + trend * 0.20 + matchup * 0.15;

  // Apply all multipliers (clamp to 0–10)
  const projection = fmt2(clamp(baseScore * contextMult * riskMult * depthMult * wxMult, 0, 10));

  // Floor/ceiling
  const floor   = fmt2(clamp(baseScore * Math.min(contextMult, 1.0) * Math.max(riskMult - 0.10, 0.35), 0, projection));
  const ceiling = fmt2(clamp(baseScore * (contextMult + 0.10) * 0.92, projection, 10));

  return {
    ...player,
    volume,
    efficiency,
    trend,
    matchup,
    projection,
    floor,
    ceiling,
    wxMult,
    hasData:    !!recentStats,
    recentYear,
    recentStats,
  };
}

// ── Normalize name for map lookup ─────────────────────────────────────────────
function normalizeForLookup(name = "") {
  return name
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/i, "")
    .replace(/[.']/g, "")
    .trim();
}

// ── Rank all players ───────────────────────────────────────────────────────────
export function rankPlayers(players, statsCache, sleeperMap = null, weatherMap = null) {
  return players
    .map(p => {
      // Kickers: Sleeper doesn't rank K, so default to starter (depthOrder=1)
      let depthOrder = p.pos === "K" ? 1 : 2;
      if (sleeperMap?.size) {
        const nk = normalizeForLookup(p.nm);
        depthOrder = sleeperMap.get(`${nk}|${p.pos}|${p.tm}`)?.depthOrder
          ?? sleeperMap.get(`${nk}|${p.pos}`)?.depthOrder
          ?? (p.pos === "K" ? 1 : 2);
      }
      const weather = weatherMap?.get(p.tm) ?? null;
      return projectPlayer(p, statsCache[p.id] ?? null, null, depthOrder, weather);
    })
    .sort((a, b) => b.projection - a.projection);
}

export function enrichWithExternalRanks(projectedPlayers, sleeperMap, espnMap) {
  if (!projectedPlayers?.length) return projectedPlayers;
  const hasS = sleeperMap?.size > 0;
  const hasE = espnMap?.size > 0;
  if (!hasS && !hasE) return projectedPlayers;

  return projectedPlayers.map(p => {
    const nk = normalizeForLookup(p.nm);
    const sleeperEntry = hasS
      ? (sleeperMap.get(`${nk}|${p.pos}|${p.tm}`) || sleeperMap.get(`${nk}|${p.pos}`))
      : null;
    const espnEntry = hasE ? espnMap.get(`${nk}|${p.pos}`) : null;

    return {
      ...p,
      sleeperRank: sleeperEntry?.rank ?? null,
      espnRank:    espnEntry?.rank    ?? null,
    };
  });
}
