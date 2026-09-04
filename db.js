const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// records or refreshes a player's overall winrate
async function recordWinrate(username, winrate, battles) {
  await pool.query(
    `INSERT INTO player_winrates (username, winrate, battles, last_updated)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (username)
     DO UPDATE SET winrate = $2, battles = $3, last_updated = now()`,
    [username, winrate, battles],
  );
}

module.exports = { pool, recordWinrate };
