# KokouStats

A [WoWS Numbers](https://wows-numbers.com/)-style stats tracker for *World of Warships*, built as a computer science project. Look up any NA-server player to see their battle record, ship stats, Personal Rating (PR), Kokou's Effectiveness Index (KEI), and more — plus a server-wide winrate distribution built from the players people search for.

## Features

- **Player lookup** — search any NA-server username for their overall stats, broken down by battle type (Random, Solo, Duo Division, Trio Division, Ranked, Co-Op)
- **Charts** — battles by ship class, nation/coalition, and tier, plus a sortable per-ship stats table with winrate color coding
- **PR & KEI** — WoWS Numbers Personal Rating and Kokou's Effectiveness Index, each with their own explanation page
- **Clan info** — clan tag, role, join date, leader, and member count
- **NA Server Stats** — a dashboard showing the server-wide winrate distribution (histogram), average winrate, and average battles played, built from the sample of players who've been looked up on the site
- **Light/dark mode** — theme preference is saved across visits

## Tech stack

- **Backend**: Node.js, Express, Axios (for calls to the Wargaming API)
- **Database**: PostgreSQL (`pg`) — stores recorded player winrates for the NA Server Stats page
- **Frontend**: vanilla HTML/CSS/JS, [Chart.js](https://www.chartjs.org/) for charts

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/)
- [PostgreSQL](https://www.postgresql.org/)
- A [Wargaming API application ID](https://developers.wargaming.net/)

### Installation

```bash
git clone https://github.com/emmanuelcruzat/kokou-stats.git
cd kokou-stats
npm install
```

### Environment variables

Create a `.env` file in the project root:

```
WOWS_API_KEY=your_wargaming_application_id
DATABASE_URL=postgresql://user:password@localhost:5432/kokoustats
```

### Database

Create the database and the table used to track player winrates:

```sql
CREATE TABLE player_winrates (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  winrate       DOUBLE PRECISION NOT NULL,
  battles       INTEGER NOT NULL,
  last_updated  TIMESTAMP DEFAULT now()
);
```

### Running

```bash
npm start      # production
npm run dev    # development (auto-restarts with nodemon)
```

The site will be available at `http://localhost:3000`.

## How player data collection works

Every time someone looks up a player, that player's overall winrate and battle count are recorded (or refreshed) in `player_winrates`. The NA Server Stats page aggregates this growing sample to show a winrate distribution, average winrate, and average battles played. **Note**: this is a sample of *looked-up* players, not a true random sample of the entire NA server population, so it may skew toward more active or more frequently searched players.
