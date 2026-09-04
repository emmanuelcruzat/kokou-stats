require("dotenv").config();
const express = require("express");
const axios = require("axios");
const {
  pool,
  recordWinrate,
  recordStatSnapshot,
  getStatWindows,
  getStatHistory,
  recordShipStatSnapshot,
  getShipStatWindows,
  getShipStatHistory,
  recordCrawlResult,
  getCrawlStatus,
  searchPlayers,
} = require("./db");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// resolves a username to its WoWS account ID and canonical nickname via the account search
// endpoint. The nickname WG returns is the account's one true casing regardless of how the
// request's username was cased — recording that (rather than the raw request param) is what
// keeps the same player from splitting into case-variant duplicate rows in player_winrates.
async function resolveAccount(username) {
  const searchRes = await axios.get(
    `https://api.worldofwarships.com/wows/account/list/?application_id=${process.env.WOWS_API_KEY}&search=${username}`,
  );

  const results = searchRes.data?.data;
  if (!results || results.length === 0) {
    const apiError = searchRes.data?.error;
    throw new Error(
      apiError
        ? `Wargaming API error: ${apiError.message} (field: ${apiError.field ?? "n/a"})`
        : `No NA-server player found matching "${username}"`,
    );
  }

  return { accountId: results[0].account_id, nickname: results[0].nickname };
}

// maps each battle-type mode (as used by the frontend's battle-type tabs) to the
// Wargaming statistics field that holds its stats, and to the battle_type tag used in
// player_stat_history. "pvp" needs no `extra` param since account/info includes it by default.
const BATTLE_TYPE_FIELDS = {
  pvp: "pvp",
  solo: "pvp_solo",
  div2: "pvp_div2",
  div3: "pvp_div3",
  rank: "rank_solo",
  coop: "pve",
};

// the reverse of BATTLE_TYPE_FIELDS: which mode a ships-endpoint `extra` stats field
// belongs to, for tagging per-ship snapshots
const FIELD_TO_BATTLE_TYPE = Object.fromEntries(
  Object.entries(BATTLE_TYPE_FIELDS).map(([mode, field]) => [field, mode]),
);

// resolves a validated battle-type mode from a query param, defaulting to "pvp"
function resolveMode(rawMode) {
  return Object.prototype.hasOwnProperty.call(BATTLE_TYPE_FIELDS, rawMode) ? rawMode : "pvp";
}

// records a stat snapshot for one battle type if the player has battles in it, and
// returns whether a new snapshot was actually recorded
async function recordModeSnapshot(accountId, username, mode, statsField, accountData) {
  const stats = accountData.data.data[accountId]?.statistics?.[statsField];
  if (!stats || stats.battles === 0) return false;
  try {
    return await recordStatSnapshot(accountId, username, mode, stats);
  } catch (err) {
    console.error(`Error recording ${mode} stat snapshot:`, err.message);
    return false;
  }
}

// route to serve the player stats page
app.get("/player/:username", async (req, res) => {
  res.sendFile(__dirname + "/public/player.html");
});

//route to serve the clan stats page
app.get("/clan/:clanId", async (req, res) => {
  res.sendFile(__dirname + "/public/clan.html");
});

// route to serve the NA server stats page
app.get("/na-server", async (req, res) => {
  res.sendFile(__dirname + "/public/na-server.html");
});

// route to serve the about page
app.get("/about", async (req, res) => {
  res.sendFile(__dirname + "/public/about.html");
});

// route to serve the page explaining Kokou's Effectiveness Index (KEI)
app.get("/kei", async (req, res) => {
  res.sendFile(__dirname + "/public/kei.html");
});

// route to serve the page explaining the range table's statistical significance indicator
app.get("/significance", async (req, res) => {
  res.sendFile(__dirname + "/public/significance.html");
});

// API ROUTES
app.get("/api/myip", async (req, res) => {
  const response = await axios.get("https://api.ipify.org?format=json");
  res.json(response.data);
});

// basic route to check if the API is running
app.get("/api", (req, res) => {
  res.send("The kokoustats API is running!");
});

// username-prefix suggestions for the search box, drawn from previously looked-up players
app.get("/api/players/search", async (req, res) => {
  try {
    const query = (req.query.q || "").trim();
    if (query.length < 2) {
      return res.json({ suggestions: [] });
    }
    const suggestions = await searchPlayers(query);
    res.json({ suggestions });
  } catch (err) {
    console.error("Error searching players:", err.message);
    res.status(500).json({ error: "Failed to search players" });
  }
});

//main player data for ALL random battles. additionally throws the data into the postgres database
app.get("/api/player/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const { accountId, nickname } = await resolveAccount(username);
    const accountData = await axios.get(
      `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}`,
    );
    console.log("Account data:", JSON.stringify(accountData.data));

    const pvp = accountData.data.data[accountId]?.statistics?.pvp;
    let snapshotRecorded = false;
    if (pvp && pvp.battles > 0) {
      recordWinrate(nickname, pvp.wins / pvp.battles, pvp.battles).catch(
        (err) => console.error("Error recording winrate:", err.message),
      );
      try {
        snapshotRecorded = await recordStatSnapshot(accountId, nickname, "pvp", pvp);
      } catch (err) {
        console.error("Error recording stat snapshot:", err.message);
      }
    }

    res.json({ ...accountData.data, snapshotRecorded });
  } catch (err) {
    console.error("Error fetching player stats:", err.message);
    console.error("Stack:", err.stack);
    if (err.response)
      console.error("Wargaming response:", JSON.stringify(err.response.data));
    res.status(500).json({ error: "Failed to fetch player stats" });
  }
});

//route for random battle stats (solo)
app.get("/api/player/:username/solo", async (req, res) => {
  try {
    const username = req.params.username;
    const { accountId, nickname } = await resolveAccount(username);
    const accountData = await axios.get(
      `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}&extra=statistics.pvp_solo`,
    );
    console.log("Account data:", JSON.stringify(accountData.data));
    const snapshotRecorded = await recordModeSnapshot(accountId, nickname, "solo", "pvp_solo", accountData);
    res.json({ ...accountData.data, snapshotRecorded });
  } catch (err) {
    console.error("Error fetching player stats:", err.message);
    console.error("Stack:", err.stack);
    if (err.response)
      console.error("Wargaming response:", JSON.stringify(err.response.data));
    res.status(500).json({ error: "Failed to fetch player stats" });
  }
});

//route for random battle stats (division 2)
app.get("/api/player/:username/div2", async (req, res) => {
  try {
    const username = req.params.username;
    const { accountId, nickname } = await resolveAccount(username);
    const accountData = await axios.get(
      `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}&extra=statistics.pvp_div2`,
    );
    console.log("Account data:", JSON.stringify(accountData.data));
    const snapshotRecorded = await recordModeSnapshot(accountId, nickname, "div2", "pvp_div2", accountData);
    res.json({ ...accountData.data, snapshotRecorded });
  } catch (err) {
    console.error("Error fetching player stats:", err.message);
    console.error("Stack:", err.stack);
    if (err.response)
      console.error("Wargaming response:", JSON.stringify(err.response.data));
    res.status(500).json({ error: "Failed to fetch player stats" });
  }
});

//route for random battle stats (division 3)
app.get("/api/player/:username/div3", async (req, res) => {
  try {
    const username = req.params.username;
    const { accountId, nickname } = await resolveAccount(username);
    const accountData = await axios.get(
      `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}&extra=statistics.pvp_div3`,
    );
    console.log("Account data:", JSON.stringify(accountData.data));
    const snapshotRecorded = await recordModeSnapshot(accountId, nickname, "div3", "pvp_div3", accountData);
    res.json({ ...accountData.data, snapshotRecorded });
  } catch (err) {
    console.error("Error fetching player stats:", err.message);
    console.error("Stack:", err.stack);
    if (err.response)
      console.error("Wargaming response:", JSON.stringify(err.response.data));
    res.status(500).json({ error: "Failed to fetch player stats" });
  }
});

//route for ranked battle stats
app.get("/api/player/:username/rank", async (req, res) => {
  try {
    const username = req.params.username;
    const { accountId, nickname } = await resolveAccount(username);
    const accountData = await axios.get(
      `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}&extra=statistics.rank_solo`,
    );
    console.log("Account data:", JSON.stringify(accountData.data));
    const snapshotRecorded = await recordModeSnapshot(accountId, nickname, "rank", "rank_solo", accountData);
    res.json({ ...accountData.data, snapshotRecorded });
  } catch (err) {
    console.error("Error fetching player stats:", err.message);
    console.error("Stack:", err.stack);
    if (err.response)
      console.error("Wargaming response:", JSON.stringify(err.response.data));
    res.status(500).json({ error: "Failed to fetch player stats" });
  }
});

//route for co-op battle stats
app.get("/api/player/:username/coop", async (req, res) => {
  try {
    const username = req.params.username;
    const { accountId, nickname } = await resolveAccount(username);
    const accountData = await axios.get(
      `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}&extra=statistics.pve`,
    );
    console.log("Account data:", JSON.stringify(accountData.data));
    const snapshotRecorded = await recordModeSnapshot(accountId, nickname, "coop", "pve", accountData);
    res.json({ ...accountData.data, snapshotRecorded });
  } catch (err) {
    console.error("Error fetching player stats:", err.message);
    console.error("Stack:", err.stack);
    if (err.response)
      console.error("Wargaming response:", JSON.stringify(err.response.data));
    res.status(500).json({ error: "Failed to fetch player stats" });
  }
});

// windowed (24h/7d/30d/90d/365d) stats for a player in a given battle-type mode (?mode=,
// defaulting to "pvp"), computed by diffing their current lifetime totals against our own
// recorded history snapshots for that mode.
app.get("/api/player/:username/windows", async (req, res) => {
  try {
    const username = req.params.username;
    const mode = resolveMode(req.query.mode);
    const statsField = BATTLE_TYPE_FIELDS[mode];
    const { accountId } = await resolveAccount(username);
    const extraParam = mode === "pvp" ? "" : `&extra=statistics.${statsField}`;
    const accountData = await axios.get(
      `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}${extraParam}`,
    );

    const stats = accountData.data.data[accountId]?.statistics?.[statsField];
    if (!stats) {
      return res.status(403).json({ error: "Player statistics are hidden" });
    }

    const { trackingSince, nextSnapshotAt, windows } = await getStatWindows(accountId, mode, stats);
    res.json({ current: stats, trackingSince, nextSnapshotAt, windows });
  } catch (err) {
    console.error("Error fetching windowed player stats:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({ error: "Failed to fetch windowed player stats" });
  }
});

// full history of a player's lifetime winrate, average damage, and KEI at each recorded
// snapshot for a given battle-type mode (?mode=, defaulting to "pvp"), for the Charts
// card on the player page
app.get("/api/player/:username/stat-history", async (req, res) => {
  try {
    const username = req.params.username;
    const mode = resolveMode(req.query.mode);
    const { accountId } = await resolveAccount(username);
    const history = await getStatHistory(accountId, mode);
    res.json({ history });
  } catch (err) {
    console.error("Error fetching stat history:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({ error: "Failed to fetch stat history" });
  }
});

// per-ship baseline totals for each supported window (24h/7d/30d/90d/365d), for a given
// battle-type mode (?mode=, defaulting to "pvp"). The client diffs these against its
// already-loaded live per-ship stats to compute an exact windowed PR.
app.get("/api/player/:username/ship-windows", async (req, res) => {
  try {
    const username = req.params.username;
    const mode = resolveMode(req.query.mode);
    const { accountId } = await resolveAccount(username);
    const windows = await getShipStatWindows(accountId, mode);
    res.json({ windows });
  } catch (err) {
    console.error("Error fetching windowed ship stats:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({ error: "Failed to fetch windowed ship stats" });
  }
});

// full per-snapshot history of a player's per-ship totals for a given battle-type mode
// (?mode=, defaulting to "pvp"), for the player page's PR-over-time chart
app.get("/api/player/:username/ship-stat-history", async (req, res) => {
  try {
    const username = req.params.username;
    const mode = resolveMode(req.query.mode);
    const { accountId } = await resolveAccount(username);
    const history = await getShipStatHistory(accountId, mode);
    res.json({ history });
  } catch (err) {
    console.error("Error fetching ship stat history:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({ error: "Failed to fetch ship stat history" });
  }
});

app.get("/api/player/:username/ships", async (req, res) => {
  try {
    const username = req.params.username;
    const { accountId, nickname } = await resolveAccount(username);

    // optional ?extra=pvp_solo|pvp_div2|pvp_div3 to fetch per-ship stats for a specific battle type
    const allowedExtras = [
      "pvp_solo",
      "pvp_div2",
      "pvp_div3",
      "rank_solo",
      "pve",
    ];
    const extraParam = allowedExtras.includes(req.query.extra)
      ? `&extra=${req.query.extra}`
      : "";

    const shipStatsRes = await axios.get(
      `https://api.worldofwarships.com/wows/ships/stats/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}${extraParam}`,
    );

    const ships = shipStatsRes.data.data[accountId];
    if (!ships) {
      return res.status(403).json({ error: "Player statistics are hidden" });
    }

    const shipsStatsField = allowedExtras.includes(req.query.extra) ? req.query.extra : "pvp";
    const shipsBattleType = FIELD_TO_BATTLE_TYPE[shipsStatsField] ?? "pvp";
    try {
      await recordShipStatSnapshot(accountId, nickname, shipsBattleType, ships, shipsStatsField);
    } catch (err) {
      console.error("Error recording ship stat snapshot:", err.message);
    }

    const shipIds = ships.map((s) => s.ship_id);

    // encyclopedia API accepts at most 100 ship IDs per request
    const encyclopedia = {};
    for (let i = 0; i < shipIds.length; i += 100) {
      const chunk = shipIds.slice(i, i + 100).join(",");
      const encyclopediaRes = await axios.get(
        `https://api.worldofwarships.com/wows/encyclopedia/ships/?application_id=${process.env.WOWS_API_KEY}&ship_id=${chunk}&fields=name,tier,type,nation`,
      );
      Object.assign(encyclopedia, encyclopediaRes.data.data);
    }

    const enrichedShips = ships.map((ship) => ({
      ...ship,
      name: encyclopedia[ship.ship_id]?.name ?? null,
      tier: encyclopedia[ship.ship_id]?.tier ?? null,
      type: encyclopedia[ship.ship_id]?.type ?? null,
      nation: encyclopedia[ship.ship_id]?.nation ?? null,
    }));

    res.json({ ...shipStatsRes.data, data: { [accountId]: enrichedShips } });
  } catch (err) {
    console.error("Error fetching ship stats:", err.message);
    console.error("Full error:", err.stack);
    res.status(500).json({ error: "Failed to fetch ship stats" });
  }
});

// get the player's clan information
app.get("/api/player/:username/clan", async (req, res) => {
  try {
    const username = req.params.username;
    const { accountId } = await resolveAccount(username);

    console.log(accountId);

    const clanRes = await axios.get(
      `https://api.worldofwarships.com/wows/clans/accountinfo/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}&extra=clan`,
    );
    res.json(clanRes.data);
  } catch (err) {
    console.error("Error fetching clan information:", err.message);
    console.error("Full error:", err.stack);
    res.status(500).json({ error: "Failed to fetch clan information" });
  }
});

// look up clan information by clan ID
app.get("/api/clan/:clanId", async (req, res) => {
  try {
    const clanId = req.params.clanId;
    const clanRes = await axios.get(
      `https://api.worldofwarships.com/wows/clans/info/?application_id=${process.env.WOWS_API_KEY}&clan_id=${clanId}&extra=members`,
    );
    res.json(clanRes.data);
  } catch (err) {
    console.error("Error fetching clan information:", err.message);
    res.status(500).json({ error: "Failed to fetch clan information" });
  }
});

// fetches a clan's roster and each member's pvp winrate/battles, recording them into
// player_winrates (used for the NA Summary page's server-wide sample). Shared by the
// /members/stats route (triggered by visiting a clan page) and the background clan
// crawler below (which drives the same thing without a user having to visit anything).
async function fetchAndRecordClanMemberStats(clanId) {
  const clanRes = await axios.get(
    `https://api.worldofwarships.com/wows/clans/info/?application_id=${process.env.WOWS_API_KEY}&clan_id=${clanId}&extra=members`,
  );
  const clan = clanRes.data.data[clanId];
  if (!clan?.members) return { found: false, result: {} };

  const members = Object.values(clan.members);
  const accountIds = members.map((m) => m.account_id);

  const statsMap = {};
  for (let i = 0; i < accountIds.length; i += 100) {
    const chunk = accountIds.slice(i, i + 100).join(",");
    const accountRes = await axios.get(
      `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${chunk}&fields=statistics.pvp.battles,statistics.pvp.wins,statistics.pvp.damage_dealt`,
    );
    Object.assign(statsMap, accountRes.data.data);
  }

  const result = {};
  for (const member of members) {
    const pvp = statsMap[member.account_id]?.statistics?.pvp;
    const battles = pvp?.battles ?? 0;
    const winrate = battles > 0 ? pvp.wins / pvp.battles : null;
    if (battles > 0) {
      recordWinrate(member.account_name, winrate, battles).catch((err) =>
        console.error("Error recording winrate:", err.message),
      );
    }
    result[member.account_id] = { battles, winrate, damage_dealt: pvp?.damage_dealt ?? 0 };
  }

  return { found: true, memberCount: members.length, result };
}

// fetches pvp winrate + battles for every clan member and records them in the DB
app.get("/api/clan/:clanId/members/stats", async (req, res) => {
  try {
    const { result } = await fetchAndRecordClanMemberStats(req.params.clanId);
    res.json({ data: result });
  } catch (err) {
    console.error("Error fetching clan member stats:", err.message);
    res.status(500).json({ error: "Failed to fetch clan member stats" });
  }
});

// supported time windows for the NA Server Stats page, keyed by the ?range= query param
const NA_SERVER_RANGES = {
  "24h": "1 day",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "365d": "365 days",
  all: null,
};

// builds a `WHERE last_updated >= now() - interval '...'` clause for a given ?range=, defaulting to all-time
function rangeClause(range) {
  if (!Object.prototype.hasOwnProperty.call(NA_SERVER_RANGES, range)) range = "all";
  const interval = NA_SERVER_RANGES[range];
  return interval ? `WHERE last_updated >= now() - interval '${interval}'` : "";
}

// returns server-wide summary stats for the recorded player winrate sample
app.get("/api/na-server/summary", async (req, res) => {
  try {
    const where = rangeClause(req.query.range);
    const result = await pool.query(
      `SELECT count(*) AS total_players,
              coalesce(avg(winrate), 0) AS average_winrate,
              coalesce(avg(battles), 0) AS average_battles,
              coalesce(stddev_pop(winrate), 0) AS stddev_winrate,
              coalesce(min(winrate), 0) AS min_winrate,
              coalesce(max(winrate), 0) AS max_winrate,
              coalesce(percentile_cont(0.25) within group (order by winrate), 0) AS q1_winrate,
              coalesce(percentile_cont(0.5) within group (order by winrate), 0) AS median_winrate,
              coalesce(percentile_cont(0.75) within group (order by winrate), 0) AS q3_winrate
       FROM player_winrates
       ${where}`,
    );
    const row = result.rows[0];
    res.json({
      totalPlayers: parseInt(row.total_players, 10),
      averageWinrate: parseFloat(row.average_winrate),
      averageBattles: parseFloat(row.average_battles),
      stdDevWinrate: parseFloat(row.stddev_winrate),
      minWinrate: parseFloat(row.min_winrate),
      maxWinrate: parseFloat(row.max_winrate),
      q1Winrate: parseFloat(row.q1_winrate),
      medianWinrate: parseFloat(row.median_winrate),
      q3Winrate: parseFloat(row.q3_winrate),
    });
  } catch (err) {
    console.error("Error fetching NA server summary:", err.message);
    res.status(500).json({ error: "Failed to fetch NA server summary" });
  }
});

// returns a 101-bucket histogram (1% wide buckets, 0%-100% inclusive) of recorded player
// winrates — 100% gets its own bucket rather than being folded into the 99% one
app.get("/api/na-server/winrate-distribution", async (req, res) => {
  try {
    const where = rangeClause(req.query.range);
    const result = await pool.query(
      `SELECT LEAST(floor(winrate * 100)::int, 100) AS bucket, count(*) AS count
       FROM player_winrates
       ${where}
       GROUP BY bucket`,
    );

    const counts = new Array(101).fill(0);
    for (const row of result.rows) {
      counts[row.bucket] = parseInt(row.count, 10);
    }
    const labels = Array.from({ length: 101 }, (_, i) => `${i}%`);

    res.json({ labels, counts });
  } catch (err) {
    console.error("Error fetching winrate distribution:", err.message);
    res.status(500).json({ error: "Failed to fetch winrate distribution" });
  }
});

// average winrate binned by battle count, to see whether more-experienced players tend to
// win more — bucket edges roughly follow WoWS' own "veteran" experience brackets
const BATTLES_BUCKETS = [100, 500, 1000, 2500, 5000, 10000, 20000];
const BATTLES_BUCKET_LABELS = [
  "<100", "100-499", "500-999", "1,000-2,499", "2,500-4,999", "5,000-9,999", "10,000-19,999", "20,000+",
];

app.get("/api/na-server/winrate-by-battles", async (req, res) => {
  try {
    const where = rangeClause(req.query.range);
    const caseClauses = BATTLES_BUCKETS.map((edge, i) => `WHEN battles < ${edge} THEN ${i}`).join("\n          ");
    const result = await pool.query(
      `SELECT
         CASE
           ${caseClauses}
           ELSE ${BATTLES_BUCKETS.length}
         END AS bucket,
         avg(winrate) AS avg_winrate,
         count(*) AS count
       FROM player_winrates
       ${where}
       GROUP BY bucket`,
    );

    const avgWinrates = new Array(BATTLES_BUCKET_LABELS.length).fill(null);
    const counts = new Array(BATTLES_BUCKET_LABELS.length).fill(0);
    for (const row of result.rows) {
      avgWinrates[row.bucket] = parseFloat(row.avg_winrate);
      counts[row.bucket] = parseInt(row.count, 10);
    }

    res.json({ labels: BATTLES_BUCKET_LABELS, avgWinrates, counts });
  } catch (err) {
    console.error("Error fetching winrate by battles played:", err.message);
    res.status(500).json({ error: "Failed to fetch winrate by battles played" });
  }
});

// where a given winrate ranks against the recorded player_winrates sample — used for the
// "Top X%" tag on player pages. topPercent is the share of tracked players with a strictly
// higher winrate, so a small number means a strong player
app.get("/api/na-server/percentile", async (req, res) => {
  try {
    const winrate = parseFloat(req.query.winrate);
    if (Number.isNaN(winrate)) {
      return res.status(400).json({ error: "winrate query param must be a number" });
    }

    const result = await pool.query(
      `SELECT count(*) AS total, count(*) FILTER (WHERE winrate > $1) AS above
       FROM player_winrates`,
      [winrate],
    );
    const row = result.rows[0];
    const total = parseInt(row.total, 10);
    const above = parseInt(row.above, 10);

    res.json({
      total,
      topPercent: total > 0 ? (above / total) * 100 : null,
    });
  } catch (err) {
    console.error("Error computing winrate percentile:", err.message);
    res.status(500).json({ error: "Failed to compute winrate percentile" });
  }
});

//get expected values for a player from WoWS Numbers API
app.get("/api/expected", async (req, res) => {
  try {
    const response = await axios.get(
      "https://api.wows-numbers.com/personal/rating/expected/json/",
    );
    res.json(response.data);
  } catch (err) {
    console.error("Error fetching expected values:", err.message);
    res.status(500).json({ error: "Failed to fetch expected values" });
  }
});

// temporary route to get a player's winrate
app.get("/player/:username/wr", async (req, res) => {
  const username = req.params.username;
  const { accountId } = await resolveAccount(username);
  const accountData = await axios.get(
    `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}`,
  );
  res.send(
    accountData.data.data[accountId].statistics.pvp.wins /
      accountData.data.data[accountId].statistics.pvp.battles,
  );
});

// background clan crawler: there's no WG endpoint that lists every clan, so this sweeps
// clan_id forward starting at 1e9 (real NA clan_ids cluster above that — confirmed by
// probing; see the clan_crawl_state comment in db.js), recording winrates for whatever
// roster it finds via fetchAndRecordClanMemberStats. Feeds the NA Summary page's
// server-wide sample beyond just the clans/players someone happens to browse to. Paced by
// CRAWL_INTERVAL_MS below to stay well under WG's API rate limit and out of the way of
// real traffic.
const CRAWL_INTERVAL_MS = 2500;
let crawlInFlight = false;

async function crawlNextClan() {
  if (crawlInFlight) return;
  crawlInFlight = true;
  try {
    const state = await getCrawlStatus();
    const clanId = state.nextClanId;

    let hit = false;
    try {
      const { found, memberCount } = await fetchAndRecordClanMemberStats(clanId);
      hit = found;
      if (found) {
        console.log(`[clan crawl] clan_id ${clanId}: hit (${memberCount} members)`);
      }
    } catch (err) {
      // a 404/"clan not found" from the WG API surfaces as a request error here — treat
      // it the same as a miss rather than letting it wedge the crawler
      hit = false;
    }

    await recordCrawlResult(clanId, hit);

    const updated = await getCrawlStatus();
    if (updated.totalChecked % 20 === 0) {
      const pct = updated.hitRate != null ? (updated.hitRate * 100).toFixed(1) : "n/a";
      console.log(
        `[clan crawl] ${updated.totalChecked} checked, ${updated.totalHits} hits (${pct}%), next clan_id ${updated.nextClanId}`,
      );
    }
  } catch (err) {
    console.error("[clan crawl] tick failed:", err.message);
  } finally {
    crawlInFlight = false;
  }
}

setInterval(crawlNextClan, CRAWL_INTERVAL_MS);

// current progress/hit-rate of the background clan crawler
app.get("/api/crawl-status", async (req, res) => {
  try {
    res.json(await getCrawlStatus());
  } catch (err) {
    console.error("Error fetching crawl status:", err.message);
    res.status(500).json({ error: "Failed to fetch crawl status" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
