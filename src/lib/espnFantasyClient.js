// ─────────────────────────────────────────────────────────────────────────────
//  ESPN Fantasy Data Layer  ·  Public draft rankings (no auth required)
//  Uses X-Fantasy-Filter header to fetch ranked offensive players sorted by PPR ADP.
// ─────────────────────────────────────────────────────────────────────────────

// ESPN Fantasy defaultPositionId → fantasy position string
const ESPN_POS = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K" };

// Slot IDs for QB(0), RB(2), WR(4), TE(6), K(17), FLEX(23) — filters offensive skill + kicker positions
const FANTASY_FILTER = JSON.stringify({
  players: {
    filterSlotIds:            { value: [0, 2, 4, 6, 17, 23] },
    limit:                    300,
    offset:                   0,
    sortDraftRanks:           { sortPriority: 2, sortAsc: true, value: "PPR" },
    filterRanksForScoringPeriodIds: { value: [0] },
    filterRanksForRankTypes:  { value: ["PPR"] },
  },
});

const BASE_URL  = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2025/players?view=kona_player_info&scoringPeriodId=0";
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

function normalizeName(name = "") {
  return name
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/i, "")
    .replace(/[.']/g, "")
    .trim();
}

function nameKey(fullName, pos) {
  return `${normalizeName(fullName)}|${pos}`;
}

// ── Fetch ESPN Fantasy PPR draft rankings ────────────────────────────────────
// Returns Map<"normalizedName|pos" → { rank, pos }>
// 12-hour cache; returns empty Map on any error (non-blocking).
export async function fetchEspnFantasyRankings() {
  const cached = cacheRead("espn_fantasy_ranks");
  if (cached) return new Map(cached);

  try {
    const r = await fetch(BASE_URL, {
      headers: {
        Accept:            "application/json",
        "X-Fantasy-Filter": FANTASY_FILTER,
      },
    });
    if (!r.ok) throw new Error(`ESPN Fantasy API ${r.status}`);
    const body = await r.json();

    // Response is an object with numeric string keys — use Object.values()
    const list = Object.values(body);
    if (!list.length) throw new Error("Empty ESPN Fantasy response");

    const entries = [];
    for (const item of list) {
      // Player data is at the top level of each item
      const fullName = item.fullName || item.name || "";
      if (!fullName) continue;

      const pos = ESPN_POS[item.defaultPositionId];
      if (!pos) continue;

      const ranks = item.draftRanksByRankType || {};
      const rank  = ranks?.PPR?.rank || ranks?.STANDARD?.rank || ranks?.HALF?.rank;
      if (!rank) continue;

      entries.push([nameKey(fullName, pos), { rank, pos }]);
    }

    if (!entries.length) throw new Error("No ranked players parsed");
    cacheWrite("espn_fantasy_ranks", entries, HR12);
    return new Map(entries);
  } catch (e) {
    console.warn("ESPN Fantasy rankings unavailable (graceful fallback):", e);
    return new Map();
  }
}
