// ─────────────────────────────────────────────────────────────────────────────
//  Projection Engine V2 — Role + Usage + Scoring Format
//
//  Extends V1 with:
//    • Scoring format support (PPR / Half-PPR / Standard, 4pt / 6pt QB TDs)
//    • Per-player "notes" generation (1–3 sentence insight string)
//    • recomputeStatsCache(cache, format) — recalculates fpts for any format
//
//  Component weights (same as V1):
//    projection = 35% usage + 20% highValue + 15% efficiency + 15% recency
//                 + 10% environment + 5% matchup
//    floor      = 50% usage + 20% efficiency + 15% recency×conf + 15% environment
//    ceiling    = 25% usage + 45% highValue + 20% efficiency + 10% environment
// ─────────────────────────────────────────────────────────────────────────────

const clamp   = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt2    = v => +v.toFixed(2);
const safeDiv = (n, d, fb = 0) => (d && d > 0 ? n / d : fb);

// ── Default scoring format ────────────────────────────────────────────────────
export const DEFAULT_FORMAT = { scoring: "ppr", tdPts: 4 };

// ── Recompute fpts from raw stat fields given a scoring format ────────────────
// Returns a new stats-year object with updated fpts.
function recomputeFpts(s, { scoring = "ppr", tdPts = 4 } = {}) {
  if (!s) return s;
  const recPPR =
    scoring === "ppr" ? 1 : scoring === "half" ? 0.5 : 0;
  const fpts = Math.round(
    (s.passYd  || 0) * 0.04 +
    (s.passTD  || 0) * tdPts +
    (s.passInt || 0) * -2 +
    (s.rushYd  || 0) * 0.1  +
    (s.rushTD  || 0) * 6    +
    (s.rec     || 0) * recPPR +
    (s.recYd   || 0) * 0.1  +
    (s.recTD   || 0) * 6    +
    (s.fum     || 0) * -2
  );
  return { ...s, fpts };
}

// ── Recompute an entire statsCache for a given format ─────────────────────────
// Returns a new cache object — does NOT mutate the original.
export function recomputeStatsCache(cache, format = DEFAULT_FORMAT) {
  if (!cache) return cache;
  const out = {};
  for (const [pid, seasons] of Object.entries(cache)) {
    if (!seasons || typeof seasons !== "object") { out[pid] = seasons; continue; }
    const newSeasons = {};
    for (const [yr, s] of Object.entries(seasons)) {
      newSeasons[yr] = recomputeFpts(s, format);
    }
    out[pid] = newSeasons;
  }
  return out;
}

// ── Percentile rank of val in a sorted-ascending array (0–1) ─────────────────
function pctRank(sorted, val) {
  if (!sorted.length) return 0.5;
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < val) lo = m + 1; else hi = m; }
  const below = lo;
  let hi2 = below;
  while (hi2 < sorted.length && sorted[hi2] === val) hi2++;
  const equal = hi2 - below;
  return clamp((below + equal * 0.5) / sorted.length, 0.02, 0.98);
}
const to10 = pct => fmt2(clamp(pct * 10, 0, 10));

// ── Best recent stats for a player ───────────────────────────────────────────
function bestStats(allStats, minGP = 1) {
  if (!allStats) return null;
  const years = Object.keys(allStats).map(Number).sort((a, b) => b - a);
  for (const yr of years) {
    if ((allStats[yr]?.gp || 0) >= minGP) return { s: allStats[yr], yr };
  }
  return years.length ? { s: allStats[years[0]], yr: years[0] } : null;
}

function gpConf(gp) { return clamp((gp || 0) / 12, 0.30, 1.0); }

// ── Weighted recent fpts/game across 3 seasons ────────────────────────────────
function weightedFptsPerGame(allStats) {
  if (!allStats) return 0;
  const years = Object.keys(allStats).map(Number).sort((a, b) => b - a);
  const W = [0.55, 0.30, 0.15];
  let total = 0, wsum = 0;
  for (let i = 0; i < Math.min(years.length, 3); i++) {
    const s = allStats[years[i]];
    const gp = Math.max(s?.gp || 1, 1);
    if ((s?.gp || 0) < 2) continue;
    total += W[i] * (s.fpts || 0) / gp;
    wsum  += W[i];
  }
  return wsum > 0 ? total / wsum : 0;
}

// ── Role label ────────────────────────────────────────────────────────────────
export function getRole(pos, s, gp) {
  if (!s) return pos === "QB" ? "Signal Caller" : "Depth";
  const g = Math.max(gp || 1, 1);
  if (pos === "QB") {
    const attPG  = safeDiv(s.passAtt || 0, g);
    const rushPG = safeDiv(s.rushYd  || 0, g);
    if (rushPG >= 35) return "Rushing Threat";
    if (attPG  >= 36) return "Volume Passer";
    if (attPG  >= 28) return "Pocket Passer";
    return "Game Manager";
  }
  if (pos === "RB") {
    const touchesPG = safeDiv((s.rushAtt || 0) + (s.rec || 0), g);
    const recPG     = safeDiv(s.rec     || 0, g);
    const rushTDPG  = safeDiv(s.rushTD  || 0, g);
    if (touchesPG >= 18)  return "Workhorse";
    if (recPG     >= 4.5) return "Pass-Game Back";
    if (rushTDPG  >= 0.5) return "Red-Zone Back";
    if (touchesPG >= 10)  return "Featured Back";
    return "Change of Pace";
  }
  if (pos === "WR") {
    const tgtPG       = safeDiv(s.tgt   || 0, g);
    const recYdPerTgt = safeDiv(s.recYd || 0, Math.max(s.tgt || 1, 1));
    const recTDPG     = safeDiv(s.recTD || 0, g);
    if (tgtPG >= 8)         return "Alpha WR";
    if (recYdPerTgt >= 14)  return "Deep Threat";
    if (recTDPG >= 0.5)     return "Red-Zone WR";
    if (tgtPG >= 5)         return "WR2 / Flex";
    return "Depth WR";
  }
  if (pos === "TE") {
    const tgtPG   = safeDiv(s.tgt   || 0, g);
    const recTDPG = safeDiv(s.recTD || 0, g);
    if (tgtPG   >= 6)   return "Receiving TE";
    if (recTDPG >= 0.4) return "Red-Zone TE";
    if (tgtPG   >= 3)   return "Flex TE";
    return "Blocking TE";
  }
  return "Role Player";
}

// ── Generate a 1–2 sentence insight note ─────────────────────────────────────
function generateNote(player, s, gp, depthRank, teamWins, role, projection) {
  if (!s) return `${player.nm} has limited historical data available.`;
  const g = Math.max(gp, 1);
  const pos = player.pos;
  const parts = [];

  if (pos === "QB") {
    const attPG  = safeDiv(s.passAtt || 0, g).toFixed(1);
    const passTD = s.passTD || 0;
    parts.push(`${role} averaging ${attPG} att/g with ${passTD} TDs.`);
  } else if (pos === "RB") {
    const touches = safeDiv((s.rushAtt || 0) + (s.rec || 0), g).toFixed(1);
    const ypc     = s.rushAtt > 5 ? safeDiv(s.rushYd || 0, s.rushAtt).toFixed(1) : null;
    parts.push(
      `${role}: ${touches} touches/g${ypc ? `, ${ypc} yds/carry` : ""}.`
    );
  } else {
    const tgtPG  = safeDiv(s.tgt || 0, g).toFixed(1);
    const ypTgt  = s.tgt > 2 ? safeDiv(s.recYd || 0, s.tgt).toFixed(1) : null;
    parts.push(
      `${role}: ${tgtPG} tgt/g${ypTgt ? `, ${ypTgt} yds/tgt` : ""}.`
    );
  }

  if (depthRank === 1) {
    parts.push("Confirmed starter.");
  } else if (depthRank === 2) {
    parts.push("Listed as backup — value depends on injuries.");
  }

  if (teamWins != null) {
    if (teamWins >= 12) parts.push(`Strong offense (${teamWins}W team) boosts ceiling.`);
    else if (teamWins <= 5) parts.push(`Weak team context (${teamWins}W) limits floor.`);
  }

  return parts.join(" ");
}

// ── Build league distributions ────────────────────────────────────────────────
function buildDistributions(players, statsCache) {
  const pos_keys = {
    QB: { attPG:[], fptsPG:[], fptsPerAtt:[], passTDPG:[], rushYdPG:[] },
    RB: { touchesPG:[], fptsPG:[], fptsPerTouch:[], rushTDPG:[], recPG:[], rushSharePct:[] },
    WR: { tgtPG:[], fptsPG:[], fptsPerTgt:[], recYdPerTgt:[], recTDPG:[], tgtSharePct:[] },
    TE: { tgtPG:[], fptsPG:[], fptsPerTgt:[], recYdPerTgt:[], recTDPG:[], tgtSharePct:[] },
  };

  const teamTgt = {}, teamRush = {};
  for (const p of players) {
    const best = bestStats(statsCache[p.id], 4);
    if (!best) continue;
    const { s } = best;
    teamTgt[p.tm]  = (teamTgt[p.tm]  || 0) + (s.tgt     || 0);
    teamRush[p.tm] = (teamRush[p.tm] || 0) + (s.rushAtt || 0);
  }

  for (const p of players) {
    const best = bestStats(statsCache[p.id], 4);
    if (!best) continue;
    const { s } = best;
    const gp = Math.max(s.gp || 1, 1);
    const pos = p.pos;
    const c = pos_keys[pos];
    if (!c) continue;

    if (pos === "QB") {
      c.attPG.push(safeDiv(s.passAtt || 0, gp));
      c.fptsPG.push(safeDiv(s.fpts   || 0, gp));
      c.fptsPerAtt.push((s.passAtt || 0) > 10 ? safeDiv(s.fpts || 0, s.passAtt) : 0);
      c.passTDPG.push(safeDiv(s.passTD || 0, gp));
      c.rushYdPG.push(safeDiv(s.rushYd || 0, gp));
    } else if (pos === "RB") {
      const touches = (s.rushAtt || 0) + (s.rec || 0);
      c.touchesPG.push(safeDiv(touches, gp));
      c.fptsPG.push(safeDiv(s.fpts || 0, gp));
      c.fptsPerTouch.push(touches > 4 ? safeDiv(s.fpts || 0, touches) : 0);
      c.rushTDPG.push(safeDiv(s.rushTD || 0, gp));
      c.recPG.push(safeDiv(s.rec || 0, gp));
      c.rushSharePct.push(teamRush[p.tm] > 0 ? (s.rushAtt || 0) / teamRush[p.tm] : 0);
    } else {
      c.tgtPG.push(safeDiv(s.tgt   || 0, gp));
      c.fptsPG.push(safeDiv(s.fpts || 0, gp));
      c.fptsPerTgt.push((s.tgt || 0) > 2 ? safeDiv(s.fpts || 0, s.tgt) : 0);
      c.recYdPerTgt.push((s.tgt || 0) > 2 ? safeDiv(s.recYd || 0, s.tgt) : 0);
      c.recTDPG.push(safeDiv(s.recTD || 0, gp));
      c.tgtSharePct.push(teamTgt[p.tm] > 0 ? (s.tgt || 0) / teamTgt[p.tm] : 0);
    }
  }

  const dist = {};
  for (const [pos, keys] of Object.entries(pos_keys)) {
    dist[pos] = {};
    for (const [k, arr] of Object.entries(keys)) {
      dist[pos][k] = [...arr].sort((a, b) => a - b);
    }
  }
  return { dist, teamTgt, teamRush };
}

// ── Build depth rank map ──────────────────────────────────────────────────────
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
  const best    = bestStats(allStats, 3);
  const s       = best?.s    || null;
  const recentYear = best?.yr || null;
  const gp      = s ? Math.max(s.gp || 1, 1) : 1;
  const pos     = player.pos;
  const hasData = !!s;
  const conf    = s ? gpConf(s.gp) : 0.3;
  const d       = dist[pos] || {};

  // Usage
  let usagePG = 0, usagePct = 0.5;
  if (pos === "QB") {
    usagePG  = s ? safeDiv(s.passAtt || 0, gp) : 0;
    usagePct = d.attPG ? pctRank(d.attPG, usagePG) : 0.5;
  } else if (pos === "RB") {
    usagePG  = s ? safeDiv((s.rushAtt || 0) + (s.rec || 0), gp) : 0;
    usagePct = d.touchesPG ? pctRank(d.touchesPG, usagePG) : 0.5;
  } else {
    usagePG  = s ? safeDiv(s.tgt || 0, gp) : 0;
    usagePct = d.tgtPG ? pctRank(d.tgtPG, usagePG) : 0.5;
  }
  const usage = to10(usagePct);

  // High-Value
  let hvPct = 0.5;
  if (pos === "QB") {
    const tdPct   = d.passTDPG ? pctRank(d.passTDPG, s ? safeDiv(s.passTD || 0, gp) : 0) : 0.5;
    const rushPct = d.rushYdPG ? pctRank(d.rushYdPG, s ? safeDiv(s.rushYd || 0, gp) : 0) : 0.5;
    hvPct = 0.70 * tdPct + 0.30 * rushPct;
  } else if (pos === "RB") {
    const tdPct    = d.rushTDPG    ? pctRank(d.rushTDPG,    s ? safeDiv(s.rushTD || 0, gp) : 0)  : 0.5;
    const recPct   = d.recPG       ? pctRank(d.recPG,       s ? safeDiv(s.rec    || 0, gp) : 0)  : 0.5;
    const sharePct = d.rushSharePct ? pctRank(d.rushSharePct, (s && teamRush[player.tm] > 0) ? (s.rushAtt || 0) / teamRush[player.tm] : 0) : 0.5;
    hvPct = 0.40 * tdPct + 0.35 * recPct + 0.25 * sharePct;
  } else {
    const tdPct    = d.recTDPG     ? pctRank(d.recTDPG,    s ? safeDiv(s.recTD || 0, gp) : 0) : 0.5;
    const aydPct   = d.recYdPerTgt ? pctRank(d.recYdPerTgt, (s && (s.tgt || 0) > 2) ? safeDiv(s.recYd || 0, s.tgt) : 0) : 0.5;
    const sharePct = d.tgtSharePct  ? pctRank(d.tgtSharePct, (s && teamTgt[player.tm] > 0) ? (s.tgt || 0) / teamTgt[player.tm] : 0) : 0.5;
    const split    = pos === "TE" ? [0.45, 0.30, 0.25] : [0.30, 0.40, 0.30];
    hvPct = split[0] * tdPct + split[1] * aydPct + split[2] * sharePct;
  }
  const highValue = to10(hvPct);

  // Efficiency (GP-shrunk toward mean)
  let effPct = 0.5;
  if (pos === "QB") {
    const v = s && (s.passAtt || 0) > 10 ? safeDiv(s.fpts || 0, s.passAtt) : 0;
    effPct = d.fptsPerAtt ? pctRank(d.fptsPerAtt, v) : 0.5;
  } else if (pos === "RB") {
    const t = s ? (s.rushAtt || 0) + (s.rec || 0) : 0;
    const v = t > 4 ? safeDiv(s.fpts || 0, t) : 0;
    effPct = d.fptsPerTouch ? pctRank(d.fptsPerTouch, v) : 0.5;
  } else {
    const v = s && (s.tgt || 0) > 2 ? safeDiv(s.fpts || 0, s.tgt) : 0;
    effPct = d.fptsPerTgt ? pctRank(d.fptsPerTgt, v) : 0.5;
  }
  effPct = effPct * conf + 0.5 * (1 - conf);
  const efficiency = to10(effPct);

  // Recency
  let recencyPct = 0.5;
  const wFptsPerGame = weightedFptsPerGame(allStats);
  if (d.fptsPG && wFptsPerGame > 0) recencyPct = pctRank(d.fptsPG, wFptsPerGame);
  recencyPct = recencyPct * conf + 0.5 * (1 - conf);
  const recency = to10(recencyPct);

  // Environment
  const depthScore  = depthRank === 1 ? 8.0 : depthRank === 2 ? 5.0 : depthRank === 3 ? 2.5 : 4.5;
  const teamScore   = clamp(safeDiv((teamWins || 8) * 10, 17, 4.7), 1, 10);
  const environment = fmt2(0.60 * depthScore + 0.40 * teamScore);

  // Matchup placeholder
  const matchup = 5.0;

  // Projection / Floor / Ceiling
  const projection = fmt2(
    0.35 * usage + 0.20 * highValue + 0.15 * efficiency +
    0.15 * recency + 0.10 * environment + 0.05 * matchup
  );
  const floor = fmt2(clamp(
    0.50 * usage + 0.20 * efficiency +
    0.15 * recency * conf + 0.15 * environment,
    0, 10
  ));
  const ceiling = fmt2(clamp(
    0.25 * usage + 0.45 * highValue + 0.20 * efficiency + 0.10 * environment,
    0, 10
  ));

  // Volatility
  const yearlyFpg = allStats
    ? Object.values(allStats)
        .filter(sy => (sy.gp || 0) >= 4)
        .map(sy => safeDiv(sy.fpts || 0, Math.max(sy.gp || 1, 1)))
    : [];
  let volatility = 5.0;
  if (yearlyFpg.length >= 2) {
    const mean   = yearlyFpg.reduce((a, b) => a + b, 0) / yearlyFpg.length;
    const stdDev = Math.sqrt(yearlyFpg.reduce((a, v) => a + (v - mean) ** 2, 0) / yearlyFpg.length);
    const cv     = mean > 0 ? stdDev / mean : 0;
    volatility   = fmt2(clamp(cv * 16, 0, 10));
  }

  // Boom / Bust %
  const boomPct = Math.round(clamp((ceiling - 5) * 20, 0, 90));
  const bustPct = Math.round(clamp((5 - floor)   * 20, 0, 90));

  // Role
  const role = getRole(pos, s, gp);

  // Note
  const note = generateNote(player, s, gp, depthRank, teamWins, role, projection);

  return {
    ...player,
    usage, highValue, efficiency, recency, environment, matchup,
    projection, floor, ceiling,
    confidence: fmt2(conf),
    boomPct, bustPct,
    role, volatility, note,
    // legacy aliases
    volume: usage,
    trend:  recency,
    hasData, recentYear, recentStats: s,
  };
}

// ── Public: rank all players ──────────────────────────────────────────────────
export function rankPlayersV2(
  players,
  statsCache,
  depthCharts = {},
  standings25 = {},
  format = DEFAULT_FORMAT
) {
  // Recompute fpts for the requested scoring format before building distributions
  const cache = format.scoring === "ppr" && format.tdPts === 4
    ? statsCache
    : recomputeStatsCache(statsCache, format);

  const { dist, teamTgt, teamRush } = buildDistributions(players, cache);
  const depthRanks = buildDepthRanks(players, depthCharts);

  return players
    .map(p => {
      const allStats  = cache[p.id] ?? null;
      const depthRank = depthRanks[p.id] || 0;
      const teamWins  = standings25[p.tm]?.wins ?? null;
      return scorePlayer(p, allStats, dist, teamTgt, teamRush, depthRank, teamWins);
    })
    .sort((a, b) => b.projection - a.projection);
}

// ── Re-export V1 name for backwards compat ────────────────────────────────────
export { rankPlayersV2 as rankPlayers };
