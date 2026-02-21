# 🏈 Gridiron Intel — NFL Fantasy Football Intelligence Hub

A comprehensive NFL fantasy football analytics dashboard built with **React** and **Recharts**, powered by the **ESPN Public API**.

## Features

- **Player Analysis** — Career stats for top QBs, RBs, WRs, and TEs across 8 NFL seasons (2017–2024)
- **Team Explorer** — All 32 NFL teams with real ESPN logos, 8-year win/loss records, and interactive charts
- **Game Database** — Super Bowls, playoff games, and key regular season matchups with stadium, weather, and stat leaders
- **3-Year Predictions** — Projected win totals for 2025–2027 based on trend analysis and roster quality
- **Live ESPN Integration** — Team logos and player headshots pulled directly from ESPN's CDN

## Tech Stack

- React 18
- Recharts (data visualization)
- Vite (build tool)
- ESPN Public API (team data, logos, headshots)
- GitHub Pages (hosting)

## Data Sources

- Team logos: `a.espncdn.com/i/teamlogos/nfl/500/`
- Player headshots: `a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/`
- Team data: `site.api.espn.com/apis/site/v2/sports/football/nfl/teams`
- Player career stats compiled from public NFL records (2017–2024 seasons)

## Run Locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173` in your browser.

## Deploy

This project auto-deploys to GitHub Pages via the included GitHub Actions workflow. Just push to `main` and it builds and publishes automatically.

## License

MIT
"# gridiron-intel" 
