// ─────────────────────────────────────────────────────────────────────────────
//  "Start/Sit Confidence Engine" — Role + Usage Edition
//
//  Scores every player on six percentile-based components (0–10 each):
//    Usage       — touches / targets per game vs. position peers
//    High-Value  — TD equity, air yards proxy, target/rush share
//    Efficiency  — fantasy pts per opportunity (GP-shrunk toward mean)
//    Recency     — weighted recent form (55% yr0 / 30% yr-1 / 15% yr-2)
//    Environment — team offensive quality + depth-chart position
//    Matchup     — opponent weakness placeholder (5.0 = league avg)
//
//  Outputs per player:
//    projection  — blended score  (35% usage + 20% hv + 15% eff + 15% rec + 10% env + 5% mup)
//    floor       — safe floor      (50% usage + 20% eff + 15% rec×conf + 15% env)
//    ceiling     — upside ceiling  (25% usage + 45% hv + 20% eff + 10% env)
//    confidence  — GP-based sample confidence 0–1
//    boomPct     — % chance of ceiling-ish week
//    bustPct     — % chance of floor-ish week
//    role        — human-readable role label
//    volatility  — season-to-season variance (0–10)
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt2  = v => +v.toFixed(2);
const safeDiv = (n, d, fallback = 0) => (d && d > 0) ? n / d : fallback;

// ── Percentile rank of val in a sorted-ascending array (returns 0–1) ─────────
function pctRank(sorted, val) {
  if (!sorted.length) return 0.5;
  // binary search: count values strictly less than val
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < val) lo = m + 1; else hi = m; }
  const below = lo;
  // count equal values
  let hi2 = below;
  while (hi2 < sorted.length && sorted[hi2] === val) hi2++;
  const equal = hi2 - below;
  return clamp((below + equal * 0.5) / sorted.length, 0.02, 0.98);
}
function to10(pct) { return fmt2(clamp(pct * 10, 0, 10)); }

// ── Best recent stats for a player ───────────────────────────────────────────
function bestStats(allStats, minGP = 1) {
  if (!allStats) return null;
  const years = Object.keys(allStats).map(Number).sort((a, b) => b - a);
  for (const yr of years) {
    if ((allStats[yr]?.gp || 0) >= minGP) return { s: allStats[yr], yr };
  }
  return years.length ? { s: allStats[years[0]], yr: years[0] } : null;
}

// ── GP-based confidence factor ────────────────────────────────────────────────
function gpConf(gp) { return clamp((gp || 0) / 12, 0.30, 1.0); }

// ── Weighted recent fpts/game (3-year weighted average) ──────────────────────
function weightedFptsPerGame(allStats) {
  if (!allStats) return 0;
  const years = Object.keys(allStats).map(Number).sort((a, b) => b - a);
  const W = [0.55, 0.30, 0.15];
  let total = 0, wsum = 0;
  for (let i = 0; i < Math.min(years.length, 3); i++) {
    const s = allStats[years[i]];
    const gp = Math.max(s?.gp || 1, 1);
    if ((s?.gp || 0) < 2) continue;   // skip injury-truncated seasons
    total += W[i] * (s.fpts || 0) / gp;
    wsum  += W[i];
  }
  return wsum > 0 ? total / wsum : 0;
}

// ── Role label ────────────────────────────────────────────────────────────────
function getRole(pos, s, gp) {
  if (!s) return pos === 'QB' ? 'Signal Caller' : 'Depth';
  const g = Math.max(gp || 1, 1);

  if (pos === 'QB') {
    const attPG   = safeDiv(s.passAtt || 0, g);
    const rushPG  = safeDiv(s.rushYd  || 0, g);
    if (rushPG >= 35) return 'Rushing Threat';
    if (attPG  >= 36) return 'Volume Passer';
    if (attPG  >= 28) return 'Pocket Passer';
    return 'Game Manager';
  }

  if (pos === 'RB') {
    const touchesPG = safeDiv((s.rushAtt || 0) + (s.rec || 0), g);
    const recPG     = safeDiv(s.rec    || 0, g);
    const rushTDPG  = safeDiv(s.rushTD || 0, g);
    if (touchesPG >= 18)  return 'Workhorse';
    if (recPG     >= 4.5) return 'Pass-Game Back';
    if (rushTDPG  >= 0.5) return 'Red-Zone Back';
    if (touchesPG >= 10)  return 'Featured Back';
    return 'Change of Pace';
  }

  if (pos === 'WR') {
    const tgtPG       = safeDiv(s.tgt   || 0, g);
    const recYdPerTgt = safeDiv(s.recYd || 0, Math.max(s.tgt || 1, 1));
    const recTDPG     = safeDiv(s.recTD || 0, g);
    if (tgtPG >= 8)         return 'Alpha WR';
    if (recYdPerTgt >= 14)  return 'Deep Threat';
    if (recTDPG >= 0.5)     return 'Red-Zone WR';
    if (tgtPG >= 5)         return 'WR2 / Flex';
    return 'Depth WR';
  }

  if (pos === 'TE') {
    const tgtPG   = safeDiv(s.tgt   || 0, g);
    const recTDPG = safeDiv(s.recTD || 0, g);
    if (tgtPG   >= 6)  return 'Receiving TE';
    if (recTDPG >= 0.4) return 'Red-Zone TE';
    if (tgtPG   >= 3)  return 'Flex TE';
    return 'Blocking TE';
  }

  return 'Role Player';
}

// ── Build league distributions ────────────────────────────────────────────────
// Computes sorted arrays for each per-game metric, used for percentile scoring.
// Also builds team-level totals for share calculations.
function buildDistributions(players, statsCache) {
  const pos_keys = {
    QB: { attPG:[], fptsPG:[], fptsPerAtt:[], passTDPG:[], rushYdPG:[] },
    RB: { touchesPG:[], fptsPG:[], fptsPerTouch:[], rushTDPG:[], recPG:[], rushSharePct:[] },
    WR: { tgtPG:[], fptsPG:[], fptsPerTgt:[], recYdPerTgt:[], recTDPG:[], tgtSharePct:[] },
    TE: { tgtPG:[], fptsPG:[], fptsPerTgt:[], recYdPerTgt:[], recTDPG:[], tgtSharePct:[] },
  };

  // First pass: team totals (targets + rush attempts) for share calculations
  const teamTgt = {}, teamRush = {};
  for (const p of players) {
    const best = bestStats(statsCache[p.id], 4);
    if (!best) continue;
    const { s } = best;
    teamTgt[p.tm]  = (teamTgt[p.tm]  || 0) + (s.tgt     || 0);
    teamRush[p.tm] = (teamRush[p.tm] || 0) + (s.rushAtt || 0);
  }

  // Second pass: collect per-game metrics
  for (const p of players) {
    const best = bestStats(statsCache[p.id], 4);
    if (!best) continue;
    const { s } = best;
    const gp = Math.max(s.gp || 1, 1);
    const pos = p.pos;
    const c = pos_keys[pos];
    if (!c) continue;

    if (pos === 'QB') {
      c.attPG.push(safeDiv(s.passAtt || 0, gp));
      c.fptsPG.push(safeDiv(s.fpts   || 0, gp));
      c.fptsPerAtt.push((s.passAtt || 0) > 10 ? safeDiv(s.fpts || 0, s.passAtt) : 0);
      c.passTDPG.push(safeDiv(s.passTD || 0, gp));
      c.rushYdPG.push(safeDiv(s.rushYd || 0, gp));

    } else if (pos === 'RB') {
      const touches = (s.rushAtt || 0) + (s.rec || 0);
      c.touchesPG.push(safeDiv(touches, gp));
      c.fptsPG.push(safeDiv(s.fpts || 0, gp));
      c.fptsPerTouch.push(touches > 4 ? safeDiv(s.fpts || 0, touches) : 0);
      c.rushTDPG.push(safeDiv(s.rushTD || 0, gp));
      c.recPG.push(safeDiv(s.rec || 0, gp));
      c.rushSharePct.push(teamRush[p.tm] > 0 ? (s.rushAtt || 0) / teamRush[p.tm] : 0);

    } else { // WR or TE
      c.tgtPG.push(safeDiv(s.tgt   || 0, gp));
      c.fptsPG.push(safeDiv(s.fpts || 0, gp));
      c.fptsPerTgt.push((s.tgt || 0) > 2 ? safeDiv(s.fpts || 0, s.tgt) : 0);
      c.recYdPerTgt.push((s.tgt || 0) > 2 ? safeDiv(s.recYd || 0, s.tgt) : 0);
      c.recTDPG.push(safeDiv(s.recTD || 0, gp));
      c.tgtSharePct.push(teamTgt[p.tm] > 0 ? (s.tgt || 0) / teamTgt[p.tm] : 0);
    }
  }

  // Sort each array ascending (for binary-search percentile rank)
  const dist = {};
  for (const [pos, keys] of Object.entries(pos_keys)) {
    dist[pos] = {};
    for (const [k, arr] of Object.entries(keys)) {
      dist[pos][k] = [...arr].sort((a, b) => a - b);
    }
  }

  return { dist, teamTgt, teamRush };
}

// ── Build depth ranks for all players ────────────────────────────────────────
// Returns { playerId: 1|2|3|0 }  — 1 = starter, 0 = unlisted
function buildDepthRanks(players, depthCharts) {
  const ranks = {};
  for (const p of players) {
    const chart = depthCharts[p.tm];
    if (!chart) { ranks[p.id] = 0; continue; }
    const order = chart[p.pos] || [];
    const idx   = order.indexOf(String(p.id));
    ranks[p.id] = idx === -1 ? 0 : idx + 1;
  }
  return ranks;
}

// ── Score a single player ─────────────────────────────────────────────────────
function scorePlayer(player, allStats, dist, teamTgt, teamRush, depthRank, teamWins) {
  const best = bestStats(allStats, 3);
  const s          = best?.s    || null;
  const recentYear = best?.yr   || null;
  const gp         = s ? Math.max(s.gp || 1, 1) : 1;
  const pos        = player.pos;
  const hasData    = !!s;
  const conf       = s ? gpConf(s.gp) : 0.3;
  const d          = dist[pos] || {};

  // ── Usage Score ──────────────────────────────────────────────────────────
  let usagePG = 0, usagePct = 0.5;
  if (pos === 'QB') {
    usagePG  = s ? safeDiv(s.passAtt || 0, gp) : 0;
    usagePct = d.attPG ? pctRank(d.attPG, usagePG) : 0.5;
  } else if (pos === 'RB') {
    usagePG  = s ? safeDiv((s.rushAtt || 0) + (s.rec || 0), gp) : 0;
    usagePct = d.touchesPG ? pctRank(d.touchesPG, usagePG) : 0.5;
  } else {
    usagePG  = s ? safeDiv(s.tgt || 0, gp) : 0;
    usagePct = d.tgtPG ? pctRank(d.tgtPG, usagePG) : 0.5;
  }
  const usage = to10(usagePct);

  // ── High-Value Usage Score ────────────────────────────────────────────────
  let hvPct = 0.5;
  if (pos === 'QB') {
    const tdPct   = d.passTDPG ? pctRank(d.passTDPG, s ? safeDiv(s.passTD || 0, gp) : 0) : 0.5;
    const rushPct = d.rushYdPG ? pctRank(d.rushYdPG, s ? safeDiv(s.rushYd || 0, gp) : 0) : 0.5;
    hvPct = 0.70 * tdPct + 0.30 * rushPct;

  } else if (pos === 'RB') {
    const tdPct     = d.rushTDPG   ? pctRank(d.rushTDPG,   s ? safeDiv(s.rushTD || 0, gp) : 0) : 0.5;
    const recPct    = d.recPG      ? pctRank(d.recPG,      s ? safeDiv(s.rec    || 0, gp) : 0) : 0.5;
    const sharePct  = d.rushSharePct
      ? pctRank(d.rushSharePct, (s && teamRush[player.tm] > 0) ? (s.rushAtt || 0) / teamRush[player.tm] : 0)
      : 0.5;
    hvPct = 0.40 * tdPct + 0.35 * recPct + 0.25 * sharePct;

  } else { // WR / TE
    const tdPct    = d.recTDPG    ? pctRank(d.recTDPG,    s ? safeDiv(s.recTD || 0, gp) : 0)                : 0.5;
    const aydPct   = d.recYdPerTgt ? pctRank(d.recYdPerTgt, (s && (s.tgt || 0) > 2) ? safeDiv(s.recYd || 0, s.tgt) : 0) : 0.5;
    const sharePct = d.tgtSharePct
      ? pctRank(d.tgtSharePct, (s && teamTgt[player.tm] > 0) ? (s.tgt || 0) / teamTgt[player.tm] : 0)
      : 0.5;
    const teSplit  = pos === 'TE' ? [0.45, 0.30, 0.25] : [0.30, 0.40, 0.30];
    hvPct = teSplit[0] * tdPct + teSplit[1] * aydPct + teSplit[2] * sharePct;
  }
  const highValue = to10(hvPct);

  // ── Efficiency Score (shrunk toward mean for small samples) ──────────────
  let effPct = 0.5;
  if (pos === 'QB') {
    const v = s && (s.passAtt || 0) > 10 ? safeDiv(s.fpts || 0, s.passAtt) : 0;
    effPct = d.fptsPerAtt ? pctRank(d.fptsPerAtt, v) : 0.5;
  } else if (pos === 'RB') {
    const t = s ? (s.rushAtt || 0) + (s.rec || 0) : 0;
    const v = t > 4 ? safeDiv(s.fpts || 0, t) : 0;
    effPct = d.fptsPerTouch ? pctRank(d.fptsPerTouch, v) : 0.5;
  } else {
    const v = s && (s.tgt || 0) > 2 ? safeDiv(s.fpts || 0, s.tgt) : 0;
    effPct = d.fptsPerTgt ? pctRank(d.fptsPerTgt, v) : 0.5;
  }
  effPct = effPct * conf + 0.5 * (1 - conf);   // GP shrinkage
  const efficiency = to10(effPct);

  // ── Recency Score (weighted fpts/game, confidence-adjusted) ──────────────
  let recencyPct = 0.5;
  const wFptsPerGame = weightedFptsPerGame(allStats);
  if (d.fptsPG && wFptsPerGame > 0) recencyPct = pctRank(d.fptsPG, wFptsPerGame);
  recencyPct = recencyPct * conf + 0.5 * (1 - conf);
  const recency = to10(recencyPct);

  // ── Environment Score ─────────────────────────────────────────────────────
  const depthScore = depthRank === 1 ? 8.0 : depthRank === 2 ? 5.0 : depthRank === 3 ? 2.5 : 4.5;
  const teamScore  = clamp(safeDiv((teamWins || 8) * 10, 17, 4.7), 1, 10);
  const environment = fmt2(0.60 * depthScore + 0.40 * teamScore);

  // ── Matchup (placeholder) ─────────────────────────────────────────────────
  const matchup = 5.0;

  // ── Projection / Floor / Ceiling ─────────────────────────────────────────
  const projection = fmt2(
    0.35 * usage +
    0.20 * highValue +
    0.15 * efficiency +
    0.15 * recency +
    0.10 * environment +
    0.05 * matchup
  );
  const floor = fmt2(clamp(
    0.50 * usage +
    0.20 * efficiency +
    0.15 * recency * conf +
    0.15 * environment,
    0, 10
  ));
  const ceiling = fmt2(clamp(
    0.25 * usage +
    0.45 * highValue +
    0.20 * efficiency +
    0.10 * environment,
    0, 10
  ));

  // ── Volatility (CV of fpts/game across qualifying seasons) ───────────────
  const yearlyFptsPerGame = allStats
    ? Object.values(allStats).filter(sy => (sy.gp || 0) >= 4).map(sy => safeDiv(sy.fpts || 0, Math.max(sy.gp || 1, 1)))
    : [];
  let volatility = 5.0;
  if (yearlyFptsPerGame.length >= 2) {
    const mean = yearlyFptsPerGame.reduce((a, b) => a + b, 0) / yearlyFptsPerGame.length;
    const stdDev = Math.sqrt(yearlyFptsPerGame.reduce((a, v) => a + (v - mean) ** 2, 0) / yearlyFptsPerGame.length);
    const cv = mean > 0 ? stdDev / mean : 0;
    volatility = fmt2(clamp(cv * 16, 0, 10));
  }

  // ── Boom / Bust % ─────────────────────────────────────────────────────────
  // boom% = how far ceiling is above league avg (5); bust% = how far floor is below avg
  const boomPct = Math.round(clamp((ceiling - 5) * 20, 0, 90));
  const bustPct = Math.round(clamp((5 - floor)   * 20, 0, 90));

  // ── Role label ────────────────────────────────────────────────────────────
  const role = getRole(pos, s, gp);

  return {
    ...player,
    // component scores
    usage, highValue, efficiency, recency, environment, matchup,
    // outputs
    projection, floor, ceiling,
    confidence: fmt2(conf),
    boomPct, bustPct,
    role, volatility,
    // legacy aliases (used elsewhere in app)
    volume: usage,
    trend:  recency,
    // display helpers
    hasData, recentYear, recentStats: s,
  };
}

// ── Public: rank all players ──────────────────────────────────────────────────
export function rankPlayers(players, statsCache, depthCharts = {}, standings25 = {}) {
  const { dist, teamTgt, teamRush } = buildDistributions(players, statsCache);
  const depthRanks = buildDepthRanks(players, depthCharts);

  return players.map(p => {
    const allStats  = statsCache[p.id] ?? null;
    const depthRank = depthRanks[p.id]     || 0;
    const teamWins  = standings25[p.tm]?.wins ?? null;
    return scorePlayer(p, allStats, dist, teamTgt, teamRush, depthRank, teamWins);
  }).sort((a, b) => b.projection - a.projection);
}

// ── Legacy single-export stubs (keep other code that imports these working) ───
export function computeVolumeScore()     { return 5.0; }
export function computeEfficiencyScore() { return 5.0; }
export function computeTrendScore()      { return 5.0; }
export function computeMatchupScore()    { return 5.0; }
export function projectPlayer(player, allStats) {
  return { ...player, projection:5, volume:5, efficiency:5, trend:5, matchup:5, hasData:!!allStats, recentYear:null, recentStats:null };
}
