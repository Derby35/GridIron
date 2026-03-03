// ─────────────────────────────────────────────────────────────────────────────
//  Market Inefficiency Engine
//
//  ExploitScore = ValueDelta × (0.6 + 0.4 × StabilityFactor) × (1 + OpportunityTrend)
//  ValueDelta   = ModelProjectedPoints − MarketImpliedPoints
//  MarketImpliedPoints = a − b × ln(rank)    [per-position regression]
//
//  Strategy-aware adjustment:
//    Safety:  ExploitAdjusted = ExploitScore × (1 − 0.35 × CVS)
//    Upside:  ExploitAdjusted = ExploitScore × (1 + 0.25 × CVS)
// ─────────────────────────────────────────────────────────────────────────────

import { DEFENSE_PROFILES } from "./projectionEngine.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt2  = v => +v.toFixed(2);
const safeDiv = (n, d, fb = 0) => (d && d > 0 ? n / d : fb);

// ── 1. Market Rank → Implied Points ──────────────────────────────────────────
// ExpectedPoints(rank) = a − b × ln(rank), fitted per position to PPR scoring
const RANK_CURVE = {
  QB: { a: 32, b: 4.2 },   // rank1=32, rank12=22.5, rank36=16.0
  RB: { a: 32, b: 5.5 },   // rank1=32, rank12=19.8, rank36=12.3
  WR: { a: 28, b: 5.0 },   // rank1=28, rank12=16.5, rank36=10.0
  TE: { a: 20, b: 4.0 },   // rank1=20, rank12=10.9, rank36=6.5
  K:  { a: 16, b: 2.5 },   // rank1=16, rank12=9.3,  rank36=6.2
};

export function rankToImpliedPoints(rank, pos) {
  if (!rank || rank <= 0) return 0;
  const { a, b } = RANK_CURVE[pos] || RANK_CURVE.WR;
  return fmt2(Math.max(0, a - b * Math.log(rank)));
}

// Convert engine projection score (0–10) to fantasy PPR points per game
const PROJ_SCALE = { QB: 3.8, RB: 3.2, WR: 2.8, TE: 2.2, K: 1.8 };

function projectionToPts(score, pos) {
  return fmt2(score * (PROJ_SCALE[pos] || 2.8));
}

// ── 2. Weekly Volatility (IQR / Median across season-level fpts/game) ─────────
// Uses season-level data as a proxy for weekly scoring dispersion.
export function computeWeeklyVolatility(allStats) {
  if (!allStats) return 0.5;
  const years = Object.keys(allStats).map(Number).sort((a, b) => b - a).slice(0, 4);
  const vals = years
    .map(yr => {
      const s = allStats[yr];
      return (s?.gp >= 4) ? safeDiv(s.fpts || 0, s.gp) : null;
    })
    .filter(v => v !== null)
    .sort((a, b) => a - b);

  if (vals.length < 2) return 0.4;

  const n      = vals.length;
  const q1     = vals[Math.floor(n * 0.25)];
  const q3     = vals[Math.min(Math.floor(n * 0.75), n - 1)];
  const median = vals[Math.floor(n * 0.5)];

  return median > 0 ? clamp((q3 - q1) / median, 0, 1) : 0.5;
}

export function computeStabilityFactor(allStats) {
  return fmt2(1 - computeWeeklyVolatility(allStats));
}

// ── 3. Opportunity Score & Trend ──────────────────────────────────────────────
// Opportunity = Targets×1.0 + Carries×0.8 + RoutesRun×0.5 + RZTouches×1.2
function opportunityScore(stats) {
  if (!stats) return 0;
  const gp = Math.max(stats.gp || 1, 1);
  const tgtPG    = safeDiv(stats.tgt     || 0, gp);
  const carPG    = safeDiv(stats.rushAtt || 0, gp);
  const routesPG = tgtPG * 2.5;           // proxy: targets ≈ 40% of routes run
  const rzPG     = (tgtPG + carPG) * 0.12; // ~12% of touches in red zone
  return tgtPG * 1.0 + carPG * 0.8 + routesPG * 0.5 + rzPG * 1.2;
}

// OpportunityTrend = (recentOpp − avgPriorOpp) / avgPriorOpp, clamped [−0.20, +0.20]
export function computeOpportunityTrend(allStats) {
  if (!allStats) return 0;
  const years = Object.keys(allStats).map(Number).sort((a, b) => b - a);
  if (years.length < 2) return 0;

  const recentOpp = opportunityScore(allStats[years[0]]);

  let priorSum = 0, priorCnt = 0;
  for (let i = 1; i < Math.min(years.length, 3); i++) {
    const s = allStats[years[i]];
    if (s?.gp >= 4) { priorSum += opportunityScore(s); priorCnt++; }
  }
  if (priorCnt === 0) return recentOpp > 0 ? 0.10 : 0;

  const avgPrior = priorSum / priorCnt;
  if (avgPrior <= 0) return 0;
  return clamp((recentOpp - avgPrior) / avgPrior, -0.20, 0.20);
}

// ── 4. Player Variance Profile (PVP) ─────────────────────────────────────────
// PVP = Σ(componentShare × componentVarianceWeight)
// Component weights: Targets=0.25, Efficiency=0.45, BigPlays=0.70, TDs=0.85
export function computePVP(recentStats, pos) {
  if (!recentStats) return 0.40;
  const gp = Math.max(recentStats.gp || 1, 1);

  const fptsGP  = safeDiv(recentStats.fpts || 0, gp);
  if (fptsGP <= 0) return 0.40;

  const tgtPG   = safeDiv(recentStats.tgt     || 0, gp);
  const recYdPG = safeDiv(recentStats.recYd   || 0, gp);
  const rushYdPG= safeDiv(recentStats.rushYd  || 0, gp);
  const tdPG    = safeDiv(
    (recentStats.recTD || 0) + (recentStats.rushTD || 0) + (recentStats.passTD || 0),
    gp
  );

  // Share of expected points from each component
  const tgtShare  = clamp(tgtPG   * 0.5  / fptsGP, 0, 1); // each target ≈ 0.5 pts
  const ydsShare  = clamp((recYdPG + rushYdPG) * 0.1 / fptsGP, 0, 1);
  const bigShare  = clamp((recYdPG + rushYdPG) * 0.03 / fptsGP, 0, 1); // big-play proxy
  const tdShare   = clamp(tdPG * 6 / fptsGP, 0, 1);

  return fmt2(clamp(
    tgtShare * 0.25 + ydsShare * 0.45 + bigShare * 0.70 + tdShare * 0.85,
    0.10, 0.85
  ));
}

// ── 5. Defense Chaos Factor (DCF) ─────────────────────────────────────────────
// DCF = 0.30×PressureRate + 0.25×BlitzRate + 0.25×ExplosivePlaysAllowed + 0.20×ManCoverage
// Pressure rate is directly available; other metrics estimated from correlated data.
export function computeDCF(defenseProfile) {
  if (!defenseProfile) return 0.40;

  const pr = defenseProfile.pressureRate || 0.28;

  const pressureNorm  = clamp(pr / 0.42, 0, 1);         // 0.42 = elite pressure rate
  const blitzNorm     = clamp(pr * 0.80 / 0.36, 0, 1);  // blitz ≈ 0.8× pressure rate
  const epa           = defenseProfile.epaAllowedPerPlay ?? 0;
  const explosiveNorm = clamp((epa + 0.15) / 0.30, 0, 1); // range ~−0.15 to +0.15
  const manNorm       = clamp(pr / 0.40, 0, 1);          // man coverage correlates with pressure

  return fmt2(clamp(
    0.30 * pressureNorm + 0.25 * blitzNorm + 0.25 * explosiveNorm + 0.20 * manNorm,
    0, 1
  ));
}

// ── 6. Context Volatility Score (CVS) ─────────────────────────────────────────
// CVS = clamp(0, 1, 0.55 × PVP + 0.45 × DCF)
export function computeCVS(pvp, dcf) {
  return fmt2(clamp(0.55 * pvp + 0.45 * dcf, 0, 1));
}

// ── 7. Full Exploit Score per Player ──────────────────────────────────────────
export function computeExploitScore({ modelProjection, marketRank, pos, allStats, playerTeam, strategy = "safety" }) {
  const years       = allStats ? Object.keys(allStats).map(Number).sort((a, b) => b - a) : [];
  const recentStats = years.length > 0 ? allStats[years[0]] : null;

  const modelPts  = projectionToPts(modelProjection, pos);
  const marketPts = marketRank ? rankToImpliedPoints(marketRank, pos) : modelPts;
  const valueDelta = fmt2(modelPts - marketPts);

  const stabilityFactor  = computeStabilityFactor(allStats);
  const volatility       = fmt2(1 - stabilityFactor);
  const opportunityTrend = computeOpportunityTrend(allStats);

  const exploitScore = fmt2(
    valueDelta * (0.6 + 0.4 * stabilityFactor) * (1 + opportunityTrend)
  );

  const pvp = computePVP(recentStats, pos);
  const dcf = computeDCF(DEFENSE_PROFILES[playerTeam] || null);
  const cvs = computeCVS(pvp, dcf);

  const exploitAdjusted = fmt2(
    strategy === "upside"
      ? exploitScore * (1 + 0.25 * cvs)
      : exploitScore * (1 - 0.35 * cvs)
  );

  return {
    modelPoints:       modelPts,
    marketImpliedPts:  marketPts,
    valueDelta,
    stabilityFactor,
    volatility,
    opportunityTrend:  fmt2(opportunityTrend),
    pvp,
    dcf,
    cvs,
    exploitScore,
    exploitAdjusted,
  };
}

// ── 8. Run engine on full player list ────────────────────────────────────────
// Returns players augmented with exploit metrics, filtered to those with stat data.
export function runExploitEngine(rankedPlayers, statsCache, strategy = "safety") {
  return rankedPlayers
    .filter(p => p.hasData)
    .map(p => {
      const allStats = statsCache[p.id] ?? null;
      const exploit  = computeExploitScore({
        modelProjection: p.projection,
        marketRank:      p.sleeperRank ?? p.espnRank ?? null,
        pos:             p.pos,
        allStats,
        playerTeam:      p.tm,
        strategy,
      });
      return { ...p, ...exploit };
    });
}
