// ─────────────────────────────────────────────────────────────────────────────
//  ESPN Data Layer  ·  localStorage-backed cache with TTL
// ─────────────────────────────────────────────────────────────────────────────
const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";
const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const CACHE_PFX = "gi_";
const HR = 60 * 60 * 1000;

// ── Cache helpers ─────────────────────────────────────────────────────────────
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

export function clearCache() {
  Object.keys(localStorage)
    .filter(k => k.startsWith(CACHE_PFX))
    .forEach(k => localStorage.removeItem(k));
}

// ── Core fetch with optional cache ───────────────────────────────────────────
export async function fetchJson(url, cacheKey = null, ttl = HR) {
  if (cacheKey) {
    const hit = cacheRead(cacheKey);
    if (hit !== null) return hit;
  }
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    if (cacheKey) cacheWrite(cacheKey, data, ttl);
    return data;
  } catch (e) {
    console.warn("ESPN fetch failed:", url, e);
    return null;
  }
}

// ── Headshot URL ──────────────────────────────────────────────────────────────
// ESPN CDN format – falls back gracefully if the player has no headshot
export const buildHeadshotUrl = (id) =>
  `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;

// ── Active athlete IDs (paged) ────────────────────────────────────────────────
// Returns array of ESPN numeric athlete ID strings
export async function getActiveAthleteIds(limit = 1000) {
  const data = await fetchJson(
    `${CORE}/athletes?limit=${limit}&active=true`,
    "active_ids",
    4 * HR
  );
  if (!data?.items) return [];
  return data.items
    .map(item => {
      const ref = item["$ref"] || item.$ref || "";
      const m = ref.match(/athletes\/(\d+)/);
      return m ? m[1] : null;
    })
    .filter(Boolean);
}

// ── Single athlete details from Core API ─────────────────────────────────────
export async function getAthleteDetails(id) {
  return fetchJson(`${CORE}/athletes/${id}`, `ath_${id}`, 6 * HR);
}

// ── Team roster (secondary / fallback source) ─────────────────────────────────
export async function getTeamRoster(teamId) {
  return fetchJson(`${SITE}/teams/${teamId}/roster`, `roster_${teamId}`, 2 * HR);
}
