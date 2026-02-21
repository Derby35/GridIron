import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, Cell, Legend } from "recharts";

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
const OFF_POS = new Set(["QB","RB","WR","TE"]);
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
              const pos = p.position?.abbreviation;
              if (!OFF_POS.has(pos)) continue;
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
    const po = ["QB","RB","WR","TE"];
    const d = po.indexOf(a.pos) - po.indexOf(b.pos);
    if (d !== 0) return d;
    return a.nm.localeCompare(b.nm);
  });
  return all;
}

// ═══════════════════════════════════════════════════════════════
//  FETCH PLAYER STATS — season-by-season from ESPN
// ═══════════════════════════════════════════════════════════════
async function fetchPlayerStats(athleteId) {
  // Try the web stats endpoint first (single call, has career data)
  let data = await espn(`${WEB}/athletes/${athleteId}/stats`);
  let parsed = parseWebStats(data);
  if (parsed && Object.keys(parsed).length > 0) return parsed;

  // Fallback: try overview endpoint
  data = await espn(`${WEB}/athletes/${athleteId}/overview`);
  parsed = parseOverviewStats(data);
  if (parsed && Object.keys(parsed).length > 0) return parsed;

  // Fallback 2: fetch per-season from core API (2017-2025)
  return fetchPerSeasonStats(athleteId);
}

function parseWebStats(data) {
  if (!data) return null;
  const seasons = {};

  // The stats endpoint returns categories with seasonTypes
  // Each category has a displayName (Passing, Rushing, Receiving, etc.)
  // We prefix stats by category to avoid collisions (e.g. YDS appears in passing AND receiving)
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
            // Store with the exact API name (no collision since names are category-specific)
            seasons[yr][names[i]] = parseFloat(stats[i]) || 0;
          }
        }
      }
    }
  }

  // Normalize stat names
  return normalizeStats(seasons);
}

function parseOverviewStats(data) {
  if (!data) return null;
  const seasons = {};

  // Try to find stats in various locations
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
            // Use names (API field names) not labels (display abbreviations) to avoid collisions
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
  // Fetch regular season stats for each year (seasontype 2 = regular season)
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
    // Core API returns splits.categories[] each with stats[{name, value}]
    const cats = d?.splits?.categories || d?.categories || [];
    for (const cat of cats) {
      const statList = cat.stats || [];
      for (const s of statList) {
        if (s.name && s.value !== undefined && s.value !== null) {
          // Don't overwrite an existing non-zero value with zero
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
    // Games — ESPN core API uses "gamesPlayed"
    s.gp = raw.gamesPlayed || 0;
    // Passing — exact ESPN field names from both web and core API
    s.passYd = raw.passingYards || raw.netPassingYards || 0;
    s.passTD = raw.passingTouchdowns || 0;
    s.passInt = raw.interceptions || 0;
    s.passCmp = raw.completions || 0;
    s.passAtt = raw.passingAttempts || raw.netPassingAttempts || 0;
    s.passRat = raw.QBRating || raw.quarterbackRating || raw.ESPNQBRating || 0;
    // Rushing — exact ESPN field names
    s.rushYd = raw.rushingYards || 0;
    s.rushTD = raw.rushingTouchdowns || 0;
    s.rushAtt = raw.rushingAttempts || 0;
    // Receiving — exact ESPN field names
    s.rec = raw.receptions || 0;
    s.recYd = raw.receivingYards || 0;
    s.recTD = raw.receivingTouchdowns || 0;
    s.tgt = raw.receivingTargets || 0;
    // Fumbles — ESPN uses "fumbles" at general level, or category-specific lost
    s.fum = raw.fumblesLost || raw.passingFumblesLost || raw.rushingFumblesLost || raw.receivingFumblesLost || raw.fumbles || 0;
    // Calculate fantasy points (PPR)
    s.fpts = Math.round(
      (s.passYd * 0.04) + (s.passTD * 4) + (s.passInt * -2) +
      (s.rushYd * 0.1) + (s.rushTD * 6) +
      (s.rec * 1) + (s.recYd * 0.1) + (s.recTD * 6) +
      (s.fum * -2)
    );
    // Only include seasons where player actually played
    if (s.gp > 0 || s.passYd > 0 || s.rushYd > 0 || s.recYd > 0 || s.fpts > 0) {
      norm[yr] = s;
    }
  }
  return norm;
}

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

// ═══════════════════════════════════════════════════════════════
//  CSS
// ═══════════════════════════════════════════════════════════════
const CSS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@300;400;500;600;700;800;900&family=Barlow+Condensed:wght@400;600;700&display=swap');
:root{--bg:#04060C;--s1:#0A0F1E;--s2:#0F1628;--bd:rgba(255,255,255,.06);--tx:#E8ECF8;--dm:rgba(232,236,248,.45);--em:#F97316;--gd:#F59E0B;--lm:#22C55E;--sk:#38BDF8;--rs:#F43F5E;--vi:#A78BFA}
*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg);color:var(--tx);font-family:'Barlow',sans-serif}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px}
@keyframes fu{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}.fu{animation:fu .4s ease-out both}
@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin .8s linear infinite}
.logo{border-radius:50%;object-fit:contain;background:rgba(255,255,255,.03)}
.hs{border-radius:50%;object-fit:cover;border:2px solid var(--bd);background:linear-gradient(135deg,var(--s1),var(--s2))}
.recharts-cartesian-axis-tick-value{fill:rgba(232,236,248,.4)!important;font-size:11px!important}
.recharts-legend-item-text{color:var(--tx)!important;font-size:11px!important}`;

// ═══════════════════════════════════════════════════════════════
//  SMALL COMPONENTS
// ═══════════════════════════════════════════════════════════════
const Logo = ({ab,sz=36,onClick}) => <img src={`${IMG}/${ab?.toLowerCase()}.png`} alt={ab} width={sz} height={sz} className="logo" style={{cursor:onClick?'pointer':'default',flexShrink:0}} onClick={onClick} onError={e=>{e.target.style.opacity='.3'}}/>;
const Hs = ({src,sz=48}) => <img src={src} alt="" width={sz} height={sz} className="hs" onError={e=>{e.target.style.background='linear-gradient(135deg,#1a1a2e,#16213e)';e.target.src=''}}/>;
const Pil = ({ch,c="var(--em)",s={}}) => <span style={{display:'inline-flex',alignItems:'center',padding:'3px 9px',borderRadius:999,background:`${c}15`,border:`1px solid ${c}33`,color:c,fontSize:11,fontWeight:700,letterSpacing:.5,...s}}>{ch}</span>;
const StCard = ({l,v,c="var(--em)"}) => <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:10,padding:'8px 12px',flex:1,minWidth:75,borderTop:`3px solid ${c}`}}><div style={{color:'var(--dm)',fontSize:10,textTransform:'uppercase',letterSpacing:.8,fontFamily:"'Barlow Condensed'"}}>{l}</div><div style={{fontSize:20,fontWeight:900,fontFamily:"'Bebas Neue'",color:c,marginTop:2,letterSpacing:1}}>{v ?? "—"}</div></div>;
const TT = ({active,payload,label}) => {if(!active||!payload?.length)return null;return<div style={{background:'rgba(4,6,12,.95)',border:'1px solid var(--bd)',borderRadius:8,padding:'6px 10px',fontSize:11}}><div style={{fontWeight:700,color:'var(--em)',marginBottom:2}}>{label}</div>{payload.map((p,i)=><div key={i} style={{display:'flex',gap:4,alignItems:'center'}}><div style={{width:6,height:6,borderRadius:'50%',background:p.color||p.stroke}}/><span style={{color:'var(--dm)'}}>{p.name}:</span><span style={{fontWeight:700}}>{typeof p.value==='number'?p.value.toLocaleString():p.value}</span></div>)}</div>};
const Spinner = ({msg="Loading..."}) => <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:60,gap:12}}><div className="spin" style={{width:32,height:32,border:'3px solid var(--bd)',borderTopColor:'var(--em)',borderRadius:'50%'}}/><span style={{color:'var(--dm)',fontSize:12}}>{msg}</span></div>;
const th = {padding:'5px 6px',textAlign:'left',color:'var(--dm)',fontWeight:600,fontSize:9,textTransform:'uppercase',letterSpacing:.5,fontFamily:"'Barlow Condensed'"};
const td = {padding:'5px 6px',textAlign:'left',fontSize:11};
const posColor = p => p==="QB"?"var(--em)":p==="RB"?"var(--lm)":p==="WR"?"var(--sk)":"var(--vi)";

// ═══════════════════════════════════════════════════════════════
//  NAV
// ═══════════════════════════════════════════════════════════════
const TABS = ["Home","Players","Teams","Games","Brackets","Predictions"];
const Nav = ({tab,go}) => (
  <div style={{position:'sticky',top:0,zIndex:50,background:'rgba(4,6,12,.82)',backdropFilter:'blur(18px)',borderBottom:'1px solid var(--bd)'}}>
    <div style={{maxWidth:1320,margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 16px',height:52}}>
      <div style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}} onClick={()=>go("Home")}>
        <div style={{width:30,height:30,borderRadius:8,background:'linear-gradient(135deg,var(--em),var(--gd))',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Bebas Neue'",fontSize:14,color:'#000'}}>GI</div>
        <span style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:2}}>GRIDIRON <span style={{color:'var(--em)'}}>INTEL</span></span>
      </div>
      <div style={{display:'flex',gap:2,flexWrap:'wrap'}}>{TABS.map(t=><button key={t} onClick={()=>go(t)} style={{padding:'6px 13px',borderRadius:7,border:'none',background:tab===t?'var(--em)':'transparent',color:tab===t?'#000':'var(--tx)',fontWeight:tab===t?800:500,fontSize:12,cursor:'pointer',fontFamily:"'Barlow'"}}>{t}</button>)}</div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
//  HOME
// ═══════════════════════════════════════════════════════════════
const Home = ({go,goT,players,loading}) => (
  <div className="fu" style={{maxWidth:1320,margin:'0 auto',padding:'20px 16px'}}>
    <div style={{borderRadius:20,padding:'40px 36px',marginBottom:20,background:'linear-gradient(135deg,rgba(249,115,22,.1),rgba(56,189,248,.06),rgba(4,6,12,.95))',border:'1px solid rgba(249,115,22,.12)'}}>
      <Pil ch="LIVE ESPN API • ALL ACTIVE PLAYERS • 2017-2025" c="var(--gd)" s={{marginBottom:14,display:'inline-flex'}}/>
      <h1 style={{fontFamily:"'Bebas Neue'",fontSize:46,lineHeight:1,letterSpacing:2,marginBottom:8}}>NFL Fantasy Football<br/><span style={{color:'var(--em)'}}>Intelligence Hub</span></h1>
      <p style={{color:'var(--dm)',fontSize:15,maxWidth:600,lineHeight:1.5,marginBottom:20}}>Dynamically pulling every active QB, RB, WR, and TE from all 32 NFL rosters via the ESPN Public API. Click any player to fetch their full career stats with interactive charts.</p>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {TABS.slice(1).map((t,i)=><button key={t} onClick={()=>go(t)} style={{padding:'10px 22px',borderRadius:10,border:i===0?'none':'1px solid var(--bd)',background:i===0?'linear-gradient(135deg,var(--em),var(--gd))':'rgba(255,255,255,.04)',color:i===0?'#000':'var(--tx)',fontWeight:800,fontSize:13,cursor:'pointer'}}>{t}</button>)}
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
      <StCard l="Active Players" v={loading?"...":players.length} c="var(--em)"/>
      <StCard l="QBs" v={loading?"...":players.filter(p=>p.pos==="QB").length} c="var(--gd)"/>
      <StCard l="RBs + WRs" v={loading?"...":(players.filter(p=>p.pos==="RB").length+"+"+players.filter(p=>p.pos==="WR").length)} c="var(--sk)"/>
      <StCard l="TEs" v={loading?"...":players.filter(p=>p.pos==="TE").length} c="var(--vi)"/>
    </div>
    <h2 style={{fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:1,marginBottom:10}}>ALL 32 TEAMS</h2>
    <div style={{display:'grid',gridTemplateColumns:'repeat(8,1fr)',gap:8,marginBottom:20}}>
      {ALL_AB.map(ab=><div key={ab} onClick={()=>goT(ab)} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,padding:'8px 4px',borderRadius:12,border:'1px solid var(--bd)',background:'var(--s1)',cursor:'pointer',transition:'all .2s'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=TM[ab].c1;e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--bd)';e.currentTarget.style.transform='none'}}><Logo ab={ab} sz={32}/><span style={{fontSize:9,color:'var(--dm)',fontWeight:600}}>{ab}</span></div>)}
    </div>
    {loading && <Spinner msg="Fetching all 32 team rosters from ESPN..."/>}
  </div>
);

// ═══════════════════════════════════════════════════════════════
//  PLAYERS PAGE — Dynamic ESPN fetch
// ═══════════════════════════════════════════════════════════════
const Players = ({players,loading,sel,setSel,goT,statsCache,setStatsCache}) => {
  const[pos,setPos]=useState("ALL");const[q,setQ]=useState("");const[yr,setYr]=useState(null);const[fetching,setFetching]=useState(false);
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

  // Build chart data with ALL stat categories
  const chartData = seasons.map(([y,s])=>({
    year: y,
    "Fantasy Pts": s.fpts||0,
    "Pass Yds": s.passYd||0,
    "Pass TD": s.passTD||0,
    "Rush Yds": s.rushYd||0,
    "Rush TD": s.rushTD||0,
    "Rec Yds": s.recYd||0,
    "Rec TD": s.recTD||0,
    "Receptions": s.rec||0,
    "INT": s.passInt||0,
  }));

  return <div className="fu" style={{maxWidth:1320,margin:'0 auto',padding:'20px 16px'}}>
    <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:16,minHeight:'calc(100vh - 100px)'}}>
      {/* SIDEBAR */}
      <div>
        <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,padding:12,marginBottom:10}}>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search player or team..." style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid var(--bd)',background:'rgba(0,0,0,.3)',color:'var(--tx)',outline:'none',fontSize:12,marginBottom:6}}/>
          <div style={{display:'flex',gap:3}}>{["ALL","QB","RB","WR","TE"].map(p=><button key={p} onClick={()=>setPos(p)} style={{padding:'4px 10px',borderRadius:6,border:'none',background:pos===p?posColor(p==="ALL"?"QB":p):'rgba(255,255,255,.05)',color:pos===p?'#000':'var(--tx)',fontWeight:pos===p?800:500,fontSize:11,cursor:'pointer'}}>{p} {pos==="ALL"?"":p===pos?`(${list.length})`:""}</button>)}</div>
          {!loading && <div style={{color:'var(--dm)',fontSize:10,marginTop:4}}>{list.length} players loaded from ESPN</div>}
        </div>
        <div style={{maxHeight:'calc(100vh - 220px)',overflowY:'auto',display:'flex',flexDirection:'column',gap:3}}>
          {loading ? <Spinner msg="Loading rosters..."/> :
            list.map(p=><div key={p.id} onClick={()=>setSel(p.id)} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:8,cursor:'pointer',background:sel===p.id?'rgba(249,115,22,.1)':'var(--s1)',border:`1px solid ${sel===p.id?'rgba(249,115,22,.25)':'var(--bd)'}`,transition:'all .12s'}}><Hs src={p.hs} sz={30}/><div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.nm}</div><div style={{display:'flex',alignItems:'center',gap:4}}><Pil ch={p.pos} c={posColor(p.pos)} s={{padding:'1px 5px',fontSize:9}}/><span style={{color:'var(--dm)',fontSize:10}}>{p.tm} #{p.n}</span></div></div></div>)}
        </div>
      </div>

      {/* DETAIL */}
      <div>{!pl ?
        <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,padding:50,textAlign:'center'}}><h2 style={{fontFamily:"'Bebas Neue'"}}>SELECT A PLAYER</h2><p style={{color:'var(--dm)',fontSize:12,marginTop:4}}>Choose from {players.length} active NFL players</p></div>
      : fetching ?
        <Spinner msg={`Fetching stats for ${pl.nm} from ESPN API...`}/>
      :
        <div className="fu">
          {/* HEADER */}
          <div style={{background:`linear-gradient(135deg,${TM[pl.tm]?.c1}20,var(--s1))`,border:'1px solid var(--bd)',borderRadius:12,padding:16,marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',gap:14}}>
              <Hs src={pl.hs} sz={72}/>
              <div style={{flex:1}}>
                <h2 style={{fontFamily:"'Bebas Neue'",fontSize:30,letterSpacing:2,lineHeight:1}}>{pl.nm}</h2>
                <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                  <Pil ch={pl.pos} c={posColor(pl.pos)}/>
                  <span style={{cursor:'pointer',color:'var(--dm)',fontSize:12,textDecoration:'underline'}} onClick={()=>goT(pl.tm)}>{TM[pl.tm]?.c} {TM[pl.tm]?.n}</span>
                  <span style={{color:'var(--dm)',fontSize:12}}>#{pl.n}{pl.age?` • Age ${pl.age}`:""}{pl.exp?` • ${pl.exp}yr exp`:""}</span>
                </div>
              </div>
              <Logo ab={pl.tm} sz={44}/>
            </div>
            {seasons.length > 0 && <div style={{display:'flex',gap:3,marginTop:10,flexWrap:'wrap'}}>{seasons.map(([y])=><button key={y} onClick={()=>setYr(y)} style={{padding:'4px 9px',borderRadius:6,border:'none',background:ay===y?'var(--em)':'rgba(255,255,255,.05)',color:ay===y?'#000':'var(--tx)',fontWeight:ay===y?800:500,fontSize:11,cursor:'pointer'}}>{y}</button>)}</div>}
          </div>

          {!stats || seasons.length === 0 ?
            <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,padding:30,textAlign:'center',color:'var(--dm)'}}>No historical stats found. Player may be a rookie or data unavailable.</div>
          : <>
            {/* STAT CARDS */}
            {st && <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
              <StCard l="GP" v={st.gp||"—"} c="var(--tx)"/>
              {(pl.pos==="QB") && <><StCard l="Pass Yds" v={st.passYd?.toLocaleString()} c="var(--em)"/><StCard l="Pass TD" v={st.passTD} c="var(--lm)"/><StCard l="INT" v={st.passInt} c="var(--rs)"/><StCard l="Rush Yds" v={st.rushYd?.toLocaleString()} c="var(--sk)"/><StCard l="Rush TD" v={st.rushTD} c="var(--vi)"/><StCard l="Rating" v={st.passRat?st.passRat.toFixed(1):"—"} c="var(--gd)"/></>}
              {(pl.pos==="RB") && <><StCard l="Rush Yds" v={st.rushYd?.toLocaleString()} c="var(--em)"/><StCard l="Rush TD" v={st.rushTD} c="var(--lm)"/><StCard l="Rec" v={st.rec} c="var(--sk)"/><StCard l="Rec Yds" v={st.recYd?.toLocaleString()} c="var(--vi)"/><StCard l="Rec TD" v={st.recTD} c="var(--gd)"/></>}
              {(pl.pos==="WR"||pl.pos==="TE") && <><StCard l="Rec" v={st.rec} c="var(--em)"/><StCard l="Rec Yds" v={st.recYd?.toLocaleString()} c="var(--sk)"/><StCard l="Rec TD" v={st.recTD} c="var(--lm)"/><StCard l="Rush Yds" v={st.rushYd?.toLocaleString()||"0"} c="var(--vi)"/><StCard l="Rush TD" v={st.rushTD||0} c="var(--gd)"/></>}
              <StCard l="FPTS" v={st.fpts} c="var(--gd)"/>
            </div>}

            {/* CHARTS — All stat categories */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              {/* Fantasy Points */}
              <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,padding:12}}>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:1,marginBottom:8}}>FANTASY POINTS (PPR)</div>
                <ResponsiveContainer width="100%" height={180}><AreaChart data={chartData}><defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F97316" stopOpacity={.3}/><stop offset="95%" stopColor="#F97316" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/><XAxis dataKey="year"/><YAxis/><Tooltip content={<TT/>}/><Area type="monotone" dataKey="Fantasy Pts" stroke="#F97316" fill="url(#fg)" strokeWidth={2}/></AreaChart></ResponsiveContainer>
              </div>

              {/* Yards (Pass + Rush + Rec) */}
              <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,padding:12}}>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:1,marginBottom:8}}>YARDS BY SEASON</div>
                <ResponsiveContainer width="100%" height={180}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/><XAxis dataKey="year"/><YAxis/><Tooltip content={<TT/>}/><Legend iconSize={8}/>
                  {pl.pos==="QB" && <Bar dataKey="Pass Yds" fill="#F97316" radius={[3,3,0,0]}/>}
                  <Bar dataKey="Rush Yds" fill="#22C55E" radius={[3,3,0,0]}/>
                  <Bar dataKey="Rec Yds" fill="#38BDF8" radius={[3,3,0,0]}/>
                </BarChart></ResponsiveContainer>
              </div>

              {/* Touchdowns (All types) */}
              <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,padding:12}}>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:1,marginBottom:8}}>TOUCHDOWNS BY SEASON</div>
                <ResponsiveContainer width="100%" height={180}><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/><XAxis dataKey="year"/><YAxis/><Tooltip content={<TT/>}/><Legend iconSize={8}/>
                  {pl.pos==="QB" && <Line type="monotone" dataKey="Pass TD" stroke="#F97316" strokeWidth={2} dot={{fill:'#F97316',r:3}}/>}
                  <Line type="monotone" dataKey="Rush TD" stroke="#22C55E" strokeWidth={2} dot={{fill:'#22C55E',r:3}}/>
                  <Line type="monotone" dataKey="Rec TD" stroke="#38BDF8" strokeWidth={2} dot={{fill:'#38BDF8',r:3}}/>
                </LineChart></ResponsiveContainer>
              </div>

              {/* Receiving or Passing specific */}
              <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,padding:12}}>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:1,marginBottom:8}}>
                  {pl.pos==="QB" ? "INTERCEPTIONS" : "RECEPTIONS"}
                </div>
                <ResponsiveContainer width="100%" height={180}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/><XAxis dataKey="year"/><YAxis/><Tooltip content={<TT/>}/>
                  {pl.pos==="QB" ?
                    <Bar dataKey="INT" fill="#F43F5E" radius={[3,3,0,0]}/> :
                    <Bar dataKey="Receptions" fill="#A78BFA" radius={[3,3,0,0]}/>}
                </BarChart></ResponsiveContainer>
              </div>
            </div>

            {/* STAT TABLE */}
            <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,padding:12,overflowX:'auto'}}>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:1,marginBottom:8}}>CAREER STATS (2017-2025)</div>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}><thead><tr style={{borderBottom:'2px solid var(--bd)'}}>
                <th style={th}>Year</th><th style={th}>GP</th>
                <th style={th}>Pass Yd</th><th style={th}>P-TD</th><th style={th}>INT</th>
                <th style={th}>Rush Yd</th><th style={th}>R-TD</th>
                <th style={th}>Rec</th><th style={th}>Rec Yd</th><th style={th}>Re-TD</th>
                <th style={th}>FPTS</th>
              </tr></thead>
              <tbody>{seasons.map(([y,s])=><tr key={y} onClick={()=>setYr(y)} style={{borderBottom:'1px solid var(--bd)',cursor:'pointer',background:ay===y?'rgba(249,115,22,.06)':'transparent'}}>
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
const Teams = ({sel,setSel,players,goP}) => {
  const[conf,setConf]=useState("ALL");
  const t = TM[sel];
  const roster = players.filter(p=>p.tm===sel);
  const afcT = new Set(ALL_AB.filter(ab=>TM[ab].conf==="AFC"));
  const filt = conf==="ALL"?ALL_AB:ALL_AB.filter(ab=>conf==="AFC"?afcT.has(ab):!afcT.has(ab));

  return <div className="fu" style={{maxWidth:1320,margin:'0 auto',padding:'20px 16px'}}><div style={{display:'grid',gridTemplateColumns:'260px 1fr',gap:16}}>
    <div>
      <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,padding:10,marginBottom:8}}><div style={{display:'flex',gap:3}}>{["ALL","AFC","NFC"].map(c=><button key={c} onClick={()=>setConf(c)} style={{flex:1,padding:'4px',borderRadius:6,border:'none',background:conf===c?'var(--em)':'rgba(255,255,255,.05)',color:conf===c?'#000':'var(--tx)',fontWeight:conf===c?800:500,fontSize:11,cursor:'pointer'}}>{c}</button>)}</div></div>
      <div style={{maxHeight:'calc(100vh - 180px)',overflowY:'auto',display:'flex',flexDirection:'column',gap:3}}>
        {filt.map(ab=>{const cnt=players.filter(p=>p.tm===ab).length;return<div key={ab} onClick={()=>setSel(ab)} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:8,cursor:'pointer',background:sel===ab?`${TM[ab].c1}18`:'var(--s1)',border:`1px solid ${sel===ab?TM[ab].c1+'44':'var(--bd)'}`}}><Logo ab={ab} sz={28}/><div style={{flex:1}}><div style={{fontWeight:700,fontSize:11}}>{TM[ab].c} {TM[ab].n}</div><div style={{color:'var(--dm)',fontSize:9}}>{cnt} offensive players</div></div></div>})}
      </div>
    </div>
    <div>{!t?<div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,padding:50,textAlign:'center'}}><h2 style={{fontFamily:"'Bebas Neue'"}}>SELECT A TEAM</h2></div>:
      <div className="fu">
        <div style={{background:`linear-gradient(135deg,${t.c1}20,var(--s1))`,border:'1px solid var(--bd)',borderRadius:12,padding:16,marginBottom:10,display:'flex',alignItems:'center',gap:14}}><Logo ab={sel} sz={56}/><div><h2 style={{fontFamily:"'Bebas Neue'",fontSize:28,letterSpacing:2}}>{t.c} {t.n}</h2><div style={{color:'var(--dm)',fontSize:12}}>{t.conf} {t.div} • {roster.length} offensive players</div></div></div>
        {["QB","RB","WR","TE"].map(pos=>{const group=roster.filter(p=>p.pos===pos);if(!group.length)return null;return<div key={pos} style={{marginBottom:12}}>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:1,marginBottom:6,color:posColor(pos)}}>{pos}s ({group.length})</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:6}}>
            {group.map(p=><div key={p.id} onClick={()=>goP(p.id)} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:8,cursor:'pointer',background:'rgba(0,0,0,.2)',border:'1px solid var(--bd)',transition:'all .12s'}} onMouseEnter={e=>e.currentTarget.style.borderColor=t.c1} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--bd)'}><Hs src={p.hs} sz={32}/><div><div style={{fontWeight:700,fontSize:12}}>{p.nm}</div><div style={{color:'var(--dm)',fontSize:10}}>#{p.n}{p.age?` • ${p.age}yr`:""}</div></div></div>)}
          </div>
        </div>})}
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
  return <div className="fu" style={{maxWidth:1320,margin:'0 auto',padding:'20px 16px'}}>
    <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <h2 style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:1}}>GAME DATABASE <Pil ch="LIVE ESPN API" c="var(--lm)" s={{marginLeft:8,fontSize:9}}/></h2>
        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>{[2017,2018,2019,2020,2021,2022,2023,2024,2025].map(s=><button key={s} onClick={()=>{setSzn(s);setWk(1)}} style={{padding:'4px 10px',borderRadius:6,border:'none',background:szn===s?'var(--em)':'rgba(255,255,255,.05)',color:szn===s?'#000':'var(--tx)',fontWeight:szn===s?800:500,fontSize:11,cursor:'pointer'}}>{s}</button>)}</div>
      </div>
      <div style={{display:'flex',gap:4,marginTop:8,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{display:'flex',gap:3,marginRight:8}}>{[{l:"Regular",v:2},{l:"Playoffs",v:3}].map(t=><button key={t.v} onClick={()=>{setSType(t.v);setWk(1)}} style={{padding:'4px 10px',borderRadius:6,border:'none',background:sType===t.v?'var(--sk)':'rgba(255,255,255,.04)',color:sType===t.v?'#000':'var(--dm)',fontWeight:sType===t.v?700:400,fontSize:11,cursor:'pointer'}}>{t.l}</button>)}</div>
        {Array.from({length:maxWk},(_,i)=>i+1).map(w=><button key={w} onClick={()=>setWk(w)} style={{padding:'3px 8px',borderRadius:5,border:'none',background:wk===w?'var(--em)':'rgba(255,255,255,.03)',color:wk===w?'#000':'var(--dm)',fontWeight:wk===w?800:400,fontSize:10,cursor:'pointer',minWidth:28}}>W{w}</button>)}
      </div>
    </div>
    {loading&&<Spinner msg="Loading from ESPN..."/>}
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {games.map(g=>{
        const c=g.competitions?.[0];if(!c)return null;
        const home=c.competitors?.find(x=>x.homeAway==="home");const away=c.competitors?.find(x=>x.homeAway==="away");
        if(!home||!away)return null;
        const hAb=home.team?.abbreviation;const aAb=away.team?.abbreviation;const hS=+home.score;const aS=+away.score;
        return<div key={g.id} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,padding:14}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:8,flexWrap:'wrap',gap:4}}>
            <Pil ch={g.shortName||g.name||`Week ${wk}`} c="var(--sk)"/><span style={{color:'var(--dm)',fontSize:11}}>{g.date?new Date(g.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):''}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <div style={{display:'flex',alignItems:'center',gap:6,flex:1}}><Logo ab={aAb} sz={32} onClick={()=>goT(aAb)}/><span style={{fontWeight:700,fontSize:12}}>{away.team?.displayName||aAb}</span><span style={{fontFamily:"'Bebas Neue'",fontSize:28,letterSpacing:1,marginLeft:'auto',color:aS>hS?'var(--lm)':'var(--tx)'}}>{aS}</span></div>
            <span style={{color:'var(--dm)',fontSize:11}}>@</span>
            <div style={{display:'flex',alignItems:'center',gap:6,flex:1}}><span style={{fontFamily:"'Bebas Neue'",fontSize:28,letterSpacing:1,color:hS>aS?'var(--lm)':'var(--tx)'}}>{hS}</span><span style={{fontWeight:700,fontSize:12,marginRight:'auto'}}>{home.team?.displayName||hAb}</span><Logo ab={hAb} sz={32} onClick={()=>goT(hAb)}/></div>
          </div>
          {c.venue&&<div style={{color:'var(--dm)',fontSize:10,marginTop:6}}>{c.venue.fullName}</div>}
        </div>
      })}
      {!loading&&games.length===0&&<div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,padding:30,textAlign:'center',color:'var(--dm)'}}>No games found for this selection.</div>}
    </div>
  </div>;
};

// ═══════════════════════════════════════════════════════════════
//  BRACKETS
// ═══════════════════════════════════════════════════════════════
const BG = ({a,h,as,hs,goT}) => (
  <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:8,padding:'6px 8px',minWidth:155,fontSize:11}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6}}><div style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}} onClick={()=>goT(a)}><Logo ab={a} sz={18}/><span style={{fontWeight:as>hs?800:400}}>{a}</span></div><span style={{fontFamily:"'Bebas Neue'",fontSize:16,color:as>hs?'var(--lm)':'var(--dm)'}}>{as}</span></div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6,marginTop:3}}><div style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}} onClick={()=>goT(h)}><Logo ab={h} sz={18}/><span style={{fontWeight:hs>as?800:400}}>{h}</span></div><span style={{fontFamily:"'Bebas Neue'",fontSize:16,color:hs>as?'var(--lm)':'var(--dm)'}}>{hs}</span></div>
  </div>
);

const Brackets = ({goT}) => {
  const[yr,setYr]=useState(2024);const b=BK[yr];if(!b)return null;
  const rn = r=>r==="WC"?"Wild Card":r==="DIV"?"Divisional":"Championship";
  return <div className="fu" style={{maxWidth:1320,margin:'0 auto',padding:'20px 16px'}}>
    <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,padding:14,marginBottom:14}}>
      <h2 style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:1,marginBottom:8}}>PLAYOFF BRACKETS</h2>
      <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>{Object.keys(BK).sort((a,b)=>+b-+a).map(y=><button key={y} onClick={()=>setYr(+y)} style={{padding:'5px 12px',borderRadius:6,border:'none',background:yr===+y?'var(--em)':'rgba(255,255,255,.05)',color:yr===+y?'#000':'var(--tx)',fontWeight:yr===+y?800:500,fontSize:12,cursor:'pointer'}}>{y}</button>)}</div>
    </div>
    <div style={{background:'var(--s1)',border:'1px solid rgba(245,158,11,.2)',borderRadius:14,padding:16,marginBottom:14,textAlign:'center'}}>
      <Pil ch={`SUPER BOWL • ${yr} SEASON`} c="var(--gd)" s={{marginBottom:10,display:'inline-flex'}}/>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:16,marginBottom:6}}>
        <div style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}} onClick={()=>goT(b.sb.a)}><Logo ab={b.sb.a} sz={40}/><span style={{fontFamily:"'Bebas Neue'",fontSize:36,color:b.sb.as>b.sb.hs?'var(--lm)':'var(--tx)'}}>{b.sb.as}</span></div>
        <span style={{color:'var(--dm)'}}>vs</span>
        <div style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}} onClick={()=>goT(b.sb.h)}><span style={{fontFamily:"'Bebas Neue'",fontSize:36,color:b.sb.hs>b.sb.as?'var(--lm)':'var(--tx)'}}>{b.sb.hs}</span><Logo ab={b.sb.h} sz={40}/></div>
      </div>
      {b.sb.mvp&&<Pil ch={`MVP: ${b.sb.mvp}`} c="var(--lm)"/>}
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
      {[{l:"AFC",d:b.afc,c:"var(--rs)"},{l:"NFC",d:b.nfc,c:"var(--sk)"}].map(conf=>(
        <div key={conf.l} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,padding:14}}>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:1,marginBottom:10,color:conf.c}}>{conf.l} BRACKET</div>
          {conf.d?.map((rd,ri)=><div key={ri} style={{marginBottom:12}}>
            <div style={{fontSize:10,color:'var(--dm)',fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:6,fontFamily:"'Barlow Condensed'"}}>{rn(rd.rd)}</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{rd.m.map((g,gi)=><BG key={gi} a={g.a} h={g.h} as={g.as} hs={g.hs} goT={goT}/>)}</div>
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

function calcPreds(players, statsCache, standings) {
  const maxHist = Math.max(...ALL_AB.map(ab => {
    const h = HIST[ab] || {};
    return (h.recentScore||0) + (h.sbWins||0) + (h.deepRuns||0);
  }));

  return ALL_AB.map(ab => {
    const roster  = players.filter(p => p.tm === ab);
    const h       = HIST[ab] || {};
    const stand   = standings[ab] || null;

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

    // 2024 actual wins anchor (if loaded)
    const actualW24 = stand ? stand.wins : null;

    // Combined score 0–10 (history 35%, roster 45%, last-season record 20%)
    const recScore = actualW24 !== null ? (actualW24 / 17) * 10 : histScore;
    const score = histScore * 0.35 + rosterScore * 0.45 + recScore * 0.20;

    // Project wins: anchor off actual 2024 record when available, else score-based
    const base24 = actualW24 !== null ? actualW24 : 4 + score * 1.1;
    const p25 = Math.round(Math.min(15, Math.max(3, base24 * 0.92 + score * 0.18)));
    const p26 = Math.round(Math.min(15, Math.max(3, p25 * 0.93 + score * 0.12)));
    const p27 = Math.round(Math.min(15, Math.max(3, p26 * 0.91 + score * 0.10)));

    const tier = score >= 7 ? "Contender" : score >= 5 ? "Playoff" : score >= 3 ? "Rebuild" : "Bottom";
    const sbOdds = Math.round(Math.max(1, Math.min(35, score * score * 0.35)));

    return {
      ab, score: +score.toFixed(1),
      histScore: +histScore.toFixed(1), rosterScore: +rosterScore.toFixed(1),
      qbScore: +qbScore.toFixed(1), rbScore: +rbScore.toFixed(1),
      wrScore: +wrScore.toFixed(1), teScore: +teScore.toFixed(1),
      actualW24, tier, p25, p26, p27, sbOdds, hasStats,
    };
  });
}

const Predictions = ({goT, players, statsCache, setStatsCache}) => {
  const [sortBy,    setSortBy]    = useState("score");
  const [standings, setStandings] = useState({});
  const [fetching,  setFetching]  = useState(false);   // background stat fetch
  const [fetchDone, setFetchDone] = useState(false);
  const [progress,  setProgress]  = useState(0);       // 0–100

  // Fetch real 2024 standings from ESPN on mount
  useEffect(() => {
    espn(`${SITE}/standings?season=2024`).then(d => {
      const map = {};
      const groups = d?.standings?.entries || d?.children?.flatMap(c => c.standings?.entries || []) || [];
      // Try nested structure
      const extract = (entries) => {
        for (const e of entries) {
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
      setStandings(map);
    });
  }, []);

  // Auto-fetch stats for QB+top RB+top WR of every team (1 key player each) so
  // roster scores aren't all zero on first load. Runs once when players are ready.
  useEffect(() => {
    if (fetchDone || players.length === 0) return;
    setFetching(true);
    // Pick the #1 QB, top 2 WRs, top RB per team = ~120 players max
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

    // Fetch in batches of 8 to avoid flooding the API
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
      for (let i = 0; i < keyPlayers.length; i += 8) {
        await runBatch(keyPlayers.slice(i, i + 8));
      }
      setFetching(false);
      setFetchDone(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, fetchDone]);

  const preds  = useMemo(() => calcPreds(players, statsCache, standings), [players, statsCache, standings]);
  const sorted = useMemo(() => {
    const c = [...preds];
    if (sortBy === "score")  return c.sort((a,b) => b.score - a.score);
    if (sortBy === "p25")    return c.sort((a,b) => b.p25 - a.p25);
    if (sortBy === "hist")   return c.sort((a,b) => b.histScore - a.histScore);
    if (sortBy === "roster") return c.sort((a,b) => b.rosterScore - a.rosterScore);
    if (sortBy === "sb")     return c.sort((a,b) => b.sbOdds - a.sbOdds);
    if (sortBy === "w24")    return c.sort((a,b) => (b.actualW24||0) - (a.actualW24||0));
    return c;
  }, [preds, sortBy]);

  const tc = {Contender:"var(--lm)", Playoff:"var(--gd)", Rebuild:"var(--em)", Bottom:"var(--rs)"};
  const hasStandings = Object.keys(standings).length > 0;

  const ScoreBar = ({val, max=10, color="var(--em)"}) => (
    <div style={{display:'flex', alignItems:'center', gap:6}}>
      <div style={{flex:1, height:5, background:'rgba(255,255,255,.06)', borderRadius:99, overflow:'hidden'}}>
        <div style={{width:`${Math.min(100,(val/max)*100)}%`, height:'100%', background:color, borderRadius:99, transition:'width .5s'}}/>
      </div>
      <span style={{fontSize:10, color:'var(--dm)', minWidth:22, textAlign:'right'}}>{val}</span>
    </div>
  );

  const SortBtn = ({id, label}) => (
    <button onClick={() => setSortBy(id)} style={{padding:'4px 10px', borderRadius:6, border:'none', background:sortBy===id?'var(--em)':'rgba(255,255,255,.05)', color:sortBy===id?'#000':'var(--dm)', fontWeight:sortBy===id?800:500, fontSize:10, cursor:'pointer', whiteSpace:'nowrap'}}>
      {label}
    </button>
  );

  return <div className="fu" style={{maxWidth:1320, margin:'0 auto', padding:'20px 16px'}}>

    {/* Header */}
    <div style={{background:'var(--s1)', border:'1px solid var(--bd)', borderRadius:12, padding:16, marginBottom:14}}>
      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:10}}>
        <div>
          <h2 style={{fontFamily:"'Bebas Neue'", fontSize:22, letterSpacing:1, marginBottom:4}}>2025–2027 WIN PROJECTIONS</h2>
          <p style={{color:'var(--dm)', fontSize:12, maxWidth:580, lineHeight:1.5}}>
            <span style={{color:'var(--vi)'}}>35%</span> playoff history (2017–24) · <span style={{color:'var(--sk)'}}>45%</span> roster quality · <span style={{color:'var(--lm)'}}>20%</span> 2024 record{hasStandings ? " ✓" : " (loading…)"}.
            Fetching key player stats automatically to power roster scores.
          </p>
        </div>
        <div style={{display:'flex', gap:4, flexWrap:'wrap', alignItems:'center'}}>
          <span style={{fontSize:10, color:'var(--dm)', marginRight:2}}>Sort:</span>
          <SortBtn id="score"  label="Overall"/>
          <SortBtn id="p25"    label="2025 W"/>
          <SortBtn id="w24"    label="2024 W"/>
          <SortBtn id="hist"   label="History"/>
          <SortBtn id="roster" label="Roster"/>
          <SortBtn id="sb"     label="SB %"/>
        </div>
      </div>

      {/* Progress bar */}
      {fetching && (
        <div style={{marginTop:12}}>
          <div style={{display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--dm)', marginBottom:4}}>
            <span>Fetching player stats to power predictions…</span>
            <span>{progress}%</span>
          </div>
          <div style={{height:4, background:'rgba(255,255,255,.06)', borderRadius:99, overflow:'hidden'}}>
            <div style={{width:`${progress}%`, height:'100%', background:'linear-gradient(90deg,var(--em),var(--gd))', borderRadius:99, transition:'width .3s'}}/>
          </div>
        </div>
      )}
    </div>

    {/* Tier summary cards */}
    <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14}}>
      {["Contender","Playoff","Rebuild","Bottom"].map(tier => {
        const tms = sorted.filter(p => p.tier === tier);
        return <div key={tier} style={{background:'var(--s1)', border:'1px solid var(--bd)', borderRadius:12, padding:12, borderTop:`3px solid ${tc[tier]}`}}>
          <div style={{fontSize:9, color:tc[tier], fontWeight:700, textTransform:'uppercase', letterSpacing:1}}>{tier}</div>
          <div style={{fontFamily:"'Bebas Neue'", fontSize:28, marginTop:2, marginBottom:6, color:tc[tier]}}>{tms.length}</div>
          <div style={{display:'flex', flexWrap:'wrap', gap:3}}>{tms.map(t => <Logo key={t.ab} ab={t.ab} sz={22} onClick={()=>goT(t.ab)}/>)}</div>
        </div>;
      })}
    </div>

    {/* Main table */}
    <div style={{background:'var(--s1)', border:'1px solid var(--bd)', borderRadius:12, overflow:'hidden'}}>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse', fontSize:11}}>
          <thead>
            <tr style={{borderBottom:'2px solid var(--bd)', background:'rgba(0,0,0,.25)'}}>
              <th style={{...th, width:30}}>#</th>
              <th style={th}>Team</th>
              <th style={th}>Tier</th>
              <th style={{...th, width:120}}>Score</th>
              <th style={{...th, width:100}}>History</th>
              <th style={{...th, width:100}}>Roster</th>
              <th style={{...th, width:85}}>QB/WR/RB</th>
              <th style={{...th, width:50, textAlign:'center'}}>2024 W</th>
              <th style={{...th, width:55, textAlign:'center'}}>2025</th>
              <th style={{...th, width:55, textAlign:'center'}}>2026</th>
              <th style={{...th, width:55, textAlign:'center'}}>2027</th>
              <th style={{...th, width:52, textAlign:'center'}}>SB %</th>
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

                  <td style={{...td, color:'var(--dm)', fontWeight:700, fontSize:10}}>{i+1}</td>

                  <td style={td}>
                    <div style={{display:'flex', alignItems:'center', gap:7}}>
                      <Logo ab={p.ab} sz={26}/>
                      <div>
                        <div style={{fontWeight:800, fontSize:12}}>{p.ab}</div>
                        <div style={{color:'var(--dm)', fontSize:9, whiteSpace:'nowrap'}}>{TM[p.ab]?.c} {TM[p.ab]?.n}</div>
                      </div>
                    </div>
                  </td>

                  <td style={td}><Pil ch={p.tier} c={tc[p.tier]}/></td>

                  <td style={td}><ScoreBar val={p.score} color={teamColor}/></td>
                  <td style={td}><ScoreBar val={p.histScore} color="var(--vi)"/></td>
                  <td style={td}><ScoreBar val={p.rosterScore} color="var(--sk)"/></td>

                  <td style={td}>
                    <div style={{display:'flex', gap:3}}>
                      <span style={{background:'rgba(249,115,22,.15)', color:'var(--em)', borderRadius:4, padding:'2px 5px', fontSize:9, fontWeight:700, fontFamily:"'Bebas Neue'", letterSpacing:.5}}>QB {p.qbScore}</span>
                      <span style={{background:'rgba(56,189,248,.15)',  color:'var(--sk)', borderRadius:4, padding:'2px 5px', fontSize:9, fontWeight:700, fontFamily:"'Bebas Neue'", letterSpacing:.5}}>WR {p.wrScore}</span>
                      <span style={{background:'rgba(34,197,94,.15)',   color:'var(--lm)', borderRadius:4, padding:'2px 5px', fontSize:9, fontWeight:700, fontFamily:"'Bebas Neue'", letterSpacing:.5}}>RB {p.rbScore}</span>
                    </div>
                  </td>

                  {/* 2024 actual record */}
                  <td style={{...td, textAlign:'center'}}>
                    {p.actualW24 !== null
                      ? <span style={{fontFamily:"'Bebas Neue'", fontSize:16, color: p.actualW24>=10?'var(--lm)':p.actualW24>=7?'var(--gd)':'var(--rs)'}}>{p.actualW24}-{standings[p.ab]?.losses??""}</span>
                      : <span style={{color:'var(--dm)', fontSize:10}}>—</span>}
                  </td>

                  {/* Projected wins */}
                  <td style={{...td, textAlign:'center', fontFamily:"'Bebas Neue'", fontSize:20, fontWeight:900, color:'var(--tx)'}}>{p.p25}</td>
                  <td style={{...td, textAlign:'center', fontFamily:"'Bebas Neue'", fontSize:17, color:'var(--dm)'}}>{p.p26}</td>
                  <td style={{...td, textAlign:'center', fontFamily:"'Bebas Neue'", fontSize:15, color:'rgba(232,236,248,.3)'}}>{p.p27}</td>

                  {/* SB donut */}
                  <td style={{...td, textAlign:'center'}}>
                    <div style={{display:'inline-flex', alignItems:'center', justifyContent:'center', width:32, height:32, borderRadius:'50%', background:`conic-gradient(var(--gd) ${p.sbOdds*3.6}deg, rgba(255,255,255,.06) 0)`, position:'relative'}}>
                      <div style={{position:'absolute', inset:4, borderRadius:'50%', background:'var(--s1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:7, fontWeight:800, color:'var(--gd)'}}>{p.sbOdds}%</div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

    <div style={{marginTop:10, color:'var(--dm)', fontSize:10, padding:'0 4px', lineHeight:1.6}}>
      * History: 2017–2024 playoff results (recency-weighted) · Roster: top-player fantasy-point averages · 2024 record from ESPN standings · SB % is relative, not absolute.
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

  // Fetch all rosters on mount
  useEffect(()=>{
    fetchAllRosters().then(pl=>{
      setPlayers(pl);
      setLoading(false);
    });
  },[]);

  const go = t=>{setTab(t);window.scrollTo(0,0)};
  const goT = ab=>{setSelT(ab);setTab("Teams");window.scrollTo(0,0)};
  const goP = id=>{setSelP(id);setTab("Players");window.scrollTo(0,0)};

  return <div><style>{CSS}</style><Nav tab={tab} go={go}/>
    {tab==="Home"&&<Home go={go} goT={goT} players={players} loading={loading}/>}
    {tab==="Players"&&<Players players={players} loading={loading} sel={selP} setSel={setSelP} goT={goT} statsCache={statsCache} setStatsCache={setStatsCache}/>}
    {tab==="Teams"&&<Teams sel={selT} setSel={setSelT} players={players} goP={goP}/>}
    {tab==="Games"&&<GamesFetch goT={goT}/>}
    {tab==="Brackets"&&<Brackets goT={goT}/>}
    {tab==="Predictions"&&<Predictions goT={goT} players={players} statsCache={statsCache} setStatsCache={setStatsCache}/>}
    <div style={{textAlign:'center',padding:'20px 16px',color:'var(--dm)',fontSize:10,borderTop:'1px solid var(--bd)',marginTop:30}}>
      <span style={{fontFamily:"'Bebas Neue'",letterSpacing:1}}>GRIDIRON INTEL</span> • Powered by ESPN Public API • Real-time data from site.api.espn.com
    </div>
  </div>;
}
