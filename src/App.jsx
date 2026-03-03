import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, Cell, Legend } from "recharts";
import { rankPlayers, computeVolumeScore, computeEfficiencyScore, computeTrendScore, enrichWithExternalRanks } from "./lib/projectionEngine.js";
import { fetchSleeperRankings } from "./lib/sleeperClient.js";
import { fetchEspnFantasyRankings } from "./lib/espnFantasyClient.js";
import { runExploitEngine, rankToImpliedPoints } from "./lib/marketEngine.js";

// ═══════════════════════════════════════════════════════════════
//  ESPN API ENDPOINTS (from Public-ESPN-API docs)
// ═══════════════════════════════════════════════════════════════
const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const WEB = "https://site.web.api.espn.com/apis/common/v3/sports/football/nfl";
const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";
const IMG = "https://a.espncdn.com/i/teamlogos/nfl/500";
const HEAD = id => `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${id}.png&w=350&h=254`;

async function espn(url) {
  try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); } catch(e) { console.warn("ESPN fetch failed:", url, e); return null; }
}

// ESPN team IDs → abbreviations
const TID = {1:"ATL",2:"BUF",3:"CHI",4:"CIN",5:"CLE",6:"DAL",7:"DEN",8:"DET",9:"GB",10:"TEN",11:"IND",12:"KC",13:"LV",14:"LAR",15:"MIA",16:"MIN",17:"NE",18:"NO",19:"NYG",20:"NYJ",21:"PHI",22:"ARI",23:"PIT",24:"LAC",25:"SF",26:"SEA",27:"TB",28:"WAS",29:"CAR",30:"JAX",33:"BAL",34:"HOU"};
const ESPN_IDS = Object.keys(TID);

// Team metadata
const TM = {
  ARI:{n:"Cardinals",c:"Arizona",c1:"#97233F",conf:"NFC",div:"West"},ATL:{n:"Falcons",c:"Atlanta",c1:"#A71930",conf:"NFC",div:"South"},BAL:{n:"Ravens",c:"Baltimore",c1:"#241773",conf:"AFC",div:"North"},BUF:{n:"Bills",c:"Buffalo",c1:"#00338D",conf:"AFC",div:"East"},CAR:{n:"Panthers",c:"Carolina",c1:"#0085CA",conf:"NFC",div:"South"},CHI:{n:"Bears",c:"Chicago",c1:"#0B162A",conf:"NFC",div:"North"},CIN:{n:"Bengals",c:"Cincinnati",c1:"#FB4F14",conf:"AFC",div:"North"},CLE:{n:"Browns",c:"Cleveland",c1:"#311D00",conf:"AFC",div:"North"},DAL:{n:"Cowboys",c:"Dallas",c1:"#003594",conf:"NFC",div:"East"},DEN:{n:"Broncos",c:"Denver",c1:"#FB4F14",conf:"AFC",div:"West"},DET:{n:"Lions",c:"Detroit",c1:"#0076B6",conf:"NFC",div:"North"},GB:{n:"Packers",c:"Green Bay",c1:"#203731",conf:"NFC",div:"North"},HOU:{n:"Texans",c:"Houston",c1:"#03202F",conf:"AFC",div:"South"},IND:{n:"Colts",c:"Indianapolis",c1:"#002C5F",conf:"AFC",div:"South"},JAX:{n:"Jaguars",c:"Jacksonville",c1:"#006778",conf:"AFC",div:"South"},KC:{n:"Chiefs",c:"Kansas City",c1:"#E31837",conf:"AFC",div:"West"},LV:{n:"Raiders",c:"Las Vegas",c1:"#000000",conf:"AFC",div:"West"},LAC:{n:"Chargers",c:"Los Angeles",c1:"#0080C6",conf:"AFC",div:"West"},LAR:{n:"Rams",c:"Los Angeles",c1:"#003594",conf:"NFC",div:"West"},MIA:{n:"Dolphins",c:"Miami",c1:"#008E97",conf:"AFC",div:"East"},MIN:{n:"Vikings",c:"Minnesota",c1:"#4F2683",conf:"NFC",div:"North"},NE:{n:"Patriots",c:"New England",c1:"#002244",conf:"AFC",div:"East"},NO:{n:"Saints",c:"New Orleans",c1:"#D3BC8D",conf:"NFC",div:"South"},NYG:{n:"Giants",c:"New York",c1:"#0B2265",conf:"NFC",div:"East"},NYJ:{n:"Jets",c:"New York",c1:"#125740",conf:"AFC",div:"East"},PHI:{n:"Eagles",c:"Philadelphia",c1:"#004C54",conf:"NFC",div:"East"},PIT:{n:"Steelers",c:"Pittsburgh",c1:"#FFB612",conf:"AFC",div:"North"},SF:{n:"49ers",c:"San Francisco",c1:"#AA0000",conf:"NFC",div:"West"},SEA:{n:"Seahawks",c:"Seattle",c1:"#002244",conf:"NFC",div:"West"},TB:{n:"Buccaneers",c:"Tampa Bay",c1:"#D50A0A",conf:"NFC",div:"South"},TEN:{n:"Titans",c:"Tennessee",c1:"#0C2340",conf:"AFC",div:"South"},WAS:{n:"Commanders",c:"Washington",c1:"#5A1414",conf:"NFC",div:"East"},
};
const ALL_AB = Object.keys(TM);
const OFF_POS = new Set(["QB","RB","WR","TE","K","PK"]);
const SEASONS = [2017,2018,2019,2020,2021,2022,2023,2024,2025];

// ═══════════════════════════════════════════════════════════════
//  FETCH ALL TEAM ROSTERS → Extract offensive players
// ═══════════════════════════════════════════════════════════════
async function fetchAllRosters() {
  const results = await Promise.allSettled(
    ESPN_IDS.map(tid =>
      espn(`${SITE}/teams/${tid}/roster`).then(d => {
        const ab = TID[tid];
        const players = [];
        if (d?.athletes) {
          for (const group of d.athletes) {
            if (!group.items) continue;
            for (const p of group.items) {
              const rawPos = p.position?.abbreviation;
              if (!OFF_POS.has(rawPos)) continue;
              const pos = rawPos === "PK" ? "K" : rawPos; // normalize ESPN's "PK" → "K"
              players.push({
                id: p.id,
                nm: p.displayName || p.fullName || `${p.firstName} ${p.lastName}`,
                pos,
                tm: ab,
                n: p.jersey || "",
                hs: p.headshot?.href || HEAD(p.id),
                age: p.age,
                exp: p.experience?.years,
              });
            }
          }
        }
        return players;
      })
    )
  );
  const all = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) all.push(...r.value);
  }
  // Sort by position then name
  all.sort((a, b) => {
    const po = ["QB","RB","WR","TE","K"];
    const d = po.indexOf(a.pos) - po.indexOf(b.pos);
    if (d !== 0) return d;
    return a.nm.localeCompare(b.nm);
  });
  return all;
}

// ═══════════════════════════════════════════════════════════════
//  FETCH PLAYER STATS — season-by-season from ESPN
// ═══════════════════════════════════════════════════════════════
const STATS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const statsLocalGet = id => {
  try {
    const raw = localStorage.getItem(`gi_pstats_${id}`);
    if (!raw) return null;
    const { d, exp } = JSON.parse(raw);
    return Date.now() < exp ? d : null;
  } catch { return null; }
};
const statsLocalSet = (id, data) => {
  try { localStorage.setItem(`gi_pstats_${id}`, JSON.stringify({ d: data, exp: Date.now() + STATS_TTL })); } catch {}
};
// Module-level promise dedup: prevents concurrent duplicate fetches for same athleteId
const FETCH_CACHE = new Map();

async function fetchPlayerStats(athleteId) {
  // 1. localStorage hit → instant return
  const cached = statsLocalGet(athleteId);
  if (cached) return cached;

  // 2. In-flight dedup: reuse existing promise for same athlete
  if (FETCH_CACHE.has(athleteId)) return FETCH_CACHE.get(athleteId);

  const promise = (async () => {
    // 3. Parallel fetch of web/stats + overview (saves 2-3 s vs sequential on fallback path)
    const [webData, overviewData] = await Promise.all([
      espn(`${WEB}/athletes/${athleteId}/stats`),
      espn(`${WEB}/athletes/${athleteId}/overview`),
    ]);
    let parsed = parseWebStats(webData);
    if (!parsed || !Object.keys(parsed).length) parsed = parseOverviewStats(overviewData);
    // 4. Last resort: per-season core API
    if (!parsed || !Object.keys(parsed).length) parsed = await fetchPerSeasonStats(athleteId);
    const result = parsed || {};
    statsLocalSet(athleteId, result);
    return result;
  })().finally(() => FETCH_CACHE.delete(athleteId));

  FETCH_CACHE.set(athleteId, promise);
  return promise;
}

function parseWebStats(data) {
  if (!data) return null;
  const seasons = {};

  if (data.categories) {
    for (const cat of data.categories) {
      const names = cat.names || [];
      const catName = (cat.displayName || cat.name || "").toLowerCase();
      if (!cat.seasonTypes) continue;
      for (const st of cat.seasonTypes) {
        if (!st.categories) continue;
        for (const sc of st.categories) {
          const yr = sc.season?.year || sc.displayName;
          if (!yr || yr < 2017) continue;
          if (!seasons[yr]) seasons[yr] = {};
          const stats = sc.stats || [];
          for (let i = 0; i < names.length && i < stats.length; i++) {
            seasons[yr][names[i]] = parseFloat(stats[i]) || 0;
          }
        }
      }
    }
  }

  return normalizeStats(seasons);
}

function parseOverviewStats(data) {
  if (!data) return null;
  const seasons = {};

  const statsSections = [
    data?.stats, data?.statistics, data?.seasonStats,
    data?.player?.stats, data?.athlete?.stats
  ].filter(Boolean);

  for (const section of statsSections) {
    if (Array.isArray(section)) {
      for (const item of section) {
        if (item.season && item.stats) {
          const yr = item.season.year || item.season;
          if (yr < 2017) continue;
          if (!seasons[yr]) seasons[yr] = {};
          if (Array.isArray(item.stats)) {
            const names = item.names || item.labels || [];
            for (let i = 0; i < names.length; i++) {
              seasons[yr][names[i]] = parseFloat(item.stats[i]) || 0;
            }
          } else if (typeof item.stats === 'object') {
            Object.assign(seasons[yr], item.stats);
          }
        }
      }
    }
  }

  return normalizeStats(seasons);
}

async function fetchPerSeasonStats(athleteId) {
  const seasons = {};
  const calls = SEASONS.map(yr =>
    espn(`${CORE}/seasons/${yr}/types/2/athletes/${athleteId}/statistics`)
      .then(d => ({ yr, d }))
      .catch(() => ({ yr, d: null }))
  );
  const results = await Promise.allSettled(calls);
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value?.d) continue;
    const { yr, d } = r.value;
    const raw = {};
    const cats = d?.splits?.categories || d?.categories || [];
    for (const cat of cats) {
      const statList = cat.stats || [];
      for (const s of statList) {
        if (s.name && s.value !== undefined && s.value !== null) {
          const val = parseFloat(s.value) || 0;
          if (val !== 0 || raw[s.name] === undefined) {
            raw[s.name] = val;
          }
        }
      }
    }
    if (Object.keys(raw).length > 0) seasons[yr] = raw;
  }
  return normalizeStats(seasons);
}

function normalizeStats(seasons) {
  const norm = {};
  for (const [yr, raw] of Object.entries(seasons)) {
    const s = {};
    s.gp = raw.gamesPlayed || 0;
    s.passYd = raw.passingYards || raw.netPassingYards || 0;
    s.passTD = raw.passingTouchdowns || 0;
    s.passInt = raw.interceptions || 0;
    s.passCmp = raw.completions || 0;
    s.passAtt = raw.passingAttempts || raw.netPassingAttempts || 0;
    s.passRat = raw.QBRating || raw.quarterbackRating || raw.ESPNQBRating || 0;
    s.rushYd = raw.rushingYards || 0;
    s.rushTD = raw.rushingTouchdowns || 0;
    s.rushAtt = raw.rushingAttempts || 0;
    s.rec = raw.receptions || 0;
    s.recYd = raw.receivingYards || 0;
    s.recTD = raw.receivingTouchdowns || 0;
    s.tgt = raw.receivingTargets || 0;
    s.fum   = raw.fumblesLost || raw.passingFumblesLost || raw.rushingFumblesLost || raw.receivingFumblesLost || raw.fumbles || 0;
    // Kicker stats
    s.fgm   = raw.fieldGoalsMade || 0;
    s.fga   = raw.fieldGoalsAttempted || 0;
    s.fgPct = s.fga > 0 ? +(s.fgm / s.fga).toFixed(3) : (raw.fieldGoalPct || raw.fieldGoalPercentage || 0);
    s.patm  = raw.extraPointsMade || raw.extraPointKicksMade || 0;
    s.patAtt= raw.extraPointsAttempted || raw.extraPointKicksAttempted || 0;
    s.longFG= raw.longFieldGoalMade || raw.longFG || 0;
    const offFpts = Math.round(
      (s.passYd * 0.04) + (s.passTD * 4) + (s.passInt * -2) +
      (s.rushYd * 0.1) + (s.rushTD * 6) +
      (s.rec * 1) + (s.recYd * 0.1) + (s.recTD * 6) +
      (s.fum * -2)
    );
    s.fpts = s.fgm > 0 ? Math.round(s.fgm * 3.3 + s.patm * 1) : offFpts;
    if (s.gp > 0 || s.passYd > 0 || s.rushYd > 0 || s.recYd > 0 || s.fpts > 0 || s.fgm > 0) {
      norm[yr] = s;
    }
  }
  return norm;
}

// ═══════════════════════════════════════════════════════════════
//  FETCH PLAYER GAME LOG — for matchup chart
// ═══════════════════════════════════════════════════════════════
async function fetchPlayerGameLog(athleteId, season = 2024) {
  const data = await espn(`${SITE}/athletes/${athleteId}/gamelog?season=${season}`);
  if (!data) return [];

  const games = [];
  const events = data.events || {};
  const labels = data.labels || [];
  const names  = data.names  || labels;

  // Map category-level stat names
  const cats = data.seasonTypes || [];
  for (const st of cats) {
    if (st.type !== 2 && st.seasonType !== 2) continue; // regular season only
    const catNames = st.names || names;
    for (const ev of (st.events || [])) {
      const statsArr = ev.stats || [];
      const raw = {};
      for (let i = 0; i < catNames.length && i < statsArr.length; i++) {
        raw[catNames[i]] = parseFloat(statsArr[i]) || 0;
      }
      const opp = ev.opponent?.abbreviation || ev.opponent?.displayName || "?";
      const rec = raw.receptions || 0;
      const recYd = raw.receivingYards || 0;
      const recTD = raw.receivingTouchdowns || 0;
      const rushYd = raw.rushingYards || 0;
      const rushTD = raw.rushingTouchdowns || 0;
      const passYd = raw.passingYards || 0;
      const passTD = raw.passingTouchdowns || 0;
      const passInt = raw.interceptions || 0;
      const fpts = Math.round(
        (passYd*0.04)+(passTD*4)+(passInt*-2)+
        (rushYd*0.1)+(rushTD*6)+
        (rec*1)+(recYd*0.1)+(recTD*6)
      );
      if (opp !== "?" && (fpts > 0 || recYd > 0 || rushYd > 0 || passYd > 0)) {
        games.push({ opp, fpts, rec, recYd, recTD, rushYd, rushTD, passYd, passTD, passInt });
      }
    }
  }
  return games;
}

// ═══════════════════════════════════════════════════════════════
//  FETCH TEAM DEPTH CHART — current season official depth order
// ═══════════════════════════════════════════════════════════════
async function fetchTeamDepthChart(espnTeamId) {
  // ESPN public depth chart endpoint
  const data = await espn(`${SITE}/teams/${espnTeamId}/depthcharts`);
  if (!data?.items) return {};
  // Build map: position abbreviation → ordered array of athlete IDs
  const chart = {};
  for (const item of data.items) {
    const rawPos = item.position?.abbreviation;
    if (!rawPos || !OFF_POS.has(rawPos)) continue;
    const pos = rawPos === "PK" ? "K" : rawPos;
    const ordered = (item.athletes || [])
      .sort((a, b) => (a.slot || a.rank || 99) - (b.slot || b.rank || 99))
      .map(a => {
        // ESPN athlete field is often a $ref link — extract numeric ID from the URL
        // e.g. "https://sports.core.api.espn.com/v2/.../athletes/3054211?..."
        const ref = a.athlete?.['$ref'] || '';
        if (ref) {
          const m = ref.match(/athletes\/(\d+)/);
          if (m) return m[1];
        }
        // Fallback: embedded id field
        return String(a.athlete?.id || a.id || '');
      })
      .filter(Boolean);
    if (ordered.length > 0) chart[pos] = ordered;
  }
  return chart;
}

// Map ESPN team abbreviation → ESPN numeric ID
const AB_TO_TID = Object.fromEntries(Object.entries(TID).map(([k,v])=>[v,k]));

// ═══════════════════════════════════════════════════════════════
//  PLAYOFF BRACKETS 2017-2024
// ═══════════════════════════════════════════════════════════════
const BK = {
  2017:{sb:{a:"NE",h:"PHI",as:33,hs:41,mvp:"Nick Foles"},afc:[{rd:"WC",m:[{a:"TEN",h:"KC",as:22,hs:21},{a:"BUF",h:"JAX",as:3,hs:10}]},{rd:"DIV",m:[{a:"TEN",h:"NE",as:14,hs:35},{a:"JAX",h:"PIT",as:45,hs:42}]},{rd:"CC",m:[{a:"JAX",h:"NE",as:20,hs:24}]}],nfc:[{rd:"WC",m:[{a:"CAR",h:"NO",as:26,hs:31},{a:"ATL",h:"LAR",as:26,hs:13}]},{rd:"DIV",m:[{a:"NO",h:"MIN",as:24,hs:29},{a:"ATL",h:"PHI",as:10,hs:15}]},{rd:"CC",m:[{a:"MIN",h:"PHI",as:7,hs:38}]}]},
  2018:{sb:{a:"NE",h:"LAR",as:13,hs:3,mvp:"Julian Edelman"},afc:[{rd:"WC",m:[{a:"IND",h:"HOU",as:21,hs:7},{a:"LAC",h:"BAL",as:23,hs:17}]},{rd:"DIV",m:[{a:"IND",h:"KC",as:13,hs:31},{a:"LAC",h:"NE",as:28,hs:41}]},{rd:"CC",m:[{a:"NE",h:"KC",as:37,hs:31}]}],nfc:[{rd:"WC",m:[{a:"SEA",h:"DAL",as:22,hs:24},{a:"PHI",h:"CHI",as:16,hs:15}]},{rd:"DIV",m:[{a:"DAL",h:"LAR",as:22,hs:30},{a:"PHI",h:"NO",as:20,hs:14}]},{rd:"CC",m:[{a:"LAR",h:"NO",as:26,hs:23}]}]},
  2019:{sb:{a:"SF",h:"KC",as:20,hs:31,mvp:"Patrick Mahomes"},afc:[{rd:"WC",m:[{a:"BUF",h:"HOU",as:19,hs:22},{a:"TEN",h:"NE",as:20,hs:13}]},{rd:"DIV",m:[{a:"HOU",h:"KC",as:31,hs:51},{a:"TEN",h:"BAL",as:28,hs:12}]},{rd:"CC",m:[{a:"TEN",h:"KC",as:24,hs:35}]}],nfc:[{rd:"WC",m:[{a:"MIN",h:"NO",as:26,hs:20},{a:"SEA",h:"PHI",as:17,hs:9}]},{rd:"DIV",m:[{a:"MIN",h:"SF",as:10,hs:27},{a:"SEA",h:"GB",as:23,hs:28}]},{rd:"CC",m:[{a:"GB",h:"SF",as:20,hs:37}]}]},
  2020:{sb:{a:"KC",h:"TB",as:9,hs:31,mvp:"Tom Brady"},afc:[{rd:"WC",m:[{a:"IND",h:"BUF",as:24,hs:27},{a:"BAL",h:"TEN",as:20,hs:13},{a:"CLE",h:"PIT",as:48,hs:37}]},{rd:"DIV",m:[{a:"BAL",h:"BUF",as:3,hs:17},{a:"CLE",h:"KC",as:17,hs:22}]},{rd:"CC",m:[{a:"BUF",h:"KC",as:24,hs:38}]}],nfc:[{rd:"WC",m:[{a:"CHI",h:"NO",as:21,hs:9},{a:"TB",h:"WAS",as:31,hs:23},{a:"LAR",h:"SEA",as:30,hs:20}]},{rd:"DIV",m:[{a:"LAR",h:"GB",as:18,hs:32},{a:"TB",h:"NO",as:30,hs:20}]},{rd:"CC",m:[{a:"TB",h:"GB",as:31,hs:26}]}]},
  2021:{sb:{a:"CIN",h:"LAR",as:20,hs:23,mvp:"Cooper Kupp"},afc:[{rd:"WC",m:[{a:"LV",h:"CIN",as:19,hs:26},{a:"NE",h:"BUF",as:17,hs:47},{a:"PIT",h:"KC",as:21,hs:42}]},{rd:"DIV",m:[{a:"CIN",h:"TEN",as:19,hs:16},{a:"BUF",h:"KC",as:36,hs:42}]},{rd:"CC",m:[{a:"CIN",h:"KC",as:27,hs:24}]}],nfc:[{rd:"WC",m:[{a:"PHI",h:"TB",as:15,hs:31},{a:"SF",h:"DAL",as:23,hs:17},{a:"ARI",h:"LAR",as:11,hs:34}]},{rd:"DIV",m:[{a:"SF",h:"GB",as:13,hs:10},{a:"TB",h:"LAR",as:27,hs:30}]},{rd:"CC",m:[{a:"SF",h:"LAR",as:17,hs:20}]}]},
  2022:{sb:{a:"KC",h:"PHI",as:38,hs:35,mvp:"Patrick Mahomes"},afc:[{rd:"WC",m:[{a:"MIA",h:"BUF",as:31,hs:34},{a:"BAL",h:"CIN",as:17,hs:24},{a:"LAC",h:"JAX",as:30,hs:31}]},{rd:"DIV",m:[{a:"JAX",h:"KC",as:20,hs:27},{a:"CIN",h:"BUF",as:27,hs:10}]},{rd:"CC",m:[{a:"CIN",h:"KC",as:24,hs:23}]}],nfc:[{rd:"WC",m:[{a:"SEA",h:"SF",as:23,hs:41},{a:"NYG",h:"MIN",as:31,hs:24},{a:"TB",h:"DAL",as:14,hs:31}]},{rd:"DIV",m:[{a:"DAL",h:"SF",as:12,hs:19},{a:"NYG",h:"PHI",as:7,hs:38}]},{rd:"CC",m:[{a:"SF",h:"PHI",as:7,hs:31}]}]},
  2023:{sb:{a:"SF",h:"KC",as:22,hs:25,mvp:"Patrick Mahomes"},afc:[{rd:"WC",m:[{a:"BUF",h:"PIT",as:31,hs:17},{a:"HOU",h:"CLE",as:45,hs:14},{a:"MIA",h:"KC",as:7,hs:26}]},{rd:"DIV",m:[{a:"HOU",h:"BAL",as:13,hs:34},{a:"BUF",h:"KC",as:24,hs:27}]},{rd:"CC",m:[{a:"BAL",h:"KC",as:10,hs:17}]}],nfc:[{rd:"WC",m:[{a:"GB",h:"DAL",as:48,hs:32},{a:"LAR",h:"DET",as:24,hs:31},{a:"PHI",h:"TB",as:32,hs:9}]},{rd:"DIV",m:[{a:"GB",h:"SF",as:24,hs:21},{a:"TB",h:"DET",as:31,hs:24}]},{rd:"CC",m:[{a:"DET",h:"SF",as:31,hs:34}]}]},
  2024:{sb:{a:"KC",h:"PHI",as:22,hs:40,mvp:"Saquon Barkley"},afc:[{rd:"WC",m:[{a:"LAC",h:"HOU",as:12,hs:32},{a:"PIT",h:"BAL",as:14,hs:28},{a:"DEN",h:"BUF",as:7,hs:31}]},{rd:"DIV",m:[{a:"HOU",h:"KC",as:14,hs:23},{a:"BAL",h:"BUF",as:25,hs:27}]},{rd:"CC",m:[{a:"BUF",h:"KC",as:29,hs:32}]}],nfc:[{rd:"WC",m:[{a:"GB",h:"PHI",as:10,hs:22},{a:"WAS",h:"TB",as:23,hs:20},{a:"MIN",h:"LAR",as:27,hs:9}]},{rd:"DIV",m:[{a:"MIN",h:"PHI",as:13,hs:28},{a:"WAS",h:"DET",as:45,hs:31}]},{rd:"CC",m:[{a:"WAS",h:"PHI",as:23,hs:55}]}]},
};

// Calculate a player-specific season projected PPR using their own weighted recent history
// (55% most-recent season, 30% year prior, 15% two years prior) — far more accurate than
// position averages since it reflects each player's own output trend
function calcPlayerSeasonProjection(allStats, forYear) {
  if (!allStats) return 0;
  // Seasons strictly before forYear, sorted newest first
  const prior = Object.keys(allStats)
    .map(Number)
    .filter(y => y < forYear)
    .sort((a, b) => b - a)
    .slice(0, 3);
  if (!prior.length) return 0;
  const weights = [0.55, 0.30, 0.15];
  let proj = 0, wt = 0;
  for (let i = 0; i < prior.length; i++) {
    const s = allStats[prior[i]];
    if (s && s.fpts > 0) {
      proj += s.fpts * weights[i];
      wt += weights[i];
    }
  }
  return wt > 0 ? Math.round(proj / wt) : 0;
}

// Weighted recent PPR score for a single player — used for stat-based depth ranking
function playerStatScore(player, statsCache) {
  const st = statsCache?.[player.id];
  if (!st) return -1;
  const years = Object.keys(st).map(Number).sort((a, b) => b - a).slice(0, 3);
  if (!years.length) return -1;
  const weights = [3, 2, 1];
  let total = 0, wt = 0;
  for (let i = 0; i < years.length; i++) {
    const fpts = st[years[i]]?.fpts || 0;
    if (fpts > 0) { total += fpts * weights[i]; wt += weights[i]; }
  }
  return wt > 0 ? total / wt : 0;
}

// ═══════════════════════════════════════════════════════════════
//  CSS
// ═══════════════════════════════════════════════════════════════
const CSS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700;800&family=Exo+2:wght@400;600;700&display=swap');
:root{
  --bg:#060C09;--s1:#0D0E18;--s2:#121320;--s3:#171827;
  --bd:rgba(0,196,255,.08);
  --tx:#EEF0F8;--dm:rgba(238,240,248,.42);
  --em:#00C4FF;--gd:#FFBA00;--lm:#00E09B;--sk:#818CF8;--rs:#FF3D5A;--vi:#C084FC;--kc:#FFBA00
}
*{box-sizing:border-box;margin:0;padding:0}
html{font-size:16px}
body{
  background-color:#060C09;
  color:var(--tx);
  font-family:'Outfit',sans-serif;
  font-size:15px;
  line-height:1.5;
  background-image:
    radial-gradient(ellipse 22% 40% at 10% -3%,rgba(255,248,200,.08) 0%,transparent 55%),
    radial-gradient(ellipse 22% 40% at 90% -3%,rgba(255,248,200,.07) 0%,transparent 55%),
    radial-gradient(ellipse 60% 38% at 0% 2%,rgba(0,196,255,.04) 0%,transparent 58%),
    radial-gradient(ellipse 80% 30% at 50% 110%,rgba(0,55,18,.25) 0%,transparent 50%),
    repeating-linear-gradient(0deg,transparent 0px,transparent 58px,rgba(255,255,255,.011) 58px,rgba(255,255,255,.013) 60px),
    url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.028'/%3E%3C/svg%3E");
  background-attachment:fixed;
}
::-webkit-scrollbar{width:7px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(0,196,255,.18);border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:rgba(0,196,255,.32)}
@keyframes fu{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}.fu{animation:fu .4s ease-out both}
@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin .8s linear infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}.pulse{animation:pulse 2.2s ease-in-out infinite}
@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes glow-pulse{0%,100%{box-shadow:0 0 8px rgba(0,196,255,.35)}50%{box-shadow:0 0 18px rgba(0,196,255,.7)}}
.logo{border-radius:50%;object-fit:contain;background:rgba(255,255,255,.03)}
.hs{border-radius:50%;object-fit:cover;border:2px solid transparent;background:linear-gradient(135deg,var(--s1),var(--s2))}
.recharts-cartesian-axis-tick-value{fill:rgba(238,240,248,.4)!important;font-size:12px!important;font-family:'Exo 2',sans-serif!important}
.recharts-legend-item-text{color:var(--tx)!important;font-size:13px!important;font-family:'Outfit',sans-serif!important}`;

// ═══════════════════════════════════════════════════════════════
//  SMALL COMPONENTS
// ═══════════════════════════════════════════════════════════════
const Logo = ({ab,sz=40,onClick}) => <img src={`${IMG}/${ab?.toLowerCase()}.png`} alt={ab} width={sz} height={sz} className="logo" style={{cursor:onClick?'pointer':'default',flexShrink:0}} onClick={onClick} onError={e=>{e.target.style.opacity='.3'}}/>;
const Hs = ({src,sz=52}) => <img src={src} alt="" width={sz} height={sz} className="hs" onError={e=>{e.target.style.background='linear-gradient(135deg,#1a1a2e,#16213e)';e.target.src=''}}/>;
const Pil = ({ch,c="var(--em)",s={}}) => <span style={{display:'inline-flex',alignItems:'center',padding:'3px 10px',borderRadius:5,background:`${c}18`,border:`1px solid ${c}40`,color:c,fontSize:11,fontWeight:700,letterSpacing:.8,fontFamily:"'Exo 2',sans-serif",...s}}>{ch}</span>;
const StCard = ({l,v,c="var(--em)"}) => (
  <div style={{background:'rgba(8,12,10,.80)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',border:'1px solid rgba(0,196,255,.1)',borderRadius:14,padding:'12px 16px',flex:1,minWidth:90,borderTop:`3px solid ${c}`,boxShadow:`0 0 24px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.04)`}}>
    <div style={{color:'rgba(238,240,248,.35)',fontSize:10,textTransform:'uppercase',letterSpacing:1,fontFamily:"'Exo 2',sans-serif",fontWeight:700,marginBottom:4}}>{l}</div>
    <div style={{fontSize:26,fontWeight:900,fontFamily:"'Bebas Neue'",color:c,letterSpacing:1.5,lineHeight:1,textShadow:`0 0 20px ${c}55`}}>{v ?? "—"}</div>
  </div>
);
const TT = ({active,payload,label}) => {if(!active||!payload?.length)return null;return<div style={{background:'rgba(7,8,13,.97)',border:'1px solid rgba(0,196,255,.18)',borderRadius:10,padding:'9px 13px',fontSize:13,boxShadow:'0 8px 30px rgba(0,0,0,.6),0 0 0 1px rgba(0,196,255,.06)'}}><div style={{fontWeight:700,color:'var(--em)',marginBottom:4,fontFamily:"'Exo 2',sans-serif",letterSpacing:.5}}>{label}</div>{payload.map((p,i)=><div key={i} style={{display:'flex',gap:6,alignItems:'center',marginBottom:2}}><div style={{width:6,height:6,borderRadius:'50%',background:p.color||p.stroke,flexShrink:0}}/><span style={{color:'var(--dm)',fontFamily:"'Exo 2',sans-serif",fontSize:12}}>{p.name}:</span><span style={{fontWeight:700,fontFamily:"'Exo 2',sans-serif"}}>{typeof p.value==='number'?p.value.toLocaleString():p.value}</span></div>)}</div>};
const Spinner = ({msg="Loading..."}) => <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:70,gap:14}}><div className="spin" style={{width:36,height:36,border:'3px solid rgba(0,196,255,.1)',borderTopColor:'var(--em)',borderRadius:'50%'}}/><span style={{color:'var(--dm)',fontSize:14,fontFamily:"'Outfit',sans-serif"}}>{msg}</span></div>;
const th = {padding:'7px 8px',textAlign:'left',color:'var(--dm)',fontWeight:600,fontSize:11,textTransform:'uppercase',letterSpacing:.5,fontFamily:"'Exo 2',sans-serif"};
const td = {padding:'7px 8px',textAlign:'left',fontSize:13};
const posColor = p => p==="QB"?"var(--em)":p==="RB"?"var(--lm)":p==="WR"?"var(--sk)":p==="K"?"var(--kc)":"var(--vi)";

// Depth label per position index (0-based)
const DEPTH_LABEL = {
  QB: ["QB1","QB2","QB3"],
  RB: ["RB1","RB2","RB3","RB4"],
  WR: ["WR1","WR2","WR3","WR4","WR5"],
  TE: ["TE1","TE2","TE3"],
};

// ═══════════════════════════════════════════════════════════════
//  SIDEBAR
// ═══════════════════════════════════════════════════════════════
const TABS = ["Home","Players","Teams","Games","Brackets","Predictions","Rankings","Edge Board"];
const MAIN_TABS = ["Home","Players","Teams","Games"];
const ANALYSIS_TABS = ["Brackets","Predictions","Rankings","Edge Board"];

const Sidebar = ({tab, go, goBack, canGoBack}) => {
  const navItem = t => {
    const active = tab === t;
    return (
      <button key={t} onClick={()=>go(t)}
        style={{display:'block',width:'100%',padding:'9px 13px',borderRadius:8,border:'none',
          background:active?'rgba(0,196,255,.1)':'transparent',
          color:active?'var(--em)':'rgba(238,240,248,.55)',
          fontWeight:active?700:400,fontSize:13,cursor:'pointer',textAlign:'left',marginBottom:2,
          borderLeft:active?'3px solid var(--em)':'3px solid transparent',
          boxShadow:active?'inset 0 0 20px rgba(0,196,255,.07)':'none',
          fontFamily:"'Outfit',sans-serif",letterSpacing:.2,transition:'background .15s,color .15s,box-shadow .15s'}}
        onMouseEnter={e=>{if(!active){e.currentTarget.style.background='rgba(0,196,255,.05)';e.currentTarget.style.color='var(--tx)'}}}
        onMouseLeave={e=>{if(!active){e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(238,240,248,.55)'}}}>
        {t}
      </button>
    );
  };
  const label = txt => (
    <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:'rgba(0,196,255,.3)',
      padding:'0 8px 5px',fontFamily:"'Exo 2',sans-serif",textTransform:'uppercase'}}>
      {txt}
    </div>
  );
  return (
    <div style={{position:'fixed',left:0,top:0,bottom:0,width:220,zIndex:50,
      background:'linear-gradient(180deg,rgba(7,8,13,.99),rgba(13,14,24,.99))',
      borderRight:'1px solid rgba(0,196,255,.1)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Brand */}
      <div style={{padding:'18px 15px 14px',borderBottom:'1px solid rgba(0,196,255,.08)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:canGoBack?10:0}}
          onClick={()=>go("Home")}>
          <div style={{width:38,height:38,borderRadius:11,background:'linear-gradient(135deg,var(--em),var(--sk))',
            display:'flex',alignItems:'center',justifyContent:'center',
            fontFamily:"'Bebas Neue'",fontSize:19,color:'#fff',flexShrink:0,letterSpacing:1,
            boxShadow:'0 0 16px rgba(0,196,255,.3)'}}>GI</div>
          <div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2.5,lineHeight:1.05}}>GRIDIRON</div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2.5,color:'var(--em)',lineHeight:1.05}}>INTEL</div>
          </div>
        </div>
        {canGoBack && (
          <button onClick={goBack}
            style={{width:'100%',padding:'6px 10px',borderRadius:7,border:'1px solid rgba(0,196,255,.12)',
              background:'rgba(0,196,255,.05)',color:'rgba(238,240,248,.5)',
              fontSize:12,cursor:'pointer',textAlign:'left',fontFamily:"'Outfit',sans-serif"}}>
            ← Back
          </button>
        )}
      </div>
      {/* Nav items */}
      <div style={{flex:1,overflowY:'auto',padding:'12px 8px'}}>
        {label("Main")}
        {MAIN_TABS.map(t=>navItem(t))}
        <div style={{height:8}}/>
        {label("Analysis")}
        {ANALYSIS_TABS.map(t=>navItem(t))}
      </div>
      {/* Live indicator footer */}
      <div style={{padding:'11px 15px',borderTop:'1px solid rgba(0,196,255,.08)'}}>
        <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3}}>
          <div className="pulse" style={{width:6,height:6,borderRadius:'50%',background:'var(--lm)',flexShrink:0}}/>
          <span style={{color:'rgba(0,196,255,.4)',fontSize:10,letterSpacing:1,
            fontFamily:"'Exo 2',sans-serif",textTransform:'uppercase'}}>Live ESPN Data</span>
        </div>
        <div style={{color:'rgba(238,240,248,.18)',fontSize:10,fontFamily:"'Exo 2',sans-serif"}}>2017–2025 · All 32 Teams</div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
//  HOME — Full-screen dashboard
// ═══════════════════════════════════════════════════════════════
const Home = ({go,goT,goP,players,loading,statsCache}) => {
  const[conf,setConf]=useState("AFC");
  const[posTab,setPosTab]=useState("QB");

  // SB contenders: score from 2017-2024 bracket data (recency + win bonus)
  const sbContenders=useMemo(()=>{
    const scores={};
    const yw={2017:1,2018:2,2019:3,2020:4,2021:5,2022:6,2023:7,2024:8};
    for(const[yr,data] of Object.entries(BK)){
      const w=yw[+yr]||1;
      if(!data.sb) continue;
      const{a,h,as:as2,hs:hs2}=data.sb;
      scores[a]=(scores[a]||0)+w;
      scores[h]=(scores[h]||0)+w;
      const winner=as2>hs2?a:h;
      scores[winner]=(scores[winner]||0)+5; // win bonus
    }
    const maxS=Math.max(...Object.values(scores));
    return Object.entries(scores)
      .map(([ab,sc])=>({ab,pct:Math.round(sc/maxS*100)}))
      .sort((a,b)=>b.pct-a.pct)
      .slice(0,8);
  },[]);

  // Teams grouped by conference + division
  const confDivs=useMemo(()=>{
    const divs={};
    for(const[ab,tm] of Object.entries(TM)){
      if(tm.conf!==conf) continue;
      if(!divs[tm.div]) divs[tm.div]=[];
      divs[tm.div].push({ab,...tm});
    }
    return divs;
  },[conf]);

  // Trending players by position (sort by best fpts if statsCache available)
  const trending=useMemo(()=>{
    let list=players.filter(p=>p.pos===posTab);
    if(Object.keys(statsCache).length>10){
      list=[...list].sort((a,b)=>{
        const bA=Object.values(statsCache[a.id]||{}).reduce((m,s)=>Math.max(m,s.fpts||0),0);
        const bB=Object.values(statsCache[b.id]||{}).reduce((m,s)=>Math.max(m,s.fpts||0),0);
        return bB-bA;
      });
    }
    return list.slice(0,8);
  },[players,statsCache,posTab]);

  // Recent SB champions (newest first)
  const champs=Object.entries(BK)
    .sort((a,b)=>+b[0]-+a[0]).slice(0,5)
    .map(([yr,d])=>{
      const won=d.sb.as>d.sb.hs?d.sb.a:d.sb.h;
      const lost=d.sb.as>d.sb.hs?d.sb.h:d.sb.a;
      return{yr,won,lost,score:`${Math.max(d.sb.as,d.sb.hs)}-${Math.min(d.sb.as,d.sb.hs)}`,mvp:d.sb.mvp};
    });

  return(
    <div className="fu" style={{padding:'22px 24px',minHeight:'100vh'}}>

      {/* ── HERO ── */}
      <div style={{background:'linear-gradient(135deg,rgba(0,196,255,.07),rgba(255,186,0,.03),rgba(7,8,13,.9))',
        border:'1px solid rgba(0,196,255,.12)',borderRadius:18,padding:'26px 30px',marginBottom:18}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:20}}>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
              <div className="pulse" style={{width:7,height:7,borderRadius:'50%',background:'var(--lm)',flexShrink:0}}/>
              <span style={{color:'rgba(232,236,248,.45)',fontSize:11,letterSpacing:1.5,
                fontFamily:"'Exo 2',sans-serif",textTransform:'uppercase'}}>Live · March 2026</span>
            </div>
            <h1 style={{fontFamily:"'Bebas Neue'",fontSize:46,lineHeight:.92,letterSpacing:2,marginBottom:12}}>
              NFL FANTASY<br/><span style={{color:'var(--em)'}}>INTELLIGENCE HUB</span>
            </h1>
            <p style={{color:'rgba(232,236,248,.45)',fontSize:13,lineHeight:1.65,maxWidth:460,marginBottom:16}}>
              Real-time data from ESPN across all 32 NFL teams. Career stats, projections, draft rankings, and market inefficiency scores.
            </p>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {["Players","Teams","Rankings","Edge Board"].map((t,i)=>(
                <button key={t} onClick={()=>go(t)} style={{padding:'9px 20px',borderRadius:9,
                  border:i===0?'none':'1px solid rgba(255,255,255,.1)',
                  background:i===0?'linear-gradient(135deg,var(--em),var(--sk))':'rgba(255,255,255,.05)',
                  color:i===0?'#000':'rgba(232,236,248,.8)',fontWeight:700,fontSize:13,cursor:'pointer',
                  boxShadow:i===0?'0 0 16px rgba(0,196,255,.3)':'none'}}>{t}</button>
              ))}
            </div>
          </div>
          {/* Right: big count + pos breakdown */}
          <div style={{flexShrink:0,textAlign:'right'}}>
            {loading ? (
              <div style={{color:'rgba(232,236,248,.35)',fontSize:13}}>Loading rosters…</div>
            ) : (
              <>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:52,letterSpacing:2,color:'var(--em)',lineHeight:1,textShadow:'0 0 30px rgba(0,196,255,.5)'}}>{players.length}</div>
                <div style={{color:'rgba(232,236,248,.35)',fontSize:11,textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>Active Players</div>
                <div style={{display:'flex',gap:14,justifyContent:'flex-end'}}>
                  {[["QB","var(--em)"],["RB","var(--lm)"],["WR","var(--sk)"],["TE","var(--vi)"],["K","var(--kc)"]].map(([pos,c])=>(
                    <div key={pos} style={{textAlign:'center'}}>
                      <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:c,lineHeight:1}}>{players.filter(p=>p.pos===pos).length}</div>
                      <div style={{color:'rgba(232,236,248,.35)',fontSize:10,letterSpacing:.5}}>{pos}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── MAIN 2-COL: Trending Players + SB Contenders ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:16,marginBottom:16}}>

        {/* TRENDING PLAYERS */}
        <div style={{background:'rgba(8,12,10,.70)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',border:'1px solid var(--bd)',borderRadius:16,padding:18}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:1}}>TRENDING PLAYERS</div>
            <div style={{display:'flex',gap:4}}>
              {["QB","RB","WR","TE","K"].map(p=>(
                <button key={p} onClick={()=>setPosTab(p)} style={{padding:'4px 10px',borderRadius:6,border:'none',
                  background:posTab===p?posColor(p):'rgba(255,255,255,.06)',
                  color:posTab===p?'#000':'rgba(232,236,248,.55)',
                  fontWeight:posTab===p?800:500,fontSize:12,cursor:'pointer'}}>{p}</button>
              ))}
            </div>
          </div>
          {loading ? <Spinner msg="Loading roster…"/> : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
              {trending.map(p=>{
                const bestFpts=statsCache[p.id]?Object.values(statsCache[p.id]).reduce((m,s)=>Math.max(m,s.fpts||0),0):0;
                const tc=TM[p.tm]?.c1||'#00C4FF';
                return(
                  <div key={p.id} onClick={()=>goP(p.id)}
                    style={{background:`linear-gradient(150deg,${tc}20,${tc}08,rgba(18,19,32,.9))`,
                      border:`1px solid ${tc}28`,borderTop:`3px solid ${tc}`,
                      borderRadius:12,padding:'12px 10px',textAlign:'center',
                      cursor:'pointer',transition:'all .2s',
                      position:'relative',overflow:'hidden'}}
                    onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-3px)';e.currentTarget.style.boxShadow=`0 8px 30px ${tc}35`;}}
                    onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='none';}}>
                    {/* Jersey number watermark */}
                    {p.n && <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
                      fontFamily:"'Bebas Neue'",fontSize:80,color:tc,opacity:.08,lineHeight:1,
                      userSelect:'none',pointerEvents:'none',letterSpacing:-2,whiteSpace:'nowrap'}}>{p.n}</div>}
                    {/* Position badge top-left */}
                    <div style={{position:'absolute',top:7,left:8,background:`${posColor(p.pos)}20`,
                      border:`1px solid ${posColor(p.pos)}50`,color:posColor(p.pos),fontSize:9,fontWeight:700,
                      fontFamily:"'Exo 2',sans-serif",letterSpacing:.8,padding:'2px 6px',borderRadius:4}}>{p.pos}</div>
                    {/* Headshot with team glow ring */}
                    <div style={{display:'inline-block',borderRadius:'50%',boxShadow:`0 0 0 2px ${tc}40`,marginTop:4,marginBottom:2}}>
                      <Hs src={p.hs} sz={46}/>
                    </div>
                    <div style={{fontWeight:700,fontSize:12,marginTop:5,lineHeight:1.2,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',position:'relative'}}>{p.nm}</div>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4,marginTop:4,position:'relative'}}>
                      <Logo ab={p.tm} sz={14}/>
                      <span style={{color:'rgba(232,236,248,.5)',fontSize:10}}>{p.tm}</span>
                    </div>
                    {bestFpts>0 && <div style={{color:'var(--gd)',fontSize:10,fontWeight:700,marginTop:4,position:'relative'}}>{bestFpts} fpts</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SB CONTENDERS */}
        <div style={{background:'rgba(8,12,10,.70)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',border:'1px solid var(--bd)',borderRadius:16,padding:18}}>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:1,marginBottom:3}}>SB CONTENDERS</div>
          <div style={{color:'rgba(0,196,255,.3)',fontSize:10,textTransform:'uppercase',letterSpacing:.8,marginBottom:14,fontFamily:"'Exo 2',sans-serif"}}>2017–2024 Playoff History</div>
          {sbContenders.map(({ab,pct})=>(
            <div key={ab} onClick={()=>goT(ab)} style={{marginBottom:10,cursor:'pointer'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:3}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <Logo ab={ab} sz={18}/>
                  <span style={{fontSize:12,fontWeight:600}}>{ab}</span>
                  <span style={{color:'rgba(232,236,248,.35)',fontSize:10}}>{TM[ab]?.n}</span>
                </div>
                <span style={{fontFamily:"'Bebas Neue'",fontSize:14,color:'var(--em)'}}>{pct}%</span>
              </div>
              <div style={{background:'rgba(0,196,255,.06)',borderRadius:4,height:4}}>
                <div style={{width:`${pct}%`,height:'100%',background:TM[ab]?.c1||'var(--em)',borderRadius:4,transition:'width .5s'}}/>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TEAM GRID BY CONFERENCE ── */}
      <div style={{background:'rgba(8,12,10,.70)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',border:'1px solid var(--bd)',borderRadius:16,padding:18,marginBottom:16}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:1}}>TEAMS BY DIVISION</div>
          <div style={{display:'flex',gap:4}}>
            {["AFC","NFC"].map(c=>(
              <button key={c} onClick={()=>setConf(c)} style={{padding:'5px 14px',borderRadius:7,border:'none',
                background:conf===c?'var(--em)':'rgba(255,255,255,.06)',
                color:conf===c?'#000':'rgba(232,236,248,.55)',
                fontWeight:700,fontSize:13,cursor:'pointer'}}>{c}</button>
            ))}
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
          {["East","North","South","West"].map(div=>{
            const divTeams=confDivs[div]||[];
            return(
              <div key={div}>
                <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:10,fontWeight:700,
                  letterSpacing:1.5,color:'rgba(0,196,255,.28)',textTransform:'uppercase',marginBottom:8}}>
                  {conf} {div}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {divTeams.map(t=>(
                    <div key={t.ab} onClick={()=>goT(t.ab)}
                      style={{display:'flex',alignItems:'center',gap:9,padding:'8px 10px',
                        borderRadius:9,border:'1px solid var(--bd)',background:'var(--s2)',
                        cursor:'pointer',transition:'all .15s'}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor=t.c1;e.currentTarget.style.background=`${t.c1}14`}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--bd)';e.currentTarget.style.background='var(--s2)'}}>
                      <Logo ab={t.ab} sz={26}/>
                      <div>
                        <div style={{fontWeight:700,fontSize:13}}>{t.ab}</div>
                        <div style={{color:'rgba(232,236,248,.38)',fontSize:10}}>{t.n}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RECENT SB CHAMPIONS ── */}
      <div style={{background:'rgba(8,12,10,.70)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',border:'1px solid var(--bd)',borderRadius:16,padding:18}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:1,marginBottom:14}}>RECENT SUPER BOWL CHAMPIONS</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10}}>
          {champs.map(({yr,won,lost,score,mvp})=>(
            <div key={yr} onClick={()=>goT(won)}
              style={{background:'var(--s2)',border:`1px solid ${TM[won]?.c1||'var(--bd)'}33`,
                borderRadius:12,padding:'14px 12px',cursor:'pointer',transition:'all .15s'}}
              onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.borderColor=TM[won]?.c1+'88'}}
              onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.borderColor=`${TM[won]?.c1||'var(--bd)'}33`}}>
              <div style={{color:'rgba(232,236,248,.3)',fontSize:10,textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>SB {yr}</div>
              <Logo ab={won} sz={38}/>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:1,marginTop:7}}>{won}</div>
              <div style={{color:'var(--gd)',fontWeight:700,fontSize:14}}>{score}</div>
              <div style={{color:'rgba(232,236,248,.35)',fontSize:10,marginTop:2}}>def. {lost}</div>
              <div style={{color:'rgba(232,236,248,.25)',fontSize:9,marginTop:4}}>MVP: {mvp}</div>
            </div>
          ))}
        </div>
      </div>

      {loading && <div style={{marginTop:16}}><Spinner msg="Fetching all 32 team rosters from ESPN…"/></div>}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
//  PLAYERS PAGE — Dynamic ESPN fetch
// ═══════════════════════════════════════════════════════════════
const Players = ({players,loading,sel,setSel,goT,statsCache,setStatsCache}) => {
  const[pos,setPos]=useState("ALL");const[q,setQ]=useState("");const[yr,setYr]=useState(null);const[fetching,setFetching]=useState(false);
  const[gameLog,setGameLog]=useState([]);const[fetchingLog,setFetchingLog]=useState(false);
  const list = useMemo(()=>{let l=players;if(pos!=="ALL")l=l.filter(p=>p.pos===pos);if(q)l=l.filter(p=>p.nm.toLowerCase().includes(q.toLowerCase())||p.tm.toLowerCase().includes(q.toLowerCase()));return l},[players,pos,q]);

  const pl = players.find(p=>p.id===sel);
  const stats = pl ? statsCache[pl.id] : null;
  const seasons = stats ? Object.entries(stats).sort((a,b)=>+a[0]-+b[0]) : [];
  const ay = yr || (seasons.length ? seasons[seasons.length-1][0] : null);
  const st = stats?.[ay];

  // Fetch stats when player selected
  useEffect(()=>{
    if (!sel) return;
    if (statsCache[sel]) { setYr(null); return; }
    let cancelled = false;
    setFetching(true);
    fetchPlayerStats(sel).then(data => {
      if (!cancelled) {
        setStatsCache(prev => ({...prev, [sel]: data || {}}));
        setYr(null);
        setFetching(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setStatsCache(prev => ({...prev, [sel]: {}}));
        setFetching(false);
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sel]);

  // Fetch game log for matchup chart when player selected
  useEffect(()=>{
    if (!sel) { setGameLog([]); return; }
    setFetchingLog(true);
    fetchPlayerGameLog(sel, 2024).then(log => {
      setGameLog(log || []);
      setFetchingLog(false);
    }).catch(()=>{
      setGameLog([]);
      setFetchingLog(false);
    });
  },[sel]);

  // Build chart data with ALL stat categories
  const chartData = seasons.map(([y,s])=>({
    year: y,
    "Fantasy Pts": s.fpts||0,
    "Projected PPR": calcPlayerSeasonProjection(stats, +y),
    "Pass Yds": s.passYd||0,
    "Pass TD": s.passTD||0,
    "Rush Yds": s.rushYd||0,
    "Rush TD": s.rushTD||0,
    "Rec Yds": s.recYd||0,
    "Rec TD": s.recTD||0,
    "Receptions": s.rec||0,
    "INT": s.passInt||0,
    "FGM": s.fgm||0,
    "FGA": s.fga||0,
    "PAT": s.patm||0,
    "FG%": s.fgPct ? +(s.fgPct > 1 ? s.fgPct : s.fgPct * 100).toFixed(1) : 0,
  }));

  // Build matchup chart: avg PPR per opponent
  const matchupData = useMemo(()=>{
    if (!gameLog.length) return [];
    const totals = {};
    for (const g of gameLog) {
      if (!totals[g.opp]) totals[g.opp] = { total: 0, count: 0 };
      totals[g.opp].total += g.fpts;
      totals[g.opp].count += 1;
    }
    return Object.entries(totals)
      .map(([opp, d]) => ({ opp, avg: +(d.total / d.count).toFixed(1), games: d.count }))
      .sort((a, b) => b.avg - a.avg);
  }, [gameLog]);

  return <div className="fu" style={{padding:'24px 24px'}}>
    <div style={{display:'grid',gridTemplateColumns:'320px 1fr',gap:18,minHeight:'calc(100vh - 110px)'}}>
      {/* SIDEBAR */}
      <div>
        <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:14,marginBottom:12}}>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search player or team..." style={{width:'100%',padding:'10px 12px',borderRadius:9,border:'1px solid var(--bd)',background:'rgba(0,0,0,.3)',color:'var(--tx)',outline:'none',fontSize:14,marginBottom:8}}/>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{["ALL","QB","RB","WR","TE","K"].map(p=><button key={p} onClick={()=>setPos(p)} style={{padding:'5px 12px',borderRadius:7,border:'none',background:pos===p?posColor(p==="ALL"?"QB":p):'rgba(255,255,255,.05)',color:pos===p?'#000':'var(--tx)',fontWeight:pos===p?800:500,fontSize:12,cursor:'pointer'}}>{p} {pos==="ALL"?"":p===pos?`(${list.length})`:""}</button>)}</div>
          {!loading && <div style={{color:'var(--dm)',fontSize:11,marginTop:6}}>{list.length} players loaded from ESPN</div>}
        </div>
        <div style={{maxHeight:'calc(100vh - 240px)',overflowY:'auto',display:'flex',flexDirection:'column',gap:4}}>
          {loading ? <Spinner msg="Loading rosters..."/> :
            list.map(p=>{
              const tc=TM[p.tm]?.c1||'#00C4FF';
              const isSel=sel===p.id;
              return <div key={p.id} onClick={()=>setSel(p.id)}
                style={{display:'flex',alignItems:'center',gap:9,padding:'9px 12px',borderRadius:10,
                  cursor:'pointer',
                  background:isSel?`${tc}18`:`${tc}06`,
                  border:`1px solid ${isSel?tc+'44':'var(--bd)'}`,
                  borderLeft:`3px solid ${isSel?tc:posColor(p.pos)}`,
                  transition:'all .12s'}}
                onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background=`${tc}10`;}}
                onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background=`${tc}06`;}}>
                <Hs src={p.hs} sz={34}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.nm}</div>
                  <div style={{display:'flex',alignItems:'center',gap:5}}>
                    <Pil ch={p.pos} c={posColor(p.pos)} s={{padding:'2px 6px',fontSize:10}}/>
                    <span style={{color:'var(--dm)',fontSize:11}}>{p.tm} #{p.n}</span>
                  </div>
                </div>
              </div>;
            })}
        </div>
      </div>

      {/* DETAIL */}
      <div>{!pl ?
        <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:60,textAlign:'center'}}><h2 style={{fontFamily:"'Bebas Neue'",fontSize:22}}>SELECT A PLAYER</h2><p style={{color:'var(--dm)',fontSize:14,marginTop:6}}>Choose from {players.length} active NFL players</p></div>
      : fetching ?
        <Spinner msg={`Fetching stats for ${pl.nm} from ESPN API...`}/>
      :
        <div className="fu">
          {/* HEADER */}
          <div style={{background:`linear-gradient(135deg,${TM[pl.tm]?.c1}28,${TM[pl.tm]?.c1}0a,var(--s1))`,
            border:`1px solid ${TM[pl.tm]?.c1}30`,
            borderTop:`3px solid ${TM[pl.tm]?.c1}`,
            borderLeft:`3px solid ${TM[pl.tm]?.c1}60`,
            borderRadius:14,padding:18,marginBottom:12,
            position:'relative',overflow:'hidden'}}>
            {/* Jersey mega-watermark */}
            {pl.n && <div style={{position:'absolute',right:-10,bottom:-20,
              fontFamily:"'Bebas Neue'",fontSize:180,color:TM[pl.tm]?.c1||'var(--em)',
              opacity:.06,lineHeight:1,userSelect:'none',pointerEvents:'none',letterSpacing:-8}}>{pl.n}</div>}
            <div style={{display:'flex',alignItems:'center',gap:16,position:'relative'}}>
              {/* Headshot with double-ring glow */}
              <div style={{borderRadius:'50%',boxShadow:`0 0 0 3px ${TM[pl.tm]?.c1||'#00C4FF'}50, 0 0 20px ${TM[pl.tm]?.c1||'#00C4FF'}25`,flexShrink:0}}>
                <Hs src={pl.hs} sz={80}/>
              </div>
              <div style={{flex:1}}>
                <h2 style={{fontFamily:"'Bebas Neue'",fontSize:34,letterSpacing:2,lineHeight:1}}>{pl.nm}</h2>
                <div style={{display:'flex',alignItems:'center',gap:8,marginTop:5}}>
                  <Pil ch={pl.pos} c={posColor(pl.pos)} s={{fontSize:12,padding:'4px 12px'}}/>
                  <span style={{cursor:'pointer',color:'var(--dm)',fontSize:14,textDecoration:'underline'}} onClick={()=>goT(pl.tm)}>{TM[pl.tm]?.c} {TM[pl.tm]?.n}</span>
                  <span style={{color:'var(--dm)',fontSize:14}}>#{pl.n}{pl.age?` • Age ${pl.age}`:""}{pl.exp?` • ${pl.exp}yr exp`:""}</span>
                </div>
              </div>
              <Logo ab={pl.tm} sz={50}/>
            </div>
            {seasons.length > 0 && <div style={{display:'flex',gap:4,marginTop:12,flexWrap:'wrap',position:'relative'}}>{seasons.map(([y])=><button key={y} onClick={()=>setYr(y)} style={{padding:'5px 11px',borderRadius:7,border:'none',background:ay===y?'var(--em)':'rgba(255,255,255,.05)',color:ay===y?'#000':'var(--tx)',fontWeight:ay===y?800:500,fontSize:13,cursor:'pointer'}}>{y}</button>)}</div>}
          </div>

          {!stats || seasons.length === 0 ?
            <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:36,textAlign:'center',color:'var(--dm)'}}>No historical stats found. Player may be a rookie or data unavailable.</div>
          : <>
            {/* STAT CARDS */}
            {st && <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
              <StCard l="GP" v={st.gp||"—"} c="var(--tx)"/>
              {(pl.pos==="QB") && <><StCard l="Pass Yds" v={st.passYd?.toLocaleString()} c="var(--em)"/><StCard l="Pass TD" v={st.passTD} c="var(--lm)"/><StCard l="INT" v={st.passInt} c="var(--rs)"/><StCard l="Rush Yds" v={st.rushYd?.toLocaleString()} c="var(--sk)"/><StCard l="Rush TD" v={st.rushTD} c="var(--vi)"/><StCard l="Rating" v={st.passRat?st.passRat.toFixed(1):"—"} c="var(--gd)"/></>}
              {(pl.pos==="RB") && <><StCard l="Rush Yds" v={st.rushYd?.toLocaleString()} c="var(--em)"/><StCard l="Rush TD" v={st.rushTD} c="var(--lm)"/><StCard l="Rec" v={st.rec} c="var(--sk)"/><StCard l="Rec Yds" v={st.recYd?.toLocaleString()} c="var(--vi)"/><StCard l="Rec TD" v={st.recTD} c="var(--gd)"/></>}
              {(pl.pos==="WR"||pl.pos==="TE") && <><StCard l="Rec" v={st.rec} c="var(--em)"/><StCard l="Rec Yds" v={st.recYd?.toLocaleString()} c="var(--sk)"/><StCard l="Rec TD" v={st.recTD} c="var(--lm)"/><StCard l="Rush Yds" v={st.rushYd?.toLocaleString()||"0"} c="var(--vi)"/><StCard l="Rush TD" v={st.rushTD||0} c="var(--gd)"/></>}
              {(pl.pos==="K") && <><StCard l="FGM" v={st.fgm||0} c="var(--kc)"/><StCard l="FGA" v={st.fga||0} c="var(--sk)"/><StCard l="FG%" v={st.fgPct?(st.fgPct>1?st.fgPct.toFixed(1):(st.fgPct*100).toFixed(1))+"%":"—"} c="var(--em)"/><StCard l="PAT" v={st.patm||0} c="var(--lm)"/><StCard l="Long" v={st.longFG||"—"} c="var(--vi)"/></>}
              <StCard l="FPTS" v={st.fpts} c="var(--gd)"/>
            </div>}

            {/* CHARTS — All stat categories */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              {/* Fantasy Points */}
              <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:14}}>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:1,marginBottom:10}}>FANTASY POINTS (PPR)</div>
                <ResponsiveContainer width="100%" height={200}><AreaChart data={chartData}><defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00C4FF" stopOpacity={.3}/><stop offset="95%" stopColor="#00C4FF" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/><XAxis dataKey="year"/><YAxis/><Tooltip content={<TT/>}/><Area type="monotone" dataKey="Fantasy Pts" stroke="#00C4FF" fill="url(#fg)" strokeWidth={2}/></AreaChart></ResponsiveContainer>
              </div>

              {/* Yards / FG Volume */}
              <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:14}}>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:1,marginBottom:10}}>
                  {pl.pos==="K" ? "FIELD GOALS BY SEASON" : "YARDS BY SEASON"}
                </div>
                {pl.pos==="K" ? (
                  <ResponsiveContainer width="100%" height={200}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/><XAxis dataKey="year"/><YAxis/><Tooltip content={<TT/>}/><Legend iconSize={10}/>
                    <Bar dataKey="FGM" fill="#FFBA00" radius={[3,3,0,0]}/>
                    <Bar dataKey="FGA" fill="rgba(255,186,0,.3)" radius={[3,3,0,0]}/>
                  </BarChart></ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height={200}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/><XAxis dataKey="year"/><YAxis/><Tooltip content={<TT/>}/><Legend iconSize={10}/>
                    {pl.pos==="QB" && <Bar dataKey="Pass Yds" fill="#00C4FF" radius={[3,3,0,0]}/>}
                    <Bar dataKey="Rush Yds" fill="#00E09B" radius={[3,3,0,0]}/>
                    <Bar dataKey="Rec Yds" fill="#818CF8" radius={[3,3,0,0]}/>
                  </BarChart></ResponsiveContainer>
                )}
              </div>

              {/* Touchdowns / FG% */}
              <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:14}}>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:1,marginBottom:10}}>
                  {pl.pos==="K" ? "FG% BY SEASON" : "TOUCHDOWNS BY SEASON"}
                </div>
                {pl.pos==="K" ? (
                  <ResponsiveContainer width="100%" height={200}><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/><XAxis dataKey="year"/><YAxis domain={[0,100]}/><Tooltip content={<TT/>}/>
                    <Line type="monotone" dataKey="FG%" stroke="#FFBA00" strokeWidth={2} dot={{fill:'#FFBA00',r:4}}/>
                  </LineChart></ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height={200}><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/><XAxis dataKey="year"/><YAxis/><Tooltip content={<TT/>}/><Legend iconSize={10}/>
                    {pl.pos==="QB" && <Line type="monotone" dataKey="Pass TD" stroke="#00C4FF" strokeWidth={2} dot={{fill:'#00C4FF',r:4}}/>}
                    <Line type="monotone" dataKey="Rush TD" stroke="#00E09B" strokeWidth={2} dot={{fill:'#00E09B',r:4}}/>
                    <Line type="monotone" dataKey="Rec TD" stroke="#818CF8" strokeWidth={2} dot={{fill:'#818CF8',r:4}}/>
                  </LineChart></ResponsiveContainer>
                )}
              </div>

              {/* INT / Receptions / PAT */}
              <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:14}}>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:1,marginBottom:10}}>
                  {pl.pos==="QB" ? "INTERCEPTIONS" : pl.pos==="K" ? "EXTRA POINTS (PAT)" : "RECEPTIONS"}
                </div>
                <ResponsiveContainer width="100%" height={200}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/><XAxis dataKey="year"/><YAxis/><Tooltip content={<TT/>}/>
                  {pl.pos==="QB" ? <Bar dataKey="INT" fill="#FF3D5A" radius={[3,3,0,0]}/> :
                   pl.pos==="K"  ? <Bar dataKey="PAT" fill="#FFBA00" radius={[3,3,0,0]}/> :
                                   <Bar dataKey="Receptions" fill="#A78BFA" radius={[3,3,0,0]}/>}
                </BarChart></ResponsiveContainer>
              </div>
            </div>

            {/* PROJECTED vs ACTUAL PPR CHART */}
            <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:14,marginBottom:12}}>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:1,marginBottom:4}}>PROJECTED vs ACTUAL PPR BY SEASON</div>
              <div style={{color:'var(--dm)',fontSize:12,marginBottom:10}}>Actual PPR scored (orange) vs position-average projection (dashed blue) — shows over/underperformance each year</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
                  <XAxis dataKey="year" tick={{fontSize:13}}/>
                  <YAxis tick={{fontSize:13}}/>
                  <Tooltip content={<TT/>}/>
                  <Legend iconSize={10}/>
                  <Line type="monotone" dataKey="Fantasy Pts" stroke="#00C4FF" strokeWidth={2.5} dot={{fill:'#00C4FF',r:4}} name="Actual PPR"/>
                  <Line type="monotone" dataKey="Projected PPR" stroke="#818CF8" strokeWidth={2} strokeDasharray="6 3" dot={{fill:'#818CF8',r:3}} name="Proj PPR (pos avg)"/>
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* MATCHUP CHART — avg PPR vs each opponent (2024 game log) */}
            <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:14,marginBottom:12}}>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:1,marginBottom:4}}>AVG PPR POINTS VS OPPONENT (2024)</div>
              <div style={{color:'var(--dm)',fontSize:12,marginBottom:10}}>Average fantasy points scored against each team faced in the 2024 season — sorted highest to lowest</div>
              {fetchingLog ? <Spinner msg="Loading game log..."/> :
               matchupData.length === 0 ?
                <div style={{color:'var(--dm)',fontSize:13,padding:'20px 0',textAlign:'center'}}>Game log data not available for this player.</div>
              :
                <ResponsiveContainer width="100%" height={Math.max(200, matchupData.length * 28)}>
                  <BarChart data={matchupData} layout="vertical" margin={{left:10,right:20}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
                    <XAxis type="number" tick={{fontSize:12}}/>
                    <YAxis dataKey="opp" type="category" width={44} tick={{fontSize:12}}/>
                    <Tooltip content={<TT/>}/>
                    <Bar dataKey="avg" name="Avg PPR" radius={[0,4,4,0]}>
                      {matchupData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.avg >= 20 ? "#00E09B" : entry.avg >= 10 ? "#00C4FF" : "#FF3D5A"}/>
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              }
            </div>

            {/* STAT TABLE */}
            <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:14,overflowX:'auto'}}>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:1,marginBottom:10}}>CAREER STATS (2017-2025)</div>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr style={{borderBottom:'2px solid var(--bd)'}}>
                <th style={th}>Year</th><th style={th}>GP</th>
                <th style={th}>Pass Yd</th><th style={th}>P-TD</th><th style={th}>INT</th>
                <th style={th}>Rush Yd</th><th style={th}>R-TD</th>
                <th style={th}>Rec</th><th style={th}>Rec Yd</th><th style={th}>Re-TD</th>
                <th style={th}>FPTS</th>
              </tr></thead>
              <tbody>{seasons.map(([y,s])=><tr key={y} onClick={()=>setYr(y)} style={{borderBottom:'1px solid var(--bd)',cursor:'pointer',background:ay===y?'rgba(0,196,255,.06)':'transparent'}}>
                <td style={td}><strong>{y}</strong></td>
                <td style={td}>{s.gp||"—"}</td>
                <td style={td}>{s.passYd?s.passYd.toLocaleString():"—"}</td>
                <td style={{...td,color:s.passTD?'var(--lm)':'var(--dm)'}}>{s.passTD||"—"}</td>
                <td style={{...td,color:s.passInt?'var(--rs)':'var(--dm)'}}>{s.passInt||"—"}</td>
                <td style={td}>{s.rushYd?s.rushYd.toLocaleString():"—"}</td>
                <td style={{...td,color:s.rushTD?'var(--lm)':'var(--dm)'}}>{s.rushTD||"—"}</td>
                <td style={td}>{s.rec||"—"}</td>
                <td style={td}>{s.recYd?s.recYd.toLocaleString():"—"}</td>
                <td style={{...td,color:s.recTD?'var(--lm)':'var(--dm)'}}>{s.recTD||"—"}</td>
                <td style={{...td,color:'var(--gd)',fontWeight:700}}>{s.fpts||"—"}</td>
              </tr>)}</tbody></table>
            </div>
          </>}
        </div>
      }</div>
    </div>
  </div>;
};

// ═══════════════════════════════════════════════════════════════
//  TEAMS PAGE
// ═══════════════════════════════════════════════════════════════
const Teams = ({sel,setSel,players,goP,statsCache}) => {
  const[conf,setConf]=useState("ALL");
  const[depthChart,setDepthChart]=useState({});
  const[loadingDepth,setLoadingDepth]=useState(false);
  const t = TM[sel];
  const roster = players.filter(p=>p.tm===sel);
  const afcT = new Set(ALL_AB.filter(ab=>TM[ab].conf==="AFC"));
  const filt = conf==="ALL"?ALL_AB:ALL_AB.filter(ab=>conf==="AFC"?afcT.has(ab):!afcT.has(ab));

  // Fetch real depth chart when team changes
  useEffect(()=>{
    if(!sel) return;
    const tid = AB_TO_TID[sel];
    if(!tid) return;
    setLoadingDepth(true);
    setDepthChart({});
    fetchTeamDepthChart(tid).then(chart=>{
      setDepthChart(chart||{});
      setLoadingDepth(false);
    }).catch(()=>setLoadingDepth(false));
  },[sel]);

  // Sort a position group:
  //   1. Official ESPN depth chart if available
  //   2. Stats-based (weighted recent PPR) for players not in the chart or when no chart
  //   3. Experience years as final tiebreaker — never raw jersey number
  const sortByDepth = (group, pos) => {
    const order = depthChart[pos];
    const statSort = (a, b) => {
      const as = playerStatScore(a, statsCache);
      const bs = playerStatScore(b, statsCache);
      if (as !== -1 && bs !== -1 && as !== bs) return bs - as;  // higher stats first
      if (as !== -1 && bs === -1) return -1;   // a has stats, b doesn't
      if (as === -1 && bs !== -1) return 1;    // b has stats, a doesn't
      // No stats for either — use experience then age
      const ae = a.exp ?? -1, be = b.exp ?? -1;
      if (ae !== be) return be - ae;
      return (b.age || 0) - (a.age || 0);
    };

    if (order && order.length > 0) {
      return [...group].sort((a, b) => {
        const ai = order.indexOf(String(a.id));
        const bi = order.indexOf(String(b.id));
        if (ai !== -1 && bi !== -1) return ai - bi;   // both in official chart
        if (ai !== -1) return -1;                      // a is charted, b isn't
        if (bi !== -1) return 1;                       // b is charted, a isn't
        return statSort(a, b);                         // neither charted → stats
      });
    }
    // No official chart at all → rank entirely by stats/experience
    return [...group].sort(statSort);
  };

  const hasOfficialChart = Object.keys(depthChart).length > 0;

  return <div className="fu" style={{padding:'24px 24px'}}><div style={{display:'grid',gridTemplateColumns:'280px 1fr',gap:18}}>
    <div>
      <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:12,marginBottom:10}}><div style={{display:'flex',gap:4}}>{["ALL","AFC","NFC"].map(c=><button key={c} onClick={()=>setConf(c)} style={{flex:1,padding:'6px',borderRadius:7,border:'none',background:conf===c?'var(--em)':'rgba(255,255,255,.05)',color:conf===c?'#000':'var(--tx)',fontWeight:conf===c?800:500,fontSize:13,cursor:'pointer'}}>{c}</button>)}</div></div>
      <div style={{maxHeight:'calc(100vh - 200px)',overflowY:'auto',display:'flex',flexDirection:'column',gap:4}}>
        {filt.map(ab=>{const cnt=players.filter(p=>p.tm===ab).length;return<div key={ab} onClick={()=>setSel(ab)} style={{display:'flex',alignItems:'center',gap:9,padding:'8px 12px',borderRadius:10,cursor:'pointer',background:sel===ab?`${TM[ab].c1}18`:'var(--s1)',border:`1px solid ${sel===ab?TM[ab].c1+'44':'var(--bd)'}`}}><Logo ab={ab} sz={32}/><div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{TM[ab].c} {TM[ab].n}</div><div style={{color:'var(--dm)',fontSize:11}}>{cnt} offensive players</div></div></div>})}
      </div>
    </div>
    <div>{!t?<div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:60,textAlign:'center'}}><h2 style={{fontFamily:"'Bebas Neue'",fontSize:22}}>SELECT A TEAM</h2></div>:
      <div className="fu">
        <div style={{background:`linear-gradient(135deg,${t.c1}20,var(--s1))`,border:'1px solid var(--bd)',borderRadius:14,padding:18,marginBottom:12,display:'flex',alignItems:'center',gap:16}}>
          <Logo ab={sel} sz={64}/>
          <div style={{flex:1}}>
            <h2 style={{fontFamily:"'Bebas Neue'",fontSize:32,letterSpacing:2}}>{t.c} {t.n}</h2>
            <div style={{color:'var(--dm)',fontSize:14}}>{t.conf} {t.div} • {roster.length} offensive players</div>
          </div>
          {loadingDepth
            ? <span style={{color:'var(--dm)',fontSize:11,fontStyle:'italic'}}>Loading depth chart…</span>
            : hasOfficialChart
              ? <Pil ch="OFFICIAL DEPTH CHART" c="var(--lm)" s={{fontSize:10}}/>
              : <Pil ch="STATS-BASED RANKING" c="var(--sk)" s={{fontSize:10}}/>
          }
        </div>
        {["QB","RB","WR","TE","K"].map(pos=>{
          const group = roster.filter(p=>p.pos===pos);
          if (!group.length) return null;
          const sorted = sortByDepth(group, pos);
          return <div key={pos} style={{marginBottom:14}}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:1,marginBottom:8,color:posColor(pos)}}>{pos}s ({group.length})</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:8}}>
              {sorted.map((p,idx)=>{
                const depthLbl = (DEPTH_LABEL[pos]||[])[idx] || `${pos}${idx+1}`;
                return <div key={p.id} onClick={()=>goP(p.id)}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',
                    borderRadius:10,cursor:'pointer',
                    background:`${t.c1}0a`,
                    border:`1px solid var(--bd)`,
                    borderLeft:`3px solid ${posColor(pos)}`,
                    transition:'all .12s',position:'relative'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=t.c1;e.currentTarget.style.background=`${t.c1}14`;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--bd)';e.currentTarget.style.background=`${t.c1}0a`;}}>
                  <div style={{position:'absolute',top:6,right:8,background:`${posColor(pos)}22`,border:`1px solid ${posColor(pos)}44`,color:posColor(pos),fontSize:11,fontWeight:800,fontFamily:"'Bebas Neue'",letterSpacing:.5,padding:'2px 7px',borderRadius:5}}>{depthLbl}</div>
                  <div style={{borderRadius:'50%',boxShadow:`0 0 0 2px ${t.c1}35`,flexShrink:0}}>
                    <Hs src={p.hs} sz={38}/>
                  </div>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>{p.nm}</div>
                    <div style={{color:'var(--dm)',fontSize:12}}>#{p.n}{p.age?` • ${p.age}yr`:""}{p.exp!=null?` • ${p.exp}yr exp`:""}</div>
                  </div>
                </div>;
              })}
            </div>
          </div>;
        })}
      </div>}
    </div>
  </div></div>;
};

// ═══════════════════════════════════════════════════════════════
//  GAMES (ESPN API LIVE FETCH)
// ═══════════════════════════════════════════════════════════════
const GamesFetch = ({goT}) => {
  const[szn,setSzn]=useState(2024);const[wk,setWk]=useState(1);const[games,setGames]=useState([]);const[loading,setLoading]=useState(false);const[sType,setSType]=useState(2);
  const fetchG = useCallback(async()=>{
    setLoading(true);setGames([]);
    const d=await espn(`${SITE}/scoreboard?limit=100&dates=${szn}&seasontype=${sType}&week=${wk}`);
    if(d?.events)setGames(d.events);
    setLoading(false);
  },[szn,wk,sType]);
  useEffect(()=>{fetchG()},[fetchG]);
  const maxWk=sType===2?(szn>=2021?18:17):(sType===3?5:1);

  // Weather icon helper
  const wxIcon = (cond) => {
    if (!cond) return "";
    const c = cond.toLowerCase();
    if (c.includes("snow")) return "❄️";
    if (c.includes("rain") || c.includes("drizzle")) return "🌧️";
    if (c.includes("thunder") || c.includes("storm")) return "⛈️";
    if (c.includes("cloud") || c.includes("overcast")) return "☁️";
    if (c.includes("clear") || c.includes("sunny")) return "☀️";
    if (c.includes("fog") || c.includes("mist")) return "🌫️";
    if (c.includes("wind")) return "💨";
    return "🌤️";
  };

  return <div className="fu" style={{padding:'24px 24px'}}>
    <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:16,marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
        <h2 style={{fontFamily:"'Bebas Neue'",fontSize:24,letterSpacing:1}}>GAME DATABASE <Pil ch="LIVE ESPN API" c="var(--lm)" s={{marginLeft:10,fontSize:11}}/></h2>
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{[2017,2018,2019,2020,2021,2022,2023,2024,2025].map(s=><button key={s} onClick={()=>{setSzn(s);setWk(1)}} style={{padding:'5px 12px',borderRadius:7,border:'none',background:szn===s?'var(--em)':'rgba(255,255,255,.05)',color:szn===s?'#000':'var(--tx)',fontWeight:szn===s?800:500,fontSize:13,cursor:'pointer'}}>{s}</button>)}</div>
      </div>
      <div style={{display:'flex',gap:5,marginTop:10,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{display:'flex',gap:4,marginRight:10}}>{[{l:"Regular",v:2},{l:"Playoffs",v:3}].map(t=><button key={t.v} onClick={()=>{setSType(t.v);setWk(1)}} style={{padding:'5px 12px',borderRadius:7,border:'none',background:sType===t.v?'var(--sk)':'rgba(255,255,255,.04)',color:sType===t.v?'#000':'var(--dm)',fontWeight:sType===t.v?700:400,fontSize:13,cursor:'pointer'}}>{t.l}</button>)}</div>
        {Array.from({length:maxWk},(_,i)=>i+1).map(w=><button key={w} onClick={()=>setWk(w)} style={{padding:'4px 9px',borderRadius:6,border:'none',background:wk===w?'var(--em)':'rgba(255,255,255,.03)',color:wk===w?'#000':'var(--dm)',fontWeight:wk===w?800:400,fontSize:12,cursor:'pointer',minWidth:32}}>W{w}</button>)}
      </div>
    </div>
    {loading&&<Spinner msg="Loading from ESPN..."/>}
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {games.map(g=>{
        const c=g.competitions?.[0];if(!c)return null;
        const home=c.competitors?.find(x=>x.homeAway==="home");const away=c.competitors?.find(x=>x.homeAway==="away");
        if(!home||!away)return null;
        const hAb=home.team?.abbreviation;const aAb=away.team?.abbreviation;const hS=+home.score;const aS=+away.score;

        // Weather data from ESPN API
        const wx = c.weather || null;
        const wxTemp = wx?.temperature != null ? `${Math.round(wx.temperature)}°F` : null;
        const wxCond = wx?.displayValue || wx?.condition || null;
        const wxWind = wx?.windSpeed != null ? `${Math.round(wx.windSpeed)} mph` : null;
        const wxGust = wx?.windGust != null ? `${Math.round(wx.windGust)} mph gusts` : null;
        const wxHumid = wx?.humidity != null ? `${wx.humidity}% humidity` : null;

        // Notable players: ESPN scoreboard leaders (passing, rushing, receiving)
        const leaders = c.leaders || [];
        const statLeaders = leaders
          .filter(l => ["passingYards","rushingYards","receivingYards"].includes(l.name))
          .map(l => {
            const top = l.leaders?.[0];
            if (!top) return null;
            const ath = top.athlete || top;
            return {
              cat: l.shortDisplayName || l.displayName || l.name,
              name: ath.displayName || ath.fullName || "Unknown",
              hs: ath.headshot?.href || HEAD(ath.id),
              val: top.displayValue || String(Math.round(top.value||0)),
              color: l.name==="passingYards"?"var(--em)":l.name==="rushingYards"?"var(--lm)":"var(--sk)",
            };
          }).filter(Boolean);

        return<div key={g.id} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:16}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:10,flexWrap:'wrap',gap:5}}>
            <Pil ch={g.shortName||g.name||`Week ${wk}`} c="var(--sk)"/><span style={{color:'var(--dm)',fontSize:13}}>{g.date?new Date(g.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):''}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:16}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flex:1}}><Logo ab={aAb} sz={36} onClick={()=>goT(aAb)}/><span style={{fontWeight:700,fontSize:14}}>{away.team?.displayName||aAb}</span><span style={{fontFamily:"'Bebas Neue'",fontSize:32,letterSpacing:1,marginLeft:'auto',color:aS>hS?'var(--lm)':'var(--tx)'}}>{aS}</span></div>
            <span style={{color:'var(--dm)',fontSize:13}}>@</span>
            <div style={{display:'flex',alignItems:'center',gap:8,flex:1}}><span style={{fontFamily:"'Bebas Neue'",fontSize:32,letterSpacing:1,color:hS>aS?'var(--lm)':'var(--tx)'}}>{hS}</span><span style={{fontWeight:700,fontSize:14,marginRight:'auto'}}>{home.team?.displayName||hAb}</span><Logo ab={hAb} sz={36} onClick={()=>goT(hAb)}/></div>
          </div>
          {/* Venue + Weather row */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8,marginTop:8}}>
            {c.venue && <div style={{color:'var(--dm)',fontSize:12}}>📍 {c.venue.fullName}{c.venue.indoor?' • Indoor':''}</div>}
            {wx && <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              {wxCond && <span style={{color:'var(--sk)',fontSize:12,fontWeight:600}}>{wxIcon(wxCond)} {wxCond}</span>}
              {wxTemp && <span style={{color:'var(--tx)',fontSize:12}}>{wxTemp}</span>}
              {wxWind && <span style={{color:'var(--dm)',fontSize:12}}>💨 {wxWind}{wxGust?` (${wxGust})`:''}</span>}
              {wxHumid && <span style={{color:'var(--dm)',fontSize:12}}>{wxHumid}</span>}
            </div>}
            {!wx && c.venue && !c.venue.indoor && <span style={{color:'var(--dm)',fontSize:11,fontStyle:'italic'}}>Weather unavailable</span>}
          </div>
          {/* Notable player leaders */}
          {statLeaders.length > 0 && (
            <div style={{marginTop:12,paddingTop:10,borderTop:'1px solid var(--bd)'}}>
              <div style={{fontSize:10,color:'var(--dm)',fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:8,fontFamily:"'Exo 2',sans-serif"}}>Notable Performers</div>
              <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                {statLeaders.map((ldr,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:8,background:'rgba(0,0,0,.25)',border:`1px solid ${ldr.color}22`,borderRadius:10,padding:'6px 10px',flex:'1 1 180px',minWidth:160}}>
                    <img src={ldr.hs} alt={ldr.name} width={40} height={40} style={{borderRadius:'50%',objectFit:'cover',border:`2px solid ${ldr.color}44`,flexShrink:0,background:'var(--s2)'}} onError={e=>{e.target.style.opacity='.3'}}/>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ldr.name}</div>
                      <div style={{fontSize:11,color:'var(--dm)',marginBottom:1}}>{ldr.cat}</div>
                      <div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:ldr.color,letterSpacing:.5,lineHeight:1}}>{ldr.val}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>;
      })}
      {!loading&&games.length===0&&<div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:36,textAlign:'center',color:'var(--dm)'}}>No games found for this selection.</div>}
    </div>
  </div>;
};

// ═══════════════════════════════════════════════════════════════
//  BRACKETS
// ═══════════════════════════════════════════════════════════════
const BG = ({a,h,as,hs,goT}) => (
  <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:10,padding:'8px 10px',minWidth:170,fontSize:13}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:7}}><div style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer'}} onClick={()=>goT(a)}><Logo ab={a} sz={20}/><span style={{fontWeight:as>hs?800:400}}>{a}</span></div><span style={{fontFamily:"'Bebas Neue'",fontSize:18,color:as>hs?'var(--lm)':'var(--dm)'}}>{as}</span></div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:7,marginTop:4}}><div style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer'}} onClick={()=>goT(h)}><Logo ab={h} sz={20}/><span style={{fontWeight:hs>as?800:400}}>{h}</span></div><span style={{fontFamily:"'Bebas Neue'",fontSize:18,color:hs>as?'var(--lm)':'var(--dm)'}}>{hs}</span></div>
  </div>
);

const Brackets = ({goT}) => {
  const[yr,setYr]=useState(2024);const b=BK[yr];if(!b)return null;
  const rn = r=>r==="WC"?"Wild Card":r==="DIV"?"Divisional":"Championship";
  return <div className="fu" style={{padding:'24px 24px'}}>
    <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:16,marginBottom:16}}>
      <h2 style={{fontFamily:"'Bebas Neue'",fontSize:24,letterSpacing:1,marginBottom:10}}>PLAYOFF BRACKETS</h2>
      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{Object.keys(BK).sort((a,b)=>+b-+a).map(y=><button key={y} onClick={()=>setYr(+y)} style={{padding:'6px 14px',borderRadius:7,border:'none',background:yr===+y?'var(--em)':'rgba(255,255,255,.05)',color:yr===+y?'#000':'var(--tx)',fontWeight:yr===+y?800:500,fontSize:14,cursor:'pointer'}}>{y}</button>)}</div>
    </div>
    <div style={{background:'var(--s1)',border:'1px solid rgba(245,158,11,.2)',borderRadius:16,padding:18,marginBottom:16,textAlign:'center'}}>
      <Pil ch={`SUPER BOWL • ${yr} SEASON`} c="var(--gd)" s={{marginBottom:12,display:'inline-flex'}}/>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:18,marginBottom:8}}>
        <div style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}} onClick={()=>goT(b.sb.a)}><Logo ab={b.sb.a} sz={46}/><span style={{fontFamily:"'Bebas Neue'",fontSize:42,color:b.sb.as>b.sb.hs?'var(--lm)':'var(--tx)'}}>{b.sb.as}</span></div>
        <span style={{color:'var(--dm)',fontSize:15}}>vs</span>
        <div style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}} onClick={()=>goT(b.sb.h)}><span style={{fontFamily:"'Bebas Neue'",fontSize:42,color:b.sb.hs>b.sb.as?'var(--lm)':'var(--tx)'}}>{b.sb.hs}</span><Logo ab={b.sb.h} sz={46}/></div>
      </div>
      {b.sb.mvp&&<Pil ch={`MVP: ${b.sb.mvp}`} c="var(--lm)"/>}
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
      {[{l:"AFC",d:b.afc,c:"var(--rs)"},{l:"NFC",d:b.nfc,c:"var(--sk)"}].map(conf=>(
        <div key={conf.l} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:16}}>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:1,marginBottom:12,color:conf.c}}>{conf.l} BRACKET</div>
          {conf.d?.map((rd,ri)=><div key={ri} style={{marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--dm)',fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:8,fontFamily:"'Exo 2',sans-serif"}}>{rn(rd.rd)}</div>
            <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>{rd.m.map((g,gi)=><BG key={gi} a={g.a} h={g.h} as={g.as} hs={g.hs} goT={goT}/>)}</div>
          </div>)}
        </div>
      ))}
    </div>
  </div>;
};

// ═══════════════════════════════════════════════════════════════
//  PREDICTIONS — multi-factor model using historical + roster data
// ═══════════════════════════════════════════════════════════════

// Build historical team scores from bracket data (2017-2024)
function buildHistoricalScores() {
  const scores = {};
  for (const ab of ALL_AB) scores[ab] = { playoffApps: 0, sbApps: 0, sbWins: 0, deepRuns: 0, recentScore: 0 };
  for (const [y, b] of Object.entries(BK)) {
    const yr = +y;
    const recency = yr >= 2023 ? 3 : yr >= 2021 ? 2 : 1;
    const allTeams = new Set();
    for (const conf of [b.afc, b.nfc]) {
      for (const rd of conf) {
        for (const m of rd.m) {
          allTeams.add(m.a); allTeams.add(m.h);
          const winner = m.as > m.hs ? m.a : m.h;
          if (rd.rd === "CC" && scores[winner]) scores[winner].deepRuns += recency;
        }
      }
    }
    for (const ab of allTeams) {
      if (!scores[ab]) continue;
      scores[ab].playoffApps += recency;
      scores[ab].recentScore += recency;
    }
    const sbWinner = b.sb.as > b.sb.hs ? b.sb.a : b.sb.h;
    const sbLoser  = b.sb.as > b.sb.hs ? b.sb.h : b.sb.a;
    if (scores[sbWinner]) { scores[sbWinner].sbWins += recency * 2; scores[sbWinner].sbApps += recency; }
    if (scores[sbLoser])    scores[sbLoser].sbApps  += recency;
  }
  return scores;
}
const HIST = buildHistoricalScores();

// Weighted recent fantasy-point score for a position group
function posGroupScore(roster, statsCache, pos, topN) {
  const fpts = roster
    .filter(p => p.pos === pos)
    .map(p => {
      const st = statsCache[p.id];
      if (!st) return 0;
      const yrs = Object.keys(st).sort((a, b) => +b - +a).slice(0, 3);
      if (!yrs.length) return 0;
      const weights = [2, 1, 0.5];
      let total = 0, wt = 0;
      for (let i = 0; i < yrs.length; i++) {
        total += (st[yrs[i]]?.fpts || 0) * weights[i];
        wt += weights[i];
      }
      return wt > 0 ? total / wt : 0;
    })
    .sort((a, b) => b - a)
    .slice(0, topN);
  return fpts.reduce((s, v) => s + v, 0) / (topN * 200); // 0–1
}

function calcPreds(players, statsCache, standings24, standings25) {
  const histVals = ALL_AB.map(ab => { const h = HIST[ab]||{}; return (h.recentScore||0)+(h.sbWins||0)+(h.deepRuns||0); });
  const maxHist = histVals.length ? Math.max(...histVals) : 1;

  // First pass — compute scores and win projections
  const items = ALL_AB.map(ab => {
    const roster  = players.filter(p => p.tm === ab);
    const h       = HIST[ab] || {};
    const stand24 = standings24[ab] || null;
    const stand25 = standings25[ab] || null;

    // Historical score 0–10
    const rawHist = (h.recentScore||0) + (h.sbWins||0) + (h.deepRuns||0);
    const histScore = maxHist > 0 ? (rawHist / maxHist) * 10 : 0;

    // Roster quality 0–10
    const hasStats  = roster.some(p => statsCache[p.id] && Object.keys(statsCache[p.id]).length > 0);
    const qbScore   = posGroupScore(roster, statsCache, "QB", 1) * 10;
    const rbScore   = posGroupScore(roster, statsCache, "RB", 2) * 10;
    const wrScore   = posGroupScore(roster, statsCache, "WR", 3) * 10;
    const teScore   = posGroupScore(roster, statsCache, "TE", 1) * 10;
    const rosterScore = hasStats
      ? (qbScore * 0.35 + rbScore * 0.2 + wrScore * 0.3 + teScore * 0.15)
      : Math.min(10, roster.length * 0.65);

    // Actual wins from standings (prefer 2025, fall back to 2024)
    const actualW24 = stand24 ? stand24.wins : null;
    const actualW25 = stand25 ? stand25.wins : null;

    // Combined score 0–10 (history 35%, roster 45%, last-season record 20%)
    const recScore = actualW25 !== null ? (actualW25 / 17) * 10
                   : actualW24 !== null ? (actualW24 / 17) * 10
                   : histScore;
    const score = histScore * 0.35 + rosterScore * 0.45 + recScore * 0.20;

    // Mean-reversion projections — top teams regress, bottom teams improve each year
    // NFL long-run average ≈ 8.5 wins; deviation shrinks ~30% per season
    const NFL_MEAN  = 8.5;
    const anchor    = actualW25 !== null ? actualW25
                    : actualW24 !== null ? actualW24
                    : 4 + score * 1.1;
    const deviation = anchor - NFL_MEAN;
    const rosterAdj = (score - 5) * 0.3; // -1.5 to +1.5 based on roster quality
    const p26 = Math.round(Math.min(16, Math.max(2, NFL_MEAN + deviation * 0.72 + rosterAdj)));
    const p27 = Math.round(Math.min(15, Math.max(3, NFL_MEAN + deviation * 0.48 + rosterAdj * 0.7)));
    const p28 = Math.round(Math.min(14, Math.max(3, NFL_MEAN + deviation * 0.30 + rosterAdj * 0.5)));

    const sbOdds = Math.round(Math.max(1, Math.min(35, score * score * 0.35)));

    return {
      ab, score: +score.toFixed(1),
      histScore: +histScore.toFixed(1), rosterScore: +rosterScore.toFixed(1),
      qbScore: +qbScore.toFixed(1), rbScore: +rbScore.toFixed(1),
      wrScore: +wrScore.toFixed(1), teScore: +teScore.toFixed(1),
      actualW24, actualW25, p26, p27, p28, sbOdds, hasStats,
    };
  });

  // Second pass — assign tiers by rank for a realistic NFL distribution:
  // top 8 = Contender (legit SB threats), next 8 = Playoff (wild-card range),
  // next 10 = Rebuild, bottom 6 = Bottom
  const ranked = [...items].sort((a, b) => b.score - a.score);
  const tierMap = {};
  ranked.forEach((t, i) => {
    tierMap[t.ab] = i < 8 ? "Contender" : i < 16 ? "Playoff" : i < 26 ? "Rebuild" : "Bottom";
  });

  return items.map(t => ({ ...t, tier: tierMap[t.ab] }));
}

const Predictions = ({goT, players, statsCache, setStatsCache}) => {
  const [yearTab,     setYearTab]    = useState("2026");
  const [standings24, setStandings24] = useState({});
  const [standings25, setStandings25] = useState({});
  const [fetching,    setFetching]   = useState(false);
  const [fetchDone,   setFetchDone]  = useState(false);
  const [progress,    setProgress]   = useState(0);
  const [showCheat,   setShowCheat]  = useState(false);

  // Fetch real 2024 + 2025 standings from ESPN on mount
  useEffect(() => {
    const parse = (d) => {
      if (!d) return {};
      const map = {};
      const extract = (entries) => {
        for (const e of (entries||[])) {
          const ab  = e.team?.abbreviation;
          const stats = e.stats || [];
          const wStat = stats.find(s => s.name === "wins" || s.abbreviation === "W");
          const lStat = stats.find(s => s.name === "losses" || s.abbreviation === "L");
          if (ab && wStat) map[ab] = { wins: +wStat.value || 0, losses: +(lStat?.value||0) };
        }
      };
      if (d?.standings?.entries) extract(d.standings.entries);
      if (d?.children) for (const ch of d.children) {
        if (ch.standings?.entries) extract(ch.standings.entries);
        if (ch.children) for (const cc of ch.children) extract(cc.standings?.entries || []);
      }
      return map;
    };
    Promise.all([
      espn(`${SITE}/standings?season=2024`),
      espn(`${SITE}/standings?season=2025`),
    ]).then(([d24, d25]) => {
      setStandings24(parse(d24));
      setStandings25(parse(d25));
    });
  }, []);

  // Auto-fetch stats for QB+top RB+top WR of every team
  useEffect(() => {
    if (fetchDone || players.length === 0) return;
    setFetching(true);
    const keyPlayers = [];
    for (const ab of ALL_AB) {
      const roster = players.filter(p => p.tm === ab);
      const qb = roster.filter(p => p.pos === "QB")[0];
      const wrs = roster.filter(p => p.pos === "WR").slice(0, 2);
      const rb  = roster.filter(p => p.pos === "RB")[0];
      const te  = roster.filter(p => p.pos === "TE")[0];
      for (const p of [qb, ...wrs, rb, te]) {
        if (p && !statsCache[p.id]) keyPlayers.push(p);
      }
    }
    let done = 0;
    const total = keyPlayers.length;
    if (total === 0) { setFetching(false); setFetchDone(true); return; }

    const runBatch = async (batch) => {
      await Promise.allSettled(batch.map(p =>
        fetchPlayerStats(p.id).then(data => {
          setStatsCache(prev => ({...prev, [p.id]: data || {}}));
          done++;
          setProgress(Math.round((done / total) * 100));
        }).catch(() => {
          done++;
          setProgress(Math.round((done / total) * 100));
        })
      ));
    };

    (async () => {
      for (let i = 0; i < keyPlayers.length; i += 20) {
        await runBatch(keyPlayers.slice(i, i + 20));
      }
      setFetching(false);
      setFetchDone(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, fetchDone]);

  const preds  = useMemo(() => calcPreds(players, statsCache, standings24, standings25), [players, statsCache, standings24, standings25]);
  const sorted = useMemo(() => {
    const c = [...preds];
    if (yearTab === "2026") return c.sort((a,b) => b.p26 - a.p26);
    if (yearTab === "2027") return c.sort((a,b) => b.p27 - a.p27);
    return c.sort((a,b) => b.p28 - a.p28);
  }, [preds, yearTab]);

  const tc = {Contender:"var(--lm)", Playoff:"var(--gd)", Rebuild:"var(--em)", Bottom:"var(--rs)"};
  const hasStandings = Object.keys(standings24).length > 0 || Object.keys(standings25).length > 0;
  const has25 = Object.keys(standings25).length > 0;

  const ScoreBar = ({val, max=10, color="var(--em)"}) => (
    <div style={{display:'flex', alignItems:'center', gap:7}}>
      <div style={{flex:1, height:6, background:'rgba(255,255,255,.06)', borderRadius:99, overflow:'hidden'}}>
        <div style={{width:`${Math.min(100,(val/max)*100)}%`, height:'100%', background:color, borderRadius:99, transition:'width .5s'}}/>
      </div>
      <span style={{fontSize:11, color:'var(--dm)', minWidth:24, textAlign:'right'}}>{val}</span>
    </div>
  );

  return <div className="fu" style={{padding:'24px 24px'}}>

    {/* Header */}
    <div style={{background:'var(--s1)', border:'1px solid var(--bd)', borderRadius:14, padding:18, marginBottom:16}}>
      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12}}>
        <div>
          <h2 style={{fontFamily:"'Bebas Neue'", fontSize:26, letterSpacing:1, marginBottom:5}}>NFL WIN PROJECTIONS</h2>
          <p style={{color:'var(--dm)', fontSize:14, maxWidth:600, lineHeight:1.6}}>
            <span style={{color:'var(--vi)'}}>35%</span> history · <span style={{color:'var(--sk)'}}>45%</span> roster · <span style={{color:'var(--lm)'}}>20%</span> {has25?"2025":"2024"} record{hasStandings ? " ✓" : " (loading…)"}.
            Mean-reversion applied — top teams trend down, rebuilds trend up.
          </p>
        </div>
        {/* Season tabs + cheat-sheet info icon */}
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <div style={{display:'flex', gap:4}}>
            {[["2026","26–27"],["2027","27–28"],["2028","28–29"]].map(([yr,label])=>(
              <button key={yr} onClick={()=>setYearTab(yr)} style={{
                padding:'8px 20px', borderRadius:8, border:'none',
                background: yearTab===yr ? 'var(--em)' : 'rgba(255,255,255,.05)',
                color: yearTab===yr ? '#000' : 'var(--dm)',
                fontFamily:"'Bebas Neue'", fontSize:17, letterSpacing:1.5,
                cursor:'pointer', fontWeight: yearTab===yr ? 900 : 500, transition:'all .15s'}}>
                {label}
              </button>
            ))}
          </div>
          {/* ℹ cheat-sheet tooltip */}
          <div style={{position:'relative'}} onMouseEnter={()=>setShowCheat(true)} onMouseLeave={()=>setShowCheat(false)}>
            <button style={{width:30, height:30, borderRadius:'50%', border:'1px solid var(--sk)',
              background:'rgba(129,140,248,.08)', color:'var(--sk)', fontSize:15, fontWeight:900,
              cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1}}>
              ℹ
            </button>
            {showCheat && (
              <div style={{position:'absolute', top:36, right:0, zIndex:200, width:300,
                background:'rgba(7,8,13,.98)', border:'1px solid rgba(129,140,248,.25)',
                borderRadius:14, padding:16, boxShadow:'0 8px 40px rgba(0,0,0,.7)', pointerEvents:'none'}}>
                <div style={{fontFamily:"'Bebas Neue'", fontSize:16, letterSpacing:1.5, color:'var(--em)', marginBottom:12}}>
                  📊 SCORING CHEAT SHEET
                </div>
                {[
                  {l:"SCORE (0–10)",    c:"var(--em)", d:"Blended rating: 35% playoff history + 45% roster quality + 20% last season record"},
                  {l:"HISTORY",         c:"var(--vi)", d:"2017–24 playoff runs, conf. championship & SB wins — recent seasons weighted up to 3×"},
                  {l:"ROSTER",          c:"var(--sk)", d:"Fantasy PPR averages for key starters: QB 35% · WR 30% · RB 20% · TE 15%"},
                  {l:"QB / WR / RB",    c:"var(--gd)", d:"Per-position scores out of 10, based on each player's own 3-year weighted PPR average"},
                  {l:"TIERS",           c:"var(--lm)", d:"Top 8 → Contender · 9–16 → Playoff · 17–26 → Rebuild · 27–32 → Bottom"},
                  {l:"WIN PROJECTIONS", c:"var(--tx)", d:"NFL mean-reversion model anchored on 2025 record — 14-win teams trend down, 4-win teams trend up"},
                  {l:"SB %",            c:"var(--gd)", d:"Relative Super Bowl odds based on overall score — not an absolute probability"},
                ].map(item=>(
                  <div key={item.l} style={{marginBottom:9}}>
                    <div style={{color:item.c, fontSize:10, fontWeight:700, fontFamily:"'Exo 2',sans-serif", letterSpacing:.8, marginBottom:1}}>{item.l}</div>
                    <div style={{color:'var(--dm)', fontSize:12, lineHeight:1.45}}>{item.d}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {fetching && (
        <div style={{marginTop:14}}>
          <div style={{display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--dm)', marginBottom:5}}>
            <span>Fetching player stats to power predictions…</span>
            <span>{progress}%</span>
          </div>
          <div style={{height:5, background:'rgba(255,255,255,.06)', borderRadius:99, overflow:'hidden'}}>
            <div style={{width:`${progress}%`, height:'100%', background:'linear-gradient(90deg,var(--em),var(--gd))', borderRadius:99, transition:'width .3s'}}/>
          </div>
        </div>
      )}
    </div>

    {/* Tier summary cards */}
    <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16}}>
      {["Contender","Playoff","Rebuild","Bottom"].map(tier => {
        const tms = sorted.filter(p => p.tier === tier);
        return <div key={tier} style={{background:'var(--s1)', border:'1px solid var(--bd)', borderRadius:14, padding:14, borderTop:`3px solid ${tc[tier]}`}}>
          <div style={{fontSize:11, color:tc[tier], fontWeight:700, textTransform:'uppercase', letterSpacing:1}}>{tier}</div>
          <div style={{fontFamily:"'Bebas Neue'", fontSize:32, marginTop:3, marginBottom:8, color:tc[tier]}}>{tms.length}</div>
          <div style={{display:'flex', flexWrap:'wrap', gap:4}}>{tms.map(t => <Logo key={t.ab} ab={t.ab} sz={26} onClick={()=>goT(t.ab)}/>)}</div>
        </div>;
      })}
    </div>

    {/* Main table */}
    <div style={{background:'var(--s1)', border:'1px solid var(--bd)', borderRadius:14, overflow:'hidden'}}>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
          <thead>
            <tr style={{borderBottom:'2px solid var(--bd)', background:'rgba(0,0,0,.25)'}}>
              <th style={{...th, width:32}}>#</th>
              <th style={th}>Team</th>
              <th style={th}>Tier</th>
              <th style={{...th, width:130}}>Score</th>
              <th style={{...th, width:110}}>History</th>
              <th style={{...th, width:110}}>Roster</th>
              <th style={{...th, width:110}}>QB / WR / RB</th>
              <th style={{...th, width:62, textAlign:'center'}}>{has25 ? "2025 W" : "Last W"}</th>
              <th style={{...th, width:62, textAlign:'center', color: yearTab==="2026"?'var(--em)':'var(--dm)', borderBottom: yearTab==="2026"?'2px solid var(--em)':'none'}}>2026</th>
              <th style={{...th, width:62, textAlign:'center', color: yearTab==="2027"?'var(--em)':'var(--dm)', borderBottom: yearTab==="2027"?'2px solid var(--em)':'none'}}>2027</th>
              <th style={{...th, width:62, textAlign:'center', color: yearTab==="2028"?'var(--em)':'var(--dm)', borderBottom: yearTab==="2028"?'2px solid var(--em)':'none'}}>2028</th>
              <th style={{...th, width:56, textAlign:'center'}}>SB %</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const teamColor = TM[p.ab]?.c1 || 'var(--em)';
              return (
                <tr key={p.ab} onClick={()=>goT(p.ab)}
                  style={{borderBottom:'1px solid var(--bd)', cursor:'pointer', transition:'background .1s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.025)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>

                  <td style={{...td, color:'var(--dm)', fontWeight:700, fontSize:12}}>{i+1}</td>

                  <td style={td}>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <Logo ab={p.ab} sz={30}/>
                      <div>
                        <div style={{fontWeight:800, fontSize:14}}>{p.ab}</div>
                        <div style={{color:'var(--dm)', fontSize:11, whiteSpace:'nowrap'}}>{TM[p.ab]?.c} {TM[p.ab]?.n}</div>
                      </div>
                    </div>
                  </td>

                  <td style={td}><Pil ch={p.tier} c={tc[p.tier]}/></td>

                  <td style={td}><ScoreBar val={p.score} color={teamColor}/></td>
                  <td style={td}><ScoreBar val={p.histScore} color="var(--vi)"/></td>
                  <td style={td}><ScoreBar val={p.rosterScore} color="var(--sk)"/></td>

                  <td style={td}>
                    <div style={{display:'flex', flexDirection:'column', gap:4, minWidth:90}}>
                      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(0,196,255,.12)', border:'1px solid rgba(0,196,255,.25)', borderRadius:6, padding:'3px 8px'}}>
                        <span style={{color:'var(--em)', fontSize:11, fontWeight:700, fontFamily:"'Exo 2',sans-serif", letterSpacing:.5}}>QB</span>
                        <span style={{color:'var(--em)', fontSize:13, fontWeight:900, fontFamily:"'Bebas Neue'", letterSpacing:.5}}>{p.qbScore}</span>
                      </div>
                      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(129,140,248,.12)', border:'1px solid rgba(129,140,248,.25)', borderRadius:6, padding:'3px 8px'}}>
                        <span style={{color:'var(--sk)', fontSize:11, fontWeight:700, fontFamily:"'Exo 2',sans-serif", letterSpacing:.5}}>WR</span>
                        <span style={{color:'var(--sk)', fontSize:13, fontWeight:900, fontFamily:"'Bebas Neue'", letterSpacing:.5}}>{p.wrScore}</span>
                      </div>
                      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(0,224,155,.12)', border:'1px solid rgba(0,224,155,.25)', borderRadius:6, padding:'3px 8px'}}>
                        <span style={{color:'var(--lm)', fontSize:11, fontWeight:700, fontFamily:"'Exo 2',sans-serif", letterSpacing:.5}}>RB</span>
                        <span style={{color:'var(--lm)', fontSize:13, fontWeight:900, fontFamily:"'Bebas Neue'", letterSpacing:.5}}>{p.rbScore}</span>
                      </div>
                    </div>
                  </td>

                  {/* Last season actual record (2025 if loaded, else 2024) */}
                  <td style={{...td, textAlign:'center'}}>
                    {p.actualW25 !== null
                      ? <span style={{fontFamily:"'Bebas Neue'", fontSize:18, color: p.actualW25>=10?'var(--lm)':p.actualW25>=7?'var(--gd)':'var(--rs)'}}>{p.actualW25}-{standings25[p.ab]?.losses??""}</span>
                      : p.actualW24 !== null
                        ? <span style={{fontFamily:"'Bebas Neue'", fontSize:18, color: p.actualW24>=10?'var(--lm)':p.actualW24>=7?'var(--gd)':'var(--rs)'}}>{p.actualW24}-{standings24[p.ab]?.losses??""}</span>
                        : <span style={{color:'var(--dm)', fontSize:12}}>—</span>}
                  </td>

                  {/* Projected wins — active year highlighted in orange */}
                  <td style={{...td, textAlign:'center', fontFamily:"'Bebas Neue'",
                    fontSize: yearTab==="2026" ? 22 : 15, fontWeight:900,
                    color: yearTab==="2026" ? 'var(--em)' : 'rgba(232,236,248,.28)'}}>{p.p26}</td>
                  <td style={{...td, textAlign:'center', fontFamily:"'Bebas Neue'",
                    fontSize: yearTab==="2027" ? 22 : 15, fontWeight:900,
                    color: yearTab==="2027" ? 'var(--em)' : 'rgba(232,236,248,.28)'}}>{p.p27}</td>
                  <td style={{...td, textAlign:'center', fontFamily:"'Bebas Neue'",
                    fontSize: yearTab==="2028" ? 22 : 15, fontWeight:900,
                    color: yearTab==="2028" ? 'var(--em)' : 'rgba(232,236,248,.28)'}}>{p.p28}</td>

                  {/* SB donut */}
                  <td style={{...td, textAlign:'center'}}>
                    <div style={{display:'inline-flex', alignItems:'center', justifyContent:'center', width:36, height:36, borderRadius:'50%', background:`conic-gradient(var(--gd) ${p.sbOdds*3.6}deg, rgba(255,255,255,.06) 0)`, position:'relative'}}>
                      <div style={{position:'absolute', inset:4, borderRadius:'50%', background:'var(--s1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:800, color:'var(--gd)'}}>{p.sbOdds}%</div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

    <div style={{marginTop:12, color:'var(--dm)', fontSize:12, padding:'0 4px', lineHeight:1.7}}>
      * Hover ℹ for full scoring cheat sheet · History: 2017–2024 playoff results (recency-weighted) · Roster: top-player fantasy PPR averages · {has25 ? "2025" : "2024"} record from ESPN standings · SB % is relative, not absolute.
    </div>
  </div>;
};

// ═══════════════════════════════════════════════════════════════
//  EDGE BOARD — Market Inefficiency Engine
// ═══════════════════════════════════════════════════════════════
const EdgeBoard = ({ players, statsCache, setStatsCache, goP, sleeperMap, espnMap, extLoading }) => {
  const [strategy,    setStrategy]    = useState("safety");
  const [fetchDone,   setFetchDone]   = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [posFilter,   setPosFilter]   = useState("ALL");
  const [activeSection, setActiveSection] = useState("undervalued");

  useEffect(() => {
    if (fetchDone || players.length === 0) return;
    const needed = players.filter(p => !statsCache[p.id]);
    if (!needed.length) { setFetchDone(true); return; }
    let done = 0;
    (async () => {
      for (let i = 0; i < needed.length; i += 20) {
        await Promise.allSettled(needed.slice(i, i + 20).map(p =>
          fetchPlayerStats(p.id).then(data => {
            setStatsCache(prev => ({ ...prev, [p.id]: data || {} }));
            done++;
            setProgress(Math.round((done / needed.length) * 100));
          }).catch(() => { done++; })
        ));
      }
      setFetchDone(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, fetchDone]);

  const isLoading = !fetchDone || extLoading;

  const exploited = useMemo(() => {
    if (isLoading || !players.length) return [];
    const ranked  = rankPlayers(players, statsCache);
    const enriched = enrichWithExternalRanks(ranked, sleeperMap, espnMap);
    const withExploit = runExploitEngine(enriched, statsCache, strategy);
    return posFilter === "ALL" ? withExploit : withExploit.filter(p => p.pos === posFilter);
  }, [players, statsCache, sleeperMap, espnMap, strategy, posFilter, isLoading]);

  const undervalued = useMemo(() =>
    [...exploited].filter(p => p.exploitAdjusted > 0).sort((a,b) => b.exploitAdjusted - a.exploitAdjusted).slice(0, 10),
    [exploited]);
  const overpriced = useMemo(() =>
    [...exploited].filter(p => p.exploitAdjusted < 0).sort((a,b) => a.exploitAdjusted - b.exploitAdjusted).slice(0, 10),
    [exploited]);
  const boomCands = useMemo(() =>
    [...exploited].filter(p => p.cvs > 0.52 && p.exploitAdjusted > 0).sort((a,b) => b.cvs - a.cvs).slice(0, 10),
    [exploited]);
  const safeFloor = useMemo(() =>
    [...exploited].filter(p => p.stabilityFactor > 0.65 && p.exploitAdjusted > 0).sort((a,b) => b.stabilityFactor - a.stabilityFactor).slice(0, 10),
    [exploited]);

  const exploitColor = v => v >= 3 ? "#00E09B" : v >= 1 ? "#00C4FF" : v >= 0 ? "#FFBA00" : v >= -2 ? "#FF8C00" : "#FF3D5A";
  const volLabel = v => v < 0.25 ? { txt: "STABLE", c: "#00E09B" } : v < 0.50 ? { txt: "MODERATE", c: "#FFBA00" } : { txt: "VOLATILE", c: "#FF3D5A" };
  const trendLabel = v => v >= 0.10 ? { txt: "▲ RISING", c: "#00E09B" } : v <= -0.10 ? { txt: "▼ FALLING", c: "#FF3D5A" } : { txt: "→ FLAT", c: "var(--dm)" };
  const posColor = { QB: "#00C4FF", RB: "#00E09B", WR: "#818CF8", TE: "#C084FC", K: "#FFBA00" };

  const sections = [
    { id: "undervalued", label: "UNDERVALUED",  count: undervalued.length, accent: "#00E09B", data: undervalued },
    { id: "overpriced",  label: "OVERPRICED",   count: overpriced.length,  accent: "#FF3D5A", data: overpriced  },
    { id: "boom",        label: "BOOM PLAYS",   count: boomCands.length,   accent: "#FFBA00", data: boomCands   },
    { id: "safe",        label: "SAFE FLOOR",   count: safeFloor.length,   accent: "#818CF8", data: safeFloor   },
  ];

  const activeData = sections.find(s => s.id === activeSection);

  const ExploitRow = ({ p, idx, accent }) => {
    const vl = volLabel(p.volatility);
    const tl = trendLabel(p.opportunityTrend);
    const marketRank = p.sleeperRank ?? p.espnRank ?? null;
    return (
      <tr
        onClick={() => goP && goP(p.id)}
        style={{ cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,.04)', transition: 'background .15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.04)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <td style={{ padding: '8px 10px', color: 'var(--dm)', fontSize: 12, width: 30 }}>{idx + 1}</td>
        <td style={{ padding: '8px 4px' }}>
          <img src={HEAD(p.id)} alt="" style={{ width: 30, height: 22, objectFit: 'cover', borderRadius: 4, opacity: .85 }} onError={e => e.target.style.display='none'}/>
        </td>
        <td style={{ padding: '8px 10px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx)', lineHeight: 1.2 }}>{p.nm}</div>
          <div style={{ fontSize: 10, color: 'var(--dm)', marginTop: 1 }}>{p.tm}</div>
        </td>
        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
          <span style={{ background: posColor[p.pos] + '22', color: posColor[p.pos], border: `1px solid ${posColor[p.pos]}44`, borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700, fontFamily: "'Exo 2',sans-serif" }}>
            {p.pos}
          </span>
        </td>
        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Bebas Neue'", fontSize: 22, color: exploitColor(p.exploitAdjusted), lineHeight: 1 }}>
            {p.exploitAdjusted > 0 ? '+' : ''}{p.exploitAdjusted}
          </div>
          <div style={{ fontSize: 9, color: 'var(--dm)', marginTop: 1 }}>ADJUSTED</div>
        </td>
        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Bebas Neue'", fontSize: 18, color: exploitColor(p.exploitScore), lineHeight: 1 }}>
            {p.exploitScore > 0 ? '+' : ''}{p.exploitScore}
          </div>
          <div style={{ fontSize: 9, color: 'var(--dm)', marginTop: 1 }}>RAW</div>
        </td>
        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: vl.c, fontFamily: "'Exo 2',sans-serif" }}>{vl.txt}</span>
          <div style={{ marginTop: 2, height: 3, background: 'rgba(255,255,255,.08)', borderRadius: 99, width: 60 }}>
            <div style={{ width: `${p.volatility * 100}%`, height: '100%', background: vl.c, borderRadius: 99 }}/>
          </div>
        </td>
        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: tl.c, fontFamily: "'Exo 2',sans-serif" }}>{tl.txt}</span>
        </td>
        <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: "'Bebas Neue'", fontSize: 16, color: 'var(--tx)' }}>
          {p.projection}
        </td>
        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
          {marketRank
            ? <span style={{ fontFamily: "'Bebas Neue'", fontSize: 15, color: '#C084FC' }}>#{marketRank}</span>
            : <span style={{ color: 'var(--dm)', fontSize: 11 }}>—</span>}
        </td>
        <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: "'Bebas Neue'", fontSize: 15, color: 'var(--dm)' }}>
          {p.marketImpliedPts ?? '—'}
        </td>
      </tr>
    );
  };

  const th = { padding: '8px 10px', fontSize: 9, fontFamily: "'Exo 2',sans-serif", letterSpacing: 1, fontWeight: 700, color: 'var(--dm)', textAlign: 'center', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,.07)', whiteSpace: 'nowrap' };

  const statsRow = [
    { label: "TOTAL ANALYZED", val: exploited.length, c: 'var(--em)' },
    { label: "UNDERVALUED",    val: exploited.filter(p => p.exploitAdjusted > 1).length,  c: '#00E09B' },
    { label: "OVERPRICED",     val: exploited.filter(p => p.exploitAdjusted < -1).length, c: '#FF3D5A' },
    { label: "AVG VALUE DELTA",val: exploited.length ? (exploited.reduce((s, p) => s + (p.valueDelta||0), 0) / exploited.length).toFixed(1) : '—', c: 'var(--sk)' },
    { label: "MARKET SOURCE",  val: sleeperMap.size > 0 ? `${Math.round(sleeperMap.size/2)} ADP` : '—', c: '#C084FC' },
  ];

  return (
    <div className="fu" style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: 34, letterSpacing: 2, margin: 0, lineHeight: 1 }}>EDGE BOARD</h1>
            <div style={{ fontSize: 12, color: 'var(--dm)', marginTop: 4, fontFamily: "'Exo 2',sans-serif", letterSpacing: .5 }}>
              Market Inefficiency Engine · ExploitScore = ValueDelta × Stability × (1 + OpportunityTrend)
            </div>
          </div>
          {/* Strategy toggle */}
          <div style={{ display: 'flex', gap: 6, padding: '4px', background: 'rgba(255,255,255,.05)', borderRadius: 8, border: '1px solid var(--bd)' }}>
            {[['safety', 'SAFETY MODE', '#818CF8'], ['upside', 'UPSIDE MODE', '#FFBA00']].map(([s, label, c]) => (
              <button key={s} onClick={() => setStrategy(s)} style={{
                padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11,
                fontFamily: "'Exo 2',sans-serif", letterSpacing: 1, fontWeight: 700,
                background: strategy === s ? c : 'transparent', color: strategy === s ? '#fff' : 'var(--dm)',
                transition: 'all .2s',
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Position filter */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {["ALL","QB","RB","WR","TE","K"].map(p => (
            <button key={p} onClick={() => setPosFilter(p)} style={{
              padding: '5px 14px', borderRadius: 99, border: `1px solid ${posFilter===p ? (posColor[p]||'var(--em)') : 'var(--bd)'}`,
              background: posFilter===p ? (posColor[p]||'var(--em)')+'22' : 'transparent',
              color: posFilter===p ? (posColor[p]||'var(--em)') : 'var(--dm)',
              fontSize: 12, fontFamily: "'Exo 2',sans-serif", fontWeight: 700, cursor: 'pointer', letterSpacing: .5,
            }}>{p}</button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--dm)', alignSelf: 'center' }}>
            {isLoading
              ? `Loading stats... ${progress}%`
              : `${exploited.length} players analyzed · ${extLoading ? 'loading ADP...' : sleeperMap.size > 0 ? `${Math.round(sleeperMap.size/2)} Sleeper + ${espnMap.size > 0 ? espnMap.size + ' ESPN' : 'ESPN loading...'} ranks` : 'ADP loading...'}`}
          </span>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          {statsRow.map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--bd)', borderRadius: 10, padding: '10px 16px', flex: '1 1 120px' }}>
              <div style={{ fontSize: 9, color: 'var(--dm)', fontFamily: "'Exo 2',sans-serif", letterSpacing: 1, marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: 26, color: s.c, lineHeight: 1 }}>{s.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
            padding: '8px 18px', borderRadius: 8, border: `1px solid ${activeSection===s.id ? s.accent : 'var(--bd)'}`,
            background: activeSection===s.id ? s.accent+'18' : 'rgba(255,255,255,.03)',
            color: activeSection===s.id ? s.accent : 'var(--dm)',
            fontFamily: "'Exo 2',sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: .8, cursor: 'pointer',
            transition: 'all .2s',
          }}>
            {s.label}
            <span style={{ marginLeft: 7, background: s.accent+'33', color: s.accent, borderRadius: 99, padding: '1px 7px', fontSize: 11 }}>
              {s.count}
            </span>
          </button>
        ))}
      </div>

      {/* Active section description */}
      {activeData && (
        <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--dm)', fontFamily: "'Exo 2',sans-serif", letterSpacing: .3 }}>
          {activeData.id === 'undervalued' && 'Players where our model projects significantly more than the market implies — prime targets to roster or buy.'}
          {activeData.id === 'overpriced'  && 'Players where the market overvalues them relative to our model — candidates to sell high or fade in drafts.'}
          {activeData.id === 'boom'        && 'High context-volatility players (CVS > 0.52) with positive exploit scores — ideal for tournament lineups.'}
          {activeData.id === 'safe'        && 'Consistent, stable players (StabilityFactor > 0.65) with positive exploit scores — ideal for cash game floors.'}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--dm)', fontFamily: "'Exo 2',sans-serif", fontSize: 16, letterSpacing: 1 }}>
          LOADING STATS... {progress}%
          <div style={{ width: 240, height: 4, background: 'rgba(255,255,255,.07)', borderRadius: 99, margin: '12px auto 0' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'var(--em)', borderRadius: 99, transition: 'width .3s' }}/>
          </div>
        </div>
      ) : activeData?.data.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dm)', fontFamily: "'Exo 2',sans-serif", fontSize: 15 }}>
          No players match this filter
        </div>
      ) : (
        <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid var(--bd)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: activeData.accent }}/>
            <span style={{ fontFamily: "'Bebas Neue'", fontSize: 16, letterSpacing: 1, color: activeData.accent }}>
              TOP {activeData.data.length} {activeData.label}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--dm)', fontFamily: "'Exo 2',sans-serif" }}>
              {strategy === 'upside' ? 'UPSIDE MODE — boom/bust players boosted' : 'SAFETY MODE — consistent players preferred'}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,.03)' }}>
                  <th style={th}>#</th>
                  <th style={th}/>
                  <th style={{ ...th, textAlign: 'left' }}>PLAYER</th>
                  <th style={th}>POS</th>
                  <th style={{ ...th, color: activeData.accent }}>ADJ SCORE</th>
                  <th style={th}>RAW SCORE</th>
                  <th style={th}>VOLATILITY</th>
                  <th style={th}>OPP TREND</th>
                  <th style={th}>PROJECTION</th>
                  <th style={th}>MKT RANK</th>
                  <th style={th}>IMPLIED PTS</th>
                </tr>
              </thead>
              <tbody>
                {activeData.data.map((p, i) => (
                  <ExploitRow key={p.id} p={p} idx={i} accent={activeData.accent} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: 16, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 10, color: 'var(--dm)', fontFamily: "'Exo 2',sans-serif", letterSpacing: .5 }}>
        {[['ADJ SCORE', 'ExploitScore adjusted for strategy mode (Safety/Upside)'],
          ['RAW SCORE', 'ValueDelta × (0.6 + 0.4×Stability) × (1 + OpportunityTrend)'],
          ['MKT RANK', 'Sleeper ADP (primary) or ESPN Fantasy rank'],
          ['IMPLIED PTS', 'Market rank converted to expected PPR pts via log-regression'],
        ].map(([k, v]) => (
          <span key={k}><span style={{ color: 'var(--em)', fontWeight: 700 }}>{k}</span> — {v}</span>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
//  RANKINGS — Opportunity-first fantasy projection system
// ═══════════════════════════════════════════════════════════════
const SCORE_COLORS = { volume:'var(--em)', efficiency:'var(--sk)', trend:'var(--lm)', matchup:'var(--vi)' };

const Rankings = ({players, statsCache, setStatsCache, goT, goP, sleeperMap, espnMap, extLoading}) => {
  const [q,           setQ]           = useState("");
  const [posFilter,   setPosFilter]   = useState("ALL");
  const [sortKey,     setSortKey]     = useState("projection");
  const [expanded,    setExpanded]    = useState(null);
  const [fetching,    setFetching]    = useState(false);
  const [fetchDone,   setFetchDone]   = useState(false);
  const [progress,    setProgress]    = useState(0);

  // Auto-fetch stats for every offensive player in batches of 8
  useEffect(() => {
    if (fetchDone || players.length === 0) return;
    const needed = players.filter(p => !statsCache[p.id]);
    if (!needed.length) { setFetchDone(true); return; }
    setFetching(true);
    let done = 0;
    const total = needed.length;
    (async () => {
      for (let i = 0; i < needed.length; i += 20) {
        await Promise.allSettled(needed.slice(i, i + 20).map(p =>
          fetchPlayerStats(p.id).then(data => {
            setStatsCache(prev => ({...prev, [p.id]: data || {}}));
            done++;
            setProgress(Math.round((done / total) * 100));
          }).catch(() => { done++; setProgress(Math.round((done / total) * 100)); })
        ));
      }
      setFetching(false);
      setFetchDone(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, fetchDone]);

  const ranked = useMemo(() => rankPlayers(players, statsCache), [players, statsCache]);

  // Attach .sleeperRank and .espnRank to every projected player
  const enriched = useMemo(
    () => enrichWithExternalRanks(ranked, sleeperMap, espnMap),
    [ranked, sleeperMap, espnMap]
  );

  const displayed = useMemo(() => {
    let list = posFilter === "ALL" ? enriched : enriched.filter(p => p.pos === posFilter);
    if (q) {
      const lq = q.toLowerCase();
      list = list.filter(p => p.nm.toLowerCase().includes(lq) || p.tm.toLowerCase().includes(lq));
    }
    const fns = {
      projection:  (a,b) => b.projection - a.projection,
      volume:      (a,b) => b.volume - a.volume,
      efficiency:  (a,b) => b.efficiency - a.efficiency,
      trend:       (a,b) => b.trend - a.trend,
      matchup:     (a,b) => b.matchup - a.matchup,
      // External ranks: lower number = better draft position → sort ascending; nulls last
      sleeperRank: (a,b) => (a.sleeperRank || 9999) - (b.sleeperRank || 9999),
      espnRank:    (a,b) => (a.espnRank    || 9999) - (b.espnRank    || 9999),
    };
    return [...list].sort(fns[sortKey] || fns.projection);
  }, [enriched, posFilter, q, sortKey]);

  const MiniBar = ({val, color}) => (
    <div style={{display:'flex', alignItems:'center', gap:5}}>
      <div style={{flex:1, height:5, background:'rgba(255,255,255,.07)', borderRadius:99, overflow:'hidden'}}>
        <div style={{width:`${(val/10)*100}%`, height:'100%', background:color, borderRadius:99, transition:'width .4s'}}/>
      </div>
      <span style={{fontSize:11, color:'var(--dm)', minWidth:28, textAlign:'right', fontFamily:"'Bebas Neue'", letterSpacing:.5}}>{val}</span>
    </div>
  );

  const projColor = v => v >= 7 ? 'var(--lm)' : v >= 5 ? 'var(--gd)' : v >= 3 ? 'var(--em)' : 'var(--rs)';

  return <div className="fu" style={{padding:'24px 24px'}}>

    {/* ── Header ── */}
    <div style={{background:'var(--s1)', border:'1px solid var(--bd)', borderRadius:14, padding:18, marginBottom:16}}>
      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:12}}>
        <div>
          <h2 style={{fontFamily:"'Bebas Neue'", fontSize:28, letterSpacing:1.5, marginBottom:4}}>
            OPPORTUNITY-FIRST RANKINGS
          </h2>
          <p style={{color:'var(--dm)', fontSize:13, lineHeight:1.7}}>
            <span style={{color:'var(--em)',  fontWeight:700}}>40% Volume</span> ·{' '}
            <span style={{color:'var(--sk)',  fontWeight:700}}>25% Efficiency</span> ·{' '}
            <span style={{color:'var(--lm)', fontWeight:700}}>20% Trend</span> ·{' '}
            <span style={{color:'var(--vi)', fontWeight:700}}>15% Matchup</span>
            <span style={{color:'var(--dm)', fontSize:11}}> · click any row to see the breakdown</span>
          </p>
        </div>
        {/* Position filter */}
        <div style={{display:'flex', gap:4}}>
          {["ALL","QB","RB","WR","TE","K"].map(p => (
            <button key={p} onClick={() => setPosFilter(p)} style={{
              padding:'6px 13px', borderRadius:7, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
              background: posFilter===p ? (p==="ALL"?'var(--em)':posColor(p)) : 'rgba(255,255,255,.05)',
              color: posFilter===p ? '#000' : 'var(--dm)',
            }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Search + sort row */}
      <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search player or team…"
          style={{flex:1, minWidth:180, padding:'9px 13px', borderRadius:9, border:'1px solid var(--bd)',
                  background:'rgba(0,0,0,.3)', color:'var(--tx)', outline:'none', fontSize:13}}/>
        <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
          {[['projection','Overall'],['volume','Volume'],['efficiency','Efficiency'],['trend','Trend'],['matchup','Matchup'],['sleeperRank','Sleeper ADP'],['espnRank','ESPN ADP']].map(([k,l]) => (
            <button key={k} onClick={() => setSortKey(k)} style={{
              padding:'5px 12px', borderRadius:7, border:'none', cursor:'pointer', fontSize:12, whiteSpace:'nowrap',
              background: sortKey===k ? (k==='sleeperRank'?'#C084FC':k==='espnRank'?'#FF3D5A':'var(--em)') : 'rgba(255,255,255,.05)',
              color: sortKey===k ? '#fff' : 'var(--dm)', fontWeight: sortKey===k ? 800 : 500,
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* External rankings status */}
      {extLoading && (
        <div style={{marginTop:8, fontSize:11, color:'var(--dm)', display:'flex', gap:8, alignItems:'center'}}>
          <span style={{display:'inline-block', width:8, height:8, borderRadius:'50%', background:'#C084FC'}}/>
          Fetching Sleeper &amp; ESPN Fantasy draft rankings…
        </div>
      )}
      {!extLoading && (
        <div style={{marginTop:8, fontSize:11, color:'var(--dm)', display:'flex', gap:12, flexWrap:'wrap'}}>
          <span style={{color:'#C084FC', fontWeight:700}}>● Sleeper</span>
          <span style={{color:'#FF3D5A', fontWeight:700}}>● ESPN Fantasy</span>
          <span>draft rankings loaded · {sleeperMap.size > 0 ? `${Math.round(sleeperMap.size/2)} Sleeper players` : 'Sleeper unavailable'} · {espnMap.size > 0 ? `${espnMap.size} ESPN players` : 'ESPN Fantasy unavailable'}</span>
        </div>
      )}

      {/* Progress bar */}
      {fetching && (
        <div style={{marginTop:12}}>
          <div style={{display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--dm)', marginBottom:4}}>
            <span>Fetching player stats for projections… ({displayed.filter(p=>p.hasData).length} ready)</span>
            <span>{progress}%</span>
          </div>
          <div style={{height:4, background:'rgba(255,255,255,.06)', borderRadius:99, overflow:'hidden'}}>
            <div style={{width:`${progress}%`, height:'100%', background:'linear-gradient(90deg,var(--em),var(--gd))', borderRadius:99, transition:'width .3s'}}/>
          </div>
        </div>
      )}
    </div>

    {/* ── Stat summary cards ── */}
    <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14}}>
      {[
        {l:"Players Ranked", v:displayed.length,                           c:"var(--em)"},
        {l:"With Stat Data",  v:displayed.filter(p=>p.hasData).length,    c:"var(--lm)"},
        {l:"Top Projection",  v:displayed[0]?.projection ?? "—",          c:"var(--gd)"},
        {l:"Avg Projection",  v:displayed.length ? (displayed.reduce((s,p)=>s+p.projection,0)/displayed.length).toFixed(1) : "—", c:"var(--sk)"},
      ].map(({l,v,c}) => <StCard key={l} l={l} v={v} c={c}/>)}
    </div>

    {/* ── Main table ── */}
    <div style={{background:'var(--s1)', border:'1px solid var(--bd)', borderRadius:14, overflow:'hidden'}}>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr style={{borderBottom:'2px solid var(--bd)', background:'rgba(0,0,0,.25)'}}>
              <th style={{...th, width:36}}>#</th>
              <th style={th}>Player</th>
              <th style={{...th, width:46}}>Pos</th>
              <th style={{...th, width:60}}>Team</th>
              <th style={{...th, width:130}}>Projection</th>
              <th style={{...th, width:115, color:'var(--em)'}}>Volume <span style={{fontSize:9, fontWeight:400}}>(40%)</span></th>
              <th style={{...th, width:115, color:'var(--sk)'}}>Efficiency <span style={{fontSize:9, fontWeight:400}}>(25%)</span></th>
              <th style={{...th, width:115, color:'var(--lm)'}}>Trend <span style={{fontSize:9, fontWeight:400}}>(20%)</span></th>
              <th style={{...th, width:115, color:'var(--vi)'}}>Matchup <span style={{fontSize:9, fontWeight:400}}>(15%)</span></th>
              <th style={{...th, width:70, color:'#C084FC', cursor:'pointer'}} title="Sleeper positional search rank (lower = better)" onClick={()=>setSortKey('sleeperRank')}>
                Sleeper{sortKey==='sleeperRank'?' ↑':' ↕'}
              </th>
              <th style={{...th, width:70, color:'#FF3D5A', cursor:'pointer'}} title="ESPN Fantasy PPR draft rank (lower = better)" onClick={()=>setSortKey('espnRank')}>
                ESPN{sortKey==='espnRank'?' ↑':' ↕'}
              </th>
              <th style={{...th, width:36}}/>
            </tr>
          </thead>
          <tbody>
            {displayed.flatMap((p, i) => {
              const isOpen = expanded === p.id;
              const pc = posColor(p.pos);
              const rows = [];

              // Main row
              rows.push(
                <tr key={p.id}
                  style={{borderBottom: isOpen ? 'none' : '1px solid var(--bd)', cursor:'pointer', transition:'background .1s'}}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,.025)'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}
                  onClick={() => setExpanded(isOpen ? null : p.id)}>

                  <td style={{...td, color:'var(--dm)', fontWeight:700, fontSize:12}}>{i+1}</td>

                  {/* Player */}
                  <td style={td}>
                    <div style={{display:'flex', alignItems:'center', gap:10}}>
                      <img src={p.hs} alt={p.nm} width={40} height={40} className="hs"
                        onClick={e=>{e.stopPropagation();goP(p.id)}}
                        onError={e=>{e.target.style.opacity='.2'}}/>
                      <div>
                        <div style={{fontWeight:800, fontSize:14, cursor:'pointer'}}
                          onClick={e=>{e.stopPropagation();goP(p.id)}}>{p.nm}</div>
                        {!p.hasData && <span style={{fontSize:10, color:'var(--rs)', fontStyle:'italic'}}>loading…</span>}
                      </div>
                    </div>
                  </td>

                  <td style={td}><Pil ch={p.pos} c={pc} s={{padding:'2px 7px', fontSize:10}}/></td>

                  {/* Team logo */}
                  <td style={td}>
                    <div style={{display:'flex', alignItems:'center', gap:5, cursor:'pointer'}}
                      onClick={e=>{e.stopPropagation();goT(p.tm)}}>
                      <Logo ab={p.tm} sz={22}/>
                      <span style={{fontSize:12, color:'var(--dm)'}}>{p.tm}</span>
                    </div>
                  </td>

                  {/* Overall projection */}
                  <td style={td}>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <span style={{fontFamily:"'Bebas Neue'", fontSize:24, color:projColor(p.projection), minWidth:38, lineHeight:1}}>
                        {p.projection}
                      </span>
                      <div style={{flex:1, height:7, background:'rgba(255,255,255,.06)', borderRadius:99, overflow:'hidden'}}>
                        <div style={{width:`${(p.projection/10)*100}%`, height:'100%', background:projColor(p.projection), borderRadius:99}}/>
                      </div>
                    </div>
                  </td>

                  {/* Component score bars */}
                  <td style={td}><MiniBar val={p.volume}     color="var(--em)"/></td>
                  <td style={td}><MiniBar val={p.efficiency} color="var(--sk)"/></td>
                  <td style={td}><MiniBar val={p.trend}      color="var(--lm)"/></td>
                  <td style={td}><MiniBar val={p.matchup}    color="var(--vi)"/></td>

                  {/* External draft rank columns */}
                  <td style={{...td, textAlign:'center'}}>
                    {extLoading
                      ? <span style={{color:'rgba(155,89,182,.4)', fontSize:11}}>…</span>
                      : p.sleeperRank
                        ? <span style={{fontFamily:"'Bebas Neue'", fontSize:16, color:'#C084FC'}}>{p.sleeperRank}</span>
                        : <span style={{color:'rgba(255,255,255,.2)', fontSize:12}}>—</span>
                    }
                  </td>
                  <td style={{...td, textAlign:'center'}}>
                    {extLoading
                      ? <span style={{color:'rgba(231,76,60,.4)', fontSize:11}}>…</span>
                      : p.espnRank
                        ? <span style={{fontFamily:"'Bebas Neue'", fontSize:16, color:'#FF3D5A'}}>{p.espnRank}</span>
                        : <span style={{color:'rgba(255,255,255,.2)', fontSize:12}}>—</span>
                    }
                  </td>

                  {/* Expand toggle */}
                  <td style={{...td, textAlign:'center', color:'var(--dm)', fontSize:12, userSelect:'none'}}>
                    {isOpen ? '▲' : '▼'}
                  </td>
                </tr>
              );

              // Expandable "Why this rank?" row
              if (isOpen) {
                const rs = p.recentStats;
                const perGame = (val, div) => div > 0 ? (val / div).toFixed(1) : "—";
                const gp = rs?.gp || 1;
                rows.push(
                  <tr key={`${p.id}_exp`} style={{borderBottom:'1px solid var(--bd)'}}>
                    <td colSpan={12} style={{padding:'14px 18px', background:'rgba(0,0,0,.18)'}}>
                      <div style={{fontFamily:"'Bebas Neue'", fontSize:13, letterSpacing:1.5, color:'var(--em)', marginBottom:12}}>
                        WHY THIS RANK? — {p.nm}
                      </div>
                      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))', gap:10, marginBottom:12}}>
                        {[
                          {
                            key: 'volume', label:'VOLUME (40%)', color:'var(--em)', score: p.volume,
                            detail: rs ? (
                              p.pos==="QB"  ? `${perGame(rs.passAtt||0, gp)} att/g (elite = 38)`  :
                              p.pos==="RB"  ? `${perGame((rs.rushAtt||0)+(rs.rec||0), gp)} tch/g (elite = 22)` :
                              p.pos==="K"   ? `${perGame(rs.fga||0, gp)} FGA/g (elite = 3.5)` :
                              `${perGame(rs.tgt||0, gp)} tgt/g (elite = ${p.pos==="TE"?"7":"10"})`
                            ) : "No recent stats — score estimated",
                          },
                          {
                            key: 'efficiency', label:'EFFICIENCY (25%)', color:'var(--sk)', score: p.efficiency,
                            detail: rs ? (
                              p.pos==="QB"  ? `${perGame(rs.passYd||0, Math.max(rs.passAtt||1,1))} yds/att · ${rs.passTD||0} TD · ${rs.passInt||0} INT` :
                              p.pos==="RB"  ? `${perGame(rs.rushYd||0, Math.max(rs.rushAtt||1,1))} yds/carry · ${rs.rec||0} rec` :
                              p.pos==="K"   ? `${rs.fgm||0}/${rs.fga||0} FG · ${rs.fgPct?(rs.fgPct>1?rs.fgPct.toFixed(0):(rs.fgPct*100).toFixed(0))+"% FG%":"—"} · ${rs.patm||0} PAT` :
                              `${perGame(rs.recYd||0, Math.max(rs.tgt||rs.rec||1,1))} yds/tgt · ${rs.recTD||0} TD`
                            ) : "No recent stats",
                          },
                          {
                            key: 'trend', label:'TREND (20%)', color:'var(--lm)', score: p.trend,
                            detail: p.recentYear
                              ? `Based on ${p.recentYear} vs prior season — ${p.trend >= 6 ? "improving ↑" : p.trend >= 5 ? "stable →" : "declining ↓"}`
                              : "Insufficient history",
                          },
                          {
                            key: 'matchup', label:'MATCHUP (15%)', color:'var(--vi)', score: p.matchup,
                            detail: p.matchup >= 6
                              ? `Favorable — ${p.tm} defense allows above-average fantasy pts (2024 data)`
                              : p.matchup >= 5
                              ? `Neutral — ${p.tm} defense is near league average (2024 data)`
                              : `Tough — ${p.tm} defense limits fantasy scoring (2024 data)`,
                          },
                        ].map(item => (
                          <div key={item.key} style={{background:'rgba(255,255,255,.03)', border:`1px solid ${item.color}22`, borderRadius:10, padding:'10px 13px'}}>
                            <div style={{fontSize:10, color:item.color, fontWeight:700, fontFamily:"'Exo 2',sans-serif", letterSpacing:.8, marginBottom:3}}>{item.label}</div>
                            <div style={{fontFamily:"'Bebas Neue'", fontSize:28, color:item.color, lineHeight:1, marginBottom:4}}>{item.score}</div>
                            <div style={{fontSize:12, color:'var(--dm)', lineHeight:1.4}}>{item.detail}</div>
                          </div>
                        ))}
                      </div>

                      {/* Formula line */}
                      <div style={{fontSize:12, color:'var(--dm)', fontFamily:"'Exo 2',sans-serif", letterSpacing:.3}}>
                        <span style={{color:'var(--tx)', fontWeight:600}}>Projection = </span>
                        <span style={{color:'var(--em)'}}>{p.volume}×0.40</span> +{' '}
                        <span style={{color:'var(--sk)'}}>{p.efficiency}×0.25</span> +{' '}
                        <span style={{color:'var(--lm)'}}>{p.trend}×0.20</span> +{' '}
                        <span style={{color:'var(--vi)'}}>{p.matchup}×0.15</span>
                        <span style={{color:'var(--gd)', fontWeight:700, fontSize:14, marginLeft:8}}> = {p.projection}</span>
                      </div>

                      {/* External draft rank comparison */}
                      <div style={{marginTop:10, display:'flex', gap:10, flexWrap:'wrap'}}>
                        <div style={{background:'rgba(155,89,182,.12)', border:'1px solid rgba(155,89,182,.3)', borderRadius:8, padding:'7px 14px', display:'flex', alignItems:'center', gap:8}}>
                          <span style={{fontSize:10, color:'#C084FC', fontWeight:700, fontFamily:"'Exo 2',sans-serif", letterSpacing:.8}}>SLEEPER RANK</span>
                          <span style={{fontFamily:"'Bebas Neue'", fontSize:22, color:'#C084FC', lineHeight:1}}>
                            {extLoading ? '…' : (p.sleeperRank ?? '—')}
                          </span>
                          {!extLoading && p.sleeperRank && <span style={{fontSize:11, color:'var(--dm)'}}>pos rank</span>}
                        </div>
                        <div style={{background:'rgba(231,76,60,.12)', border:'1px solid rgba(231,76,60,.3)', borderRadius:8, padding:'7px 14px', display:'flex', alignItems:'center', gap:8}}>
                          <span style={{fontSize:10, color:'#FF3D5A', fontWeight:700, fontFamily:"'Exo 2',sans-serif", letterSpacing:.8}}>ESPN FANTASY RANK</span>
                          <span style={{fontFamily:"'Bebas Neue'", fontSize:22, color:'#FF3D5A', lineHeight:1}}>
                            {extLoading ? '…' : (p.espnRank ?? '—')}
                          </span>
                          {!extLoading && p.espnRank && <span style={{fontSize:11, color:'var(--dm)'}}>PPR</span>}
                        </div>
                        {!extLoading && p.sleeperRank && p.espnRank && (() => {
                          const appRank = displayed.findIndex(x => x.id === p.id) + 1;
                          const avg = Math.round((p.sleeperRank + p.espnRank) / 2);
                          const diff = appRank - avg;
                          return (
                            <div style={{background:'rgba(255,255,255,.04)', border:'1px solid var(--bd)', borderRadius:8, padding:'7px 14px', display:'flex', alignItems:'center', gap:8}}>
                              <span style={{fontSize:10, color:'var(--dm)', fontWeight:700, fontFamily:"'Exo 2',sans-serif", letterSpacing:.8}}>VS CONSENSUS</span>
                              <span style={{fontFamily:"'Bebas Neue'", fontSize:22, color: diff < -5 ? 'var(--lm)' : diff > 5 ? 'var(--rs)' : 'var(--dm)', lineHeight:1}}>
                                {diff > 0 ? `+${diff}` : diff}
                              </span>
                              <span style={{fontSize:11, color:'var(--dm)'}}>
                                {diff < -5 ? 'ranked higher here' : diff > 5 ? 'ranked lower here' : 'consensus'}
                              </span>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Stat pills */}
                      {rs && (
                        <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:10}}>
                          <Pil ch={`${rs.gp || "?"} GP`} c="var(--tx)" s={{fontSize:11}}/>
                          {p.pos==="QB" && <>
                            <Pil ch={`${(rs.passYd||0).toLocaleString()} pass yds`} c="var(--em)" s={{fontSize:11}}/>
                            <Pil ch={`${rs.passTD||0} TD`}  c="var(--lm)" s={{fontSize:11}}/>
                            <Pil ch={`${rs.passInt||0} INT`} c="var(--rs)" s={{fontSize:11}}/>
                            <Pil ch={`${(rs.rushYd||0).toLocaleString()} rush yds`} c="var(--sk)" s={{fontSize:11}}/>
                          </>}
                          {p.pos==="RB" && <>
                            <Pil ch={`${(rs.rushYd||0).toLocaleString()} rush yds`} c="var(--em)" s={{fontSize:11}}/>
                            <Pil ch={`${rs.rushTD||0} rush TD`} c="var(--lm)" s={{fontSize:11}}/>
                            <Pil ch={`${rs.rec||0} rec / ${rs.tgt||"?"} tgt`} c="var(--sk)" s={{fontSize:11}}/>
                            <Pil ch={`${(rs.recYd||0).toLocaleString()} rec yds`} c="var(--vi)" s={{fontSize:11}}/>
                          </>}
                          {(p.pos==="WR"||p.pos==="TE") && <>
                            <Pil ch={`${rs.tgt||"?"} tgt`}    c="var(--em)" s={{fontSize:11}}/>
                            <Pil ch={`${rs.rec||0} rec`}       c="var(--sk)" s={{fontSize:11}}/>
                            <Pil ch={`${(rs.recYd||0).toLocaleString()} yds`} c="var(--lm)" s={{fontSize:11}}/>
                            <Pil ch={`${rs.recTD||0} TD`}      c="var(--gd)" s={{fontSize:11}}/>
                          </>}
                          {p.pos==="K" && <>
                            <Pil ch={`${rs.fgm||0}/${rs.fga||0} FG`} c="var(--kc)" s={{fontSize:11}}/>
                            <Pil ch={`${rs.fgPct?(rs.fgPct>1?rs.fgPct.toFixed(0):(rs.fgPct*100).toFixed(0))+"% FG%":"—"}`} c="var(--em)" s={{fontSize:11}}/>
                            <Pil ch={`${rs.patm||0} PAT`}  c="var(--sk)" s={{fontSize:11}}/>
                            {rs.longFG ? <Pil ch={`${rs.longFG} long`} c="var(--vi)" s={{fontSize:11}}/> : null}
                          </>}
                          <Pil ch={`${rs.fpts||0} FPTS`} c="var(--gd)" s={{fontSize:11, fontWeight:800}}/>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              }

              return rows;
            })}
          </tbody>
        </table>
      </div>
      {displayed.length === 0 && (
        <div style={{padding:40, textAlign:'center', color:'var(--dm)'}}>
          {fetching ? "Loading player stats…" : "No players match your search."}
        </div>
      )}
    </div>

    <div style={{marginTop:12, color:'var(--dm)', fontSize:12, padding:'0 4px', lineHeight:1.7}}>
      * Volume = opportunity per game · Efficiency = fantasy pts per touch/target · Trend = YoY improvement detector · Matchup = opponent vulnerability (placeholder) · Click any row to see the full formula breakdown.
    </div>
  </div>;
};

// ═══════════════════════════════════════════════════════════════
//  APP — Main Component
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const[tab,setTab]=useState("Home");
  const[players,setPlayers]=useState([]);
  const[loading,setLoading]=useState(true);
  const[selP,setSelP]=useState(null);
  const[selT,setSelT]=useState(null);
  const[statsCache,setStatsCache]=useState({});
  const[tabHistory,setTabHistory]=useState([]);
  const[sleeperMap,setSleeperMap]=useState(new Map());
  const[espnMap,setEspnMap]=useState(new Map());
  const[extLoading,setExtLoading]=useState(true);

  // Fetch all rosters on mount
  useEffect(()=>{
    fetchAllRosters().then(pl=>{
      setPlayers(pl);
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);

  // Fetch external draft rankings once at app level (shared by Rankings + Edge Board)
  useEffect(()=>{
    Promise.all([fetchSleeperRankings(), fetchEspnFantasyRankings()])
      .then(([sMap,eMap])=>{ setSleeperMap(sMap); setEspnMap(eMap); })
      .finally(()=>setExtLoading(false));
  },[]);

  // Navigation helpers — push current tab to history before switching
  const go = t => { setTabHistory(h=>[...h,tab]); setTab(t); window.scrollTo(0,0); };
  const goT = ab => { setTabHistory(h=>[...h,tab]); setSelT(ab); setTab("Teams"); window.scrollTo(0,0); };
  const goP = id => { setTabHistory(h=>[...h,tab]); setSelP(id); setTab("Players"); window.scrollTo(0,0); };
  const goBack = () => {
    const prev = tabHistory[tabHistory.length-1];
    if (!prev) return;
    setTabHistory(h=>h.slice(0,-1));
    setTab(prev);
    window.scrollTo(0,0);
  };

  return <div style={{display:'flex',minHeight:'100vh'}}><style>{CSS}</style>
    <Sidebar tab={tab} go={go} goBack={goBack} canGoBack={tabHistory.length>0}/>
    <div style={{marginLeft:220,flex:1,minWidth:0,display:'flex',flexDirection:'column'}}>
      {tab==="Home"&&<Home go={go} goT={goT} goP={goP} players={players} loading={loading} statsCache={statsCache}/>}
      {tab==="Players"&&<Players players={players} loading={loading} sel={selP} setSel={setSelP} goT={goT} statsCache={statsCache} setStatsCache={setStatsCache}/>}
      {tab==="Teams"&&<Teams sel={selT} setSel={setSelT} players={players} goP={goP} statsCache={statsCache}/>}
      {tab==="Games"&&<GamesFetch goT={goT}/>}
      {tab==="Brackets"&&<Brackets goT={goT}/>}
      {tab==="Predictions"&&<Predictions goT={goT} players={players} statsCache={statsCache} setStatsCache={setStatsCache}/>}
      {tab==="Rankings"&&<Rankings players={players} statsCache={statsCache} setStatsCache={setStatsCache} goT={goT} goP={goP} sleeperMap={sleeperMap} espnMap={espnMap} extLoading={extLoading}/>}
      {tab==="Edge Board"&&<EdgeBoard players={players} statsCache={statsCache} setStatsCache={setStatsCache} goP={goP} sleeperMap={sleeperMap} espnMap={espnMap} extLoading={extLoading}/>}
      <div style={{textAlign:'center',padding:'18px 20px',color:'rgba(232,236,248,.2)',fontSize:11,borderTop:'1px solid var(--bd)',marginTop:'auto'}}>
        <span style={{fontFamily:"'Bebas Neue'",letterSpacing:1}}>GRIDIRON INTEL</span> • Powered by ESPN Public API
      </div>
    </div>
  </div>;
}
