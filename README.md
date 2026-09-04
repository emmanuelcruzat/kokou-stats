# KokouStats

A [WoWS Numbers](https://wows-numbers.com/)-style stats tracker for *World of Warships*, built as a computer science project. Look up any NA-server player to see their battle record, ship stats, Personal Rating (PR), Kokou's Effectiveness Index (KEI), and more — plus a server-wide winrate distribution built from the players people search for.

## Features

- **Player lookup** — search any NA-server username for their overall stats, broken down by battle type (Random, Solo, Duo Division, Trio Division, Ranked, Co-Op)
- **Charts** — battles by ship class, nation/coalition, and tier, plus a sortable per-ship stats table with winrate color coding
- **PR & KEI** — WoWS Numbers Personal Rating and Kokou's Effectiveness Index, each with their own explanation page
- **Clan info** — clan tag, role, join date, leader, and member count
- **NA Server Stats** — a dashboard showing the server-wide winrate distribution (histogram), average winrate, and average battles played, built from the sample of players who've been looked up on the site, filterable by last 24 hours/7/30/90/365 days or all time
- **Time-windowed player stats** — a specific player's Random Battles page shows a table of Recent/7/30/90/365-day stats (only the ranges that are already unlocked; a "Show Locked Ranges" button reveals the rest as blanked-out rows with their unlock date), computed from KokouStats' own history of that player's stats rather than the Wargaming API (which only exposes lifetime totals). "Recent" is the delta between the two most recently recorded snapshots (as long as they're less than 7 days apart), so it's useful as soon as a second snapshot exists rather than waiting a fixed calendar window
- **Charts card** — line charts of a player's lifetime Winrate, Average Damage, and KEI at each recorded snapshot, plus a PR chart (which can only ever plot today's value — see below), with a countdown to when the next snapshot will be recorded. Replaces the old static "Battle Record" card on the Random Battles tab; other battle types still use that card since they aren't snapshotted
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

`player_stat_history` (used for the time-windowed player stats) is created automatically on startup if it doesn't already exist — no manual migration needed. Its schema:

```sql
CREATE TABLE player_stat_history (
  id                SERIAL PRIMARY KEY,
  account_id        BIGINT NOT NULL,
  username          TEXT NOT NULL,
  battles           INTEGER NOT NULL,
  wins              INTEGER NOT NULL,
  losses            INTEGER NOT NULL,
  draws             INTEGER NOT NULL,
  survived_battles  INTEGER NOT NULL,
  damage_dealt      BIGINT NOT NULL,
  damage_scouting   BIGINT NOT NULL,
  frags             INTEGER NOT NULL,
  xp                BIGINT NOT NULL,
  recorded_at       TIMESTAMP NOT NULL DEFAULT now()
);
```

### Running

```bash
npm start      # production
npm run dev    # development (auto-restarts with nodemon)
```

The site will be available at `http://localhost:3000`.

## How player data collection works

Every time someone looks up a player, that player's overall winrate and battle count are recorded (or refreshed) in `player_winrates`, and a full snapshot of their lifetime Random Battles totals (battles, wins, damage, etc.) is appended to `player_stat_history`. The NA Server Stats page aggregates the `player_winrates` sample — optionally filtered to a time range — to show a winrate distribution, average winrate, and average battles played. **Note**: this is a sample of *looked-up* players, not a true random sample of the entire NA server population, so it may skew toward more active or more frequently searched players.

A player's own page can show "7/30/90/365 days" stats by diffing their current lifetime totals against the oldest snapshot in `player_stat_history` still older than that window. Since the Wargaming API only exposes lifetime totals (there's no official endpoint for arbitrary players' windowed stats), this only works for windows KokouStats has actually tracked history for — a range shows "not enough tracked history yet" until the player has been looked up at least twice with enough time between lookups to span that window. "Recent" works differently: it's the delta between the two most recently recorded snapshots for that player (regardless of the fixed calendar windows above), as long as those two snapshots are less than 7 days apart — otherwise the gap is too stale to call "recent".

To keep `player_stat_history` from growing on every single lookup, a new snapshot is only recorded if the last one for that player is over an hour old (a lookup within that hour still refreshes `player_winrates` and returns the latest stats, it just skips the snapshot). The player page's Charts card plots every recorded snapshot's lifetime Winrate, Average Damage, and KEI (all computable from the totals `player_stat_history` stores), and shows a countdown to when the next snapshot will be due.

PR can't be tracked the same way: it's computed by comparing each ship's actual stats against per-ship expected values, and `player_stat_history` only stores whole-account totals, not a per-ship breakdown at each snapshot. So the PR chart always shows exactly one point — today's live value, recomputed fresh on each visit — rather than growing richer over time like the other three. Tracking real PR history would mean snapshotting every ship's stats (not just the account total), which is a much bigger table.
