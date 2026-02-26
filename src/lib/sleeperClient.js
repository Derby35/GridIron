// ─────────────────────────────────────────────────────────────────────────────
//  Sleeper Data Layer  ·  Public NFL player rankings (no auth required)
//  Endpoint: https://api.sleeper.app/v1/players/nfl
//  Docs: https://docs.sleeper.app/#players
//
//  search_rank = Sleeper's overall player search ranking.
//  Best publicly available proxy for consensus draft rank without auth.
// ─────────────────────────────────────────────────────────────────────────────
const SLEEPER_URL = "https://api.sleeper.app/v1/players/nfl";
const CACHE_PFX   = "gi_";
const DAY         = 24 * 60 * 60 * 1000;
const OFF_POS     = new Set(["QB", "RB", "WR", "TE"]);

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
  } catch {} // quota exceeded – ignore
}

// Normalize for consistent cross-source matching:
// lowercase, strip common name suffixes, strip punctuation
export function normalizeName(name = "") {
  return name
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/i, "")
    .replace(/[.']/g, "")
    .trim();
}

// Primary key includes team (handles same-name players at different positions)
export function nameKey(fullName, pos, team) {
  return `${normalizeName(fullName)}|${pos}|${(team || "").toUpperCase()}`;
}

// Fallback key without team (handles mid-season trades)
export function nameKeyNoTeam(fullName, pos) {
  return `${normalizeName(fullName)}|${pos}`;
}

// ── Fetch Sleeper player rankings ─────────────────────────────────────────────
// Returns Map keyed by both nameKey and nameKeyNoTeam → { rank, pos, team }
// Cached in localStorage for 24 hours (the endpoint is a ~7 MB response).
export async function fetchSleeperRankings() {
  const cached = cacheRead("sleeper_players");
  if (cached) return new Map(cached);

  try {
    const r = await fetch(SLEEPER_URL);
    if (!r.ok) throw new Error(`Sleeper API ${r.status}`);
    const data = await r.json();

    const entries = [];
    for (const p of Object.values(data)) {
      // fantasy_positions is preferred (some players have multiple)
      const pos = p.fantasy_positions?.[0] || p.position;
      if (!OFF_POS.has(pos)) continue;

      const rank = p.search_rank;
      // Sleeper uses 9999999 as sentinel for unranked players
      if (!rank || rank >= 9999999) continue;

      const team     = (p.team || "").toUpperCase();
      const fullName = p.full_name
        || `${p.first_name || ""} ${p.last_name || ""}`.trim();
      if (!fullName) continue;

      const payload = { rank, pos, team };
      // Both keys point to same payload; Map keeps latest on duplicate key
      entries.push([nameKey(fullName, pos, team),  payload]);
      entries.push([nameKeyNoTeam(fullName, pos),  payload]);
    }

    // Sort by rank so Map iteration reflects ranking order
    entries.sort((a, b) => (a[1].rank || 9999) - (b[1].rank || 9999));

    cacheWrite("sleeper_players", entries, DAY);
    return new Map(entries);
  } catch (e) {
    console.warn("Sleeper rankings fetch failed:", e);
    return new Map();
  }
}
