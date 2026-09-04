const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// player_stat_history is append-only: every lookup adds a new row so we can
// diff a player's lifetime totals against an older snapshot to get windowed
// (24h/7d/30d/90d/365d) stats. battle_type ("pvp"/"solo"/"div2"/"div3"/"rank"/"coop")
// tags which battle-type tab the snapshot came from, since each is tracked separately.
// Created/migrated here (rather than requiring a manual migration like player_winrates)
// since it's new and additive.
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
     ALTER TABLE player_stat_history
       ADD COLUMN IF NOT EXISTS battle_type TEXT NOT NULL DEFAULT 'pvp';
     DROP INDEX IF EXISTS player_stat_history_account_time_idx;
     CREATE INDEX IF NOT EXISTS player_stat_history_account_type_time_idx
       ON player_stat_history (account_id, battle_type, recorded_at);`,
  )
  .catch((err) =>
    console.error("Error ensuring player_stat_history table:", err.message),
  );

// player_ship_stat_history mirrors player_stat_history but per-ship, so PR (which needs a
// per-ship actual-vs-expected comparison, not just whole-account totals) can be windowed
// and charted the same way winrate/damage/KEI are. Populated whenever ship stats are
// fetched (see recordShipStatSnapshot), gated by the same SNAPSHOT_INTERVAL_MS below —
// every row inserted in one snapshot batch shares the same recorded_at, so a batch can be
// looked back up by (account_id, battle_type, recorded_at).
pool
  .query(
    `CREATE TABLE IF NOT EXISTS player_ship_stat_history (
       id                SERIAL PRIMARY KEY,
       account_id        BIGINT NOT NULL,
       username          TEXT NOT NULL,
       battle_type       TEXT NOT NULL,
       ship_id           BIGINT NOT NULL,
       battles           INTEGER NOT NULL,
       wins              INTEGER NOT NULL,
       damage_dealt      BIGINT NOT NULL,
       frags             INTEGER NOT NULL,
       recorded_at       TIMESTAMP NOT NULL DEFAULT now()
     );
     CREATE INDEX IF NOT EXISTS player_ship_stat_history_account_type_time_idx
       ON player_ship_stat_history (account_id, battle_type, recorded_at);`,
  )
  .catch((err) =>
    console.error("Error ensuring player_ship_stat_history table:", err.message),
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

// minimum time between recorded snapshots for a given player, so the winrate-over-time
// history doesn't grow on every single lookup, and so windowed stats don't lose accuracy
// to lots of near-duplicate rows
const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000;

// appends a snapshot of a player's cumulative stats for one battle type (used for
// windowed deltas and the winrate-over-time graph), but only if the last recorded
// snapshot for that battle type is over an hour old. returns whether a new snapshot was
// actually recorded, so callers can tell the difference between "just updated" and
// "already up to date"
async function recordStatSnapshot(accountId, username, battleType, pvp) {
  const last = await pool.query(
    `SELECT recorded_at FROM player_stat_history WHERE account_id = $1 AND battle_type = $2 ORDER BY recorded_at DESC LIMIT 1`,
    [accountId, battleType],
  );
  const lastRecordedAt = last.rows[0]?.recorded_at;
  if (lastRecordedAt && Date.now() - lastRecordedAt.getTime() < SNAPSHOT_INTERVAL_MS) {
    return false;
  }

  await pool.query(
    `INSERT INTO player_stat_history
       (account_id, username, battle_type, battles, wins, losses, draws, survived_battles, damage_dealt, damage_scouting, frags, xp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      accountId,
      username,
      battleType,
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
  return true;
}

// the full history of a player's lifetime winrate, average damage, and KEI at each
// recorded snapshot for one battle type, for the player page's Charts card. PR isn't
// included here since it needs per-ship totals — see player_ship_stat_history and
// getShipStatHistory below.
async function getStatHistory(accountId, battleType) {
  const result = await pool.query(
    `SELECT battles, wins, damage_dealt, damage_scouting, recorded_at
     FROM player_stat_history
     WHERE account_id = $1 AND battle_type = $2 AND battles > 0
     ORDER BY recorded_at ASC`,
    [accountId, battleType],
  );
  return result.rows.map((row) => {
    const winrate = row.wins / row.battles;
    return {
      recordedAt: row.recorded_at,
      battles: row.battles,
      winrate,
      avgDamage: row.damage_dealt / row.battles,
      kei: row.damage_scouting / row.battles / 1000 + winrate * 100,
    };
  });
}

// appends a per-ship snapshot batch for one battle type (one row per ship the player has
// battles in), but only if the last recorded batch for that battle type is over an hour
// old — same gating as recordStatSnapshot, kept independent since ship stats are fetched
// from a different route than whole-account stats. statsField is the key holding this
// battle type's stats on each ship object (e.g. "pvp", "pvp_solo").
async function recordShipStatSnapshot(accountId, username, battleType, ships, statsField) {
  const last = await pool.query(
    `SELECT recorded_at FROM player_ship_stat_history WHERE account_id = $1 AND battle_type = $2 ORDER BY recorded_at DESC LIMIT 1`,
    [accountId, battleType],
  );
  const lastRecordedAt = last.rows[0]?.recorded_at;
  if (lastRecordedAt && Date.now() - lastRecordedAt.getTime() < SNAPSHOT_INTERVAL_MS) {
    return false;
  }

  const played = ships.filter((ship) => ship[statsField]?.battles > 0);
  if (played.length === 0) return false;

  const params = [];
  const rows = played.map((ship, i) => {
    const s = ship[statsField];
    const base = i * 8;
    params.push(accountId, username, battleType, ship.ship_id, s.battles, s.wins, s.damage_dealt, s.frags);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
  });

  await pool.query(
    `INSERT INTO player_ship_stat_history
       (account_id, username, battle_type, ship_id, battles, wins, damage_dealt, frags)
     VALUES ${rows.join(", ")}`,
    params,
  );
  return true;
}

// the full per-snapshot history of a player's per-ship totals for one battle type, grouped
// into batches by recorded_at, for the player page's PR-over-time chart
async function getShipStatHistory(accountId, battleType) {
  const result = await pool.query(
    `SELECT ship_id, battles, wins, damage_dealt, frags, recorded_at
     FROM player_ship_stat_history
     WHERE account_id = $1 AND battle_type = $2
     ORDER BY recorded_at ASC`,
    [accountId, battleType],
  );

  const batches = new Map();
  for (const row of result.rows) {
    const key = row.recorded_at.getTime();
    if (!batches.has(key)) batches.set(key, { recordedAt: row.recorded_at, ships: [] });
    batches.get(key).ships.push({
      shipId: row.ship_id,
      battles: row.battles,
      wins: row.wins,
      // pg returns BIGINT as a string to avoid precision loss; Number() is safe here since
      // per-ship damage totals are nowhere near Number.MAX_SAFE_INTEGER
      damageDealt: Number(row.damage_dealt),
      frags: row.frags,
    });
  }
  return Array.from(batches.values());
}

// per-ship equivalent of getStatWindows: for each supported window, finds the most recent
// per-ship snapshot batch at or before "now - window" (falling back to the earliest batch,
// flagged approximate, the same way getStatWindows does) and returns its per-ship totals
// keyed by ship_id, so the client can diff them against currently-loaded live ship stats to
// get an exact windowed PR. The baseline's recorded_at is matched back to its rows entirely
// in SQL (a self-join, not a value round-tripped through JS) since TIMESTAMP has more
// precision than a JS Date can hold — comparing recorded_at = <a Date param> can silently
// miss the row it came from.
async function getShipStatWindows(accountId, battleType) {
  const windows = {};

  await Promise.all(
    Object.entries(STAT_WINDOW_RANGES).map(async ([key, interval]) => {
      const result = await pool.query(
        `WITH cutoff AS (
           SELECT recorded_at FROM player_ship_stat_history
           WHERE account_id = $1 AND battle_type = $2 AND recorded_at <= now() - interval '${interval}'
           ORDER BY recorded_at DESC LIMIT 1
         ),
         earliest AS (
           SELECT recorded_at FROM player_ship_stat_history
           WHERE account_id = $1 AND battle_type = $2
           ORDER BY recorded_at ASC LIMIT 1
         ),
         baseline AS (
           SELECT
             COALESCE((SELECT recorded_at FROM cutoff), (SELECT recorded_at FROM earliest)) AS recorded_at,
             (SELECT recorded_at FROM cutoff) IS NULL AS approximate
         )
         SELECT s.ship_id, s.battles, s.wins, s.damage_dealt, s.frags, b.recorded_at, b.approximate
         FROM baseline b
         JOIN player_ship_stat_history s
           ON s.account_id = $1 AND s.battle_type = $2 AND s.recorded_at = b.recorded_at`,
        [accountId, battleType],
      );

      if (result.rows.length === 0) {
        windows[key] = { available: false };
        return;
      }

      const ships = {};
      for (const row of result.rows) {
        ships[row.ship_id] = {
          battles: row.battles,
          wins: row.wins,
          // pg returns BIGINT as a string — normalize here so nothing downstream has to
          damageDealt: Number(row.damage_dealt),
          frags: row.frags,
        };
      }
      windows[key] = {
        available: true,
        approximate: result.rows[0].approximate,
        since: result.rows[0].recorded_at,
        ships,
      };
    }),
  );

  return windows;
}

// time windows supported for per-player windowed stats
const STAT_WINDOW_RANGES = {
  "24h": "1 day",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "365d": "365 days",
};

// for each supported window, finds the most recent snapshot taken at or before "now -
// window" and diffs it against the player's current lifetime totals. If no snapshot is
// old enough yet for a true trailing window (tracking hasn't gone on that long), falls
// back to the EARLIEST snapshot we have at all, so the range still shows real numbers
// instead of locking — just honestly flagged as "approximate" (since-tracking-began)
// rather than a true calendar window, since that's the best data actually available.
async function getStatWindows(accountId, battleType, current) {
  const windows = {};

  const boundsResult = await pool.query(
    `SELECT min(recorded_at) AS earliest, max(recorded_at) AS latest
     FROM player_stat_history WHERE account_id = $1 AND battle_type = $2`,
    [accountId, battleType],
  );
  const trackingSince = boundsResult.rows[0]?.earliest ?? null;
  const latestSnapshot = boundsResult.rows[0]?.latest ?? null;
  const nextSnapshotAt = latestSnapshot
    ? new Date(latestSnapshot.getTime() + SNAPSHOT_INTERVAL_MS)
    : null;

  let earliestSnapshot = null;
  if (trackingSince) {
    const earliestResult = await pool.query(
      `SELECT battles, wins, losses, draws, survived_battles, damage_dealt, damage_scouting, frags, xp, recorded_at
       FROM player_stat_history WHERE account_id = $1 AND battle_type = $2 ORDER BY recorded_at ASC LIMIT 1`,
      [accountId, battleType],
    );
    earliestSnapshot = earliestResult.rows[0];
  }

  await Promise.all(
    Object.entries(STAT_WINDOW_RANGES).map(async ([key, interval]) => {
      const result = await pool.query(
        `SELECT battles, wins, losses, draws, survived_battles, damage_dealt, damage_scouting, frags, xp, recorded_at
         FROM player_stat_history
         WHERE account_id = $1 AND battle_type = $2 AND recorded_at <= now() - interval '${interval}'
         ORDER BY recorded_at DESC
         LIMIT 1`,
        [accountId, battleType],
      );

      let baseline = result.rows[0];
      let approximate = false;
      if (!baseline && earliestSnapshot) {
        baseline = earliestSnapshot;
        approximate = true;
      }

      if (!baseline || current.battles < baseline.battles) {
        windows[key] = {
          available: false,
          reason: "Available once this player has been looked up at least once.",
        };
        return;
      }

      windows[key] = {
        available: true,
        approximate,
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

  return { trackingSince, nextSnapshotAt, windows };
}

module.exports = {
  pool,
  recordWinrate,
  recordStatSnapshot,
  getStatWindows,
  getStatHistory,
  recordShipStatSnapshot,
  getShipStatWindows,
  getShipStatHistory,
};
