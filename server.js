require("dotenv").config();
const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// resolves a username to its WoWS account ID via the account search endpoint
async function getAccountId(username) {
  const searchRes = await axios.get(
    `https://api.worldofwarships.com/wows/account/list/?application_id=${process.env.WOWS_API_KEY}&search=${username}`,
  );
  return searchRes.data.data[0].account_id;
}

// route to serve the player stats page
app.get("/player/:username", async (req, res) => {
  res.sendFile(__dirname + "/public/player.html");
});

// route to serve the about page
app.get("/about", async (req, res) => {
  res.sendFile(__dirname + "/public/about.html");
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

//main player data for ALL random battles
app.get("/api/player/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const accountId = await getAccountId(username);
    const accountData = await axios.get(
      `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}`,
    );
    console.log("Account data:", JSON.stringify(accountData.data));
    res.json(accountData.data);
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
    const accountId = await getAccountId(username);
    const accountData = await axios.get(
      `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}&extra=statistics.pvp_solo`,
    );
    console.log("Account data:", JSON.stringify(accountData.data));
    res.json(accountData.data);
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
    const accountId = await getAccountId(username);
    const accountData = await axios.get(
      `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}&extra=statistics.pvp_div2`,
    );
    console.log("Account data:", JSON.stringify(accountData.data));
    res.json(accountData.data);
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
    const accountId = await getAccountId(username);
    const accountData = await axios.get(
      `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}&extra=statistics.pvp_div3`,
    );
    console.log("Account data:", JSON.stringify(accountData.data));
    res.json(accountData.data);
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
    const accountId = await getAccountId(username);
    const accountData = await axios.get(
      `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}&extra=statistics.rank_solo`,
    );
    console.log("Account data:", JSON.stringify(accountData.data));
    res.json(accountData.data);
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
    const accountId = await getAccountId(username);
    const accountData = await axios.get(
      `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}&extra=statistics.pve`,
    );
    console.log("Account data:", JSON.stringify(accountData.data));
    res.json(accountData.data);
  } catch (err) {
    console.error("Error fetching player stats:", err.message);
    console.error("Stack:", err.stack);
    if (err.response)
      console.error("Wargaming response:", JSON.stringify(err.response.data));
    res.status(500).json({ error: "Failed to fetch player stats" });
  }
});

app.get("/api/player/:username/ships", async (req, res) => {
  try {
    const username = req.params.username;
    const accountId = await getAccountId(username);

    // optional ?extra=pvp_solo|pvp_div2|pvp_div3 to fetch per-ship stats for a specific battle type
    const allowedExtras = ["pvp_solo", "pvp_div2", "pvp_div3", "rank_solo", "pve"];
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
    const accountId = await getAccountId(username);

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
      `https://api.worldofwarships.com/wows/clans/info/?application_id=${process.env.WOWS_API_KEY}&clan_id=${clanId}`,
    );
    res.json(clanRes.data);
  } catch (err) {
    console.error("Error fetching clan information:", err.message);
    res.status(500).json({ error: "Failed to fetch clan information" });
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
  const accountId = await getAccountId(username);
  const accountData = await axios.get(
    `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}`,
  );
  res.send(
    accountData.data.data[accountId].statistics.pvp.wins /
      accountData.data.data[accountId].statistics.pvp.battles,
  );
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
