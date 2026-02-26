// ─────────────────────────────────────────────────────────────────────────────
//  ESPN Fantasy Data Layer  ·  Public draft rankings (no auth required)
//  Falls back gracefully to an empty Map if the endpoint is unavailable.
//
//  Uses PPR rank preferentially, then STANDARD, then HALF.
// ─────────────────────────────────────────────────────────────────────────────

// ESPN Fantasy defaultPositionId → fantasy position string
const ESPN_POS = { 1: "QB", 2: "RB", 3: "WR", 4: "TE" };

// Public endpoint — no credentials needed (may 401 in future; handled gracefully)
const ESPN_FANTASY_URL =
  "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2025/players" +
  "?view=kona_player_info&scoringPeriodId=0&limit=2000";

const CACHE_PFX = "gi_";
const HR12      = 12 * 60 * 60 * 1000;

function cacheRead(key) {
  try {
    const raw = localStorage.getItem(CACHE_PFX + key);
    if (!raw) return null;
    const { d, exp } = JSON.parse(raw);
    return Date.now() < exp ? d : null;
  } catch { return null; }
}

function cacheWrite(key, data, ttlMs) {
  try {
    localStorage.setItem(CACHE_PFX + key, JSON.stringify({ d: data, exp: Date.now() + ttlMs }));
  } catch {}
}

// Same normalization as sleeperClient so keys are consistent across sources
function normalizeName(name = "") {
  return name
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/i, "")
    .replace(/[.']/g, "")
    .trim();
}

// ESPN Fantasy doesn't easily expose team abbreviations, so match on name+pos only
function nameKey(fullName, pos) {
  return `${normalizeName(fullName)}|${pos}`;
}

// ── Fetch ESPN Fantasy draft rankings ─────────────────────────────────────────
// Returns Map<"normalizedName|pos" → { rank, pos }>
// 12-hour cache; returns empty Map on any error (non-blocking).
export async function fetchEspnFantasyRankings() {
  const cached = cacheRead("espn_fantasy_ranks");
  if (cached) return new Map(cached);

  try {
    const r = await fetch(ESPN_FANTASY_URL, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) throw new Error(`ESPN Fantasy API ${r.status}`);
    const body = await r.json();

    // Response shape varies: { players: [...] } or bare array
    const list = Array.isArray(body) ? body : (body?.players || []);
    if (!list.length) throw new Error("Empty ESPN Fantasy response");

    const entries = [];
    for (const item of list) {
      const draftRanks = item.draftRanksByRankType || {};
      const rank =
        draftRanks?.PPR?.rank      ||
        draftRanks?.STANDARD?.rank ||
        draftRanks?.HALF?.rank;
      if (!rank) continue;

      // Player info at item.playerPoolEntry.player or item.player
      const player   = item.playerPoolEntry?.player || item.player || {};
      const fullName = player.fullName || player.name || "";
      if (!fullName) continue;

      const pos = ESPN_POS[player.defaultPositionId];
      if (!pos) continue;

      entries.push([nameKey(fullName, pos), { rank, pos }]);
    }

    cacheWrite("espn_fantasy_ranks", entries, HR12);
    return new Map(entries);
  } catch (e) {
    console.warn("ESPN Fantasy rankings unavailable (graceful fallback):", e);
    return new Map();
  }
}
