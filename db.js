const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// player_stat_history is append-only: every lookup adds a new row so we can
// diff a player's lifetime totals against an older snapshot to get windowed
// (last 24h/7d/30d/90d/365d) stats. Created here (rather than requiring a
// manual migration like player_winrates) since it's new and additive.
pool
  .query(
    `CREATE TABLE IF NOT EXISTS player_stat_history (
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
     CREATE INDEX IF NOT EXISTS player_stat_history_account_time_idx
       ON player_stat_history (account_id, recorded_at);`,
  )
  .catch((err) =>
    console.error("Error ensuring player_stat_history table:", err.message),
  );

// records or refreshes a player's overall winrate (used by the NA Server Stats sample)
async function recordWinrate(username, winrate, battles) {
  await pool.query(
    `INSERT INTO player_winrates (username, winrate, battles, last_updated)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (username)
     DO UPDATE SET winrate = $2, battles = $3, last_updated = now()`,
    [username, winrate, battles],
  );
}

// appends a snapshot of a player's cumulative pvp stats, used to compute windowed deltas later
async function recordStatSnapshot(accountId, username, pvp) {
  await pool.query(
    `INSERT INTO player_stat_history
       (account_id, username, battles, wins, losses, draws, survived_battles, damage_dealt, damage_scouting, frags, xp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      accountId,
      username,
      pvp.battles,
      pvp.wins,
      pvp.losses,
      pvp.draws,
      pvp.survived_battles,
      pvp.damage_dealt,
      pvp.damage_scouting,
      pvp.frags,
      pvp.xp,
    ],
  );
}

// time windows supported for per-player windowed stats
const STAT_WINDOW_RANGES = {
  "24h": "1 day",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "365d": "365 days",
};

// for each supported window, finds the most recent snapshot taken at or before
// "now - window" and diffs it against the player's current lifetime totals
async function getStatWindows(accountId, current) {
  const windows = {};

  await Promise.all(
    Object.entries(STAT_WINDOW_RANGES).map(async ([key, interval]) => {
      const result = await pool.query(
        `SELECT battles, wins, losses, draws, survived_battles, damage_dealt, damage_scouting, frags, xp, recorded_at
         FROM player_stat_history
         WHERE account_id = $1 AND recorded_at <= now() - interval '${interval}'
         ORDER BY recorded_at DESC
         LIMIT 1`,
        [accountId],
      );

      const baseline = result.rows[0];
      if (!baseline || current.battles < baseline.battles) {
        windows[key] = null;
        return;
      }

      windows[key] = {
        battles: current.battles - baseline.battles,
        wins: current.wins - baseline.wins,
        losses: current.losses - baseline.losses,
        draws: current.draws - baseline.draws,
        survived_battles: current.survived_battles - baseline.survived_battles,
        damage_dealt: current.damage_dealt - baseline.damage_dealt,
        damage_scouting: current.damage_scouting - baseline.damage_scouting,
        frags: current.frags - baseline.frags,
        xp: current.xp - baseline.xp,
        since: baseline.recorded_at,
      };
    }),
  );

  return windows;
}

module.exports = {
  pool,
  recordWinrate,
  recordStatSnapshot,
  getStatWindows,
};
