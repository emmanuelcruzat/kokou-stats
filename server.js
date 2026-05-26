require("dotenv").config();
const express = require("express");
const axios = require("axios");
const app = express();
const PORT = 3000;

app.use(express.static("public"));

// route to serve the player stats page
app.get("/player/:username", async (req, res) => {
  res.sendFile(__dirname + "/public/player.html");
});

// API ROUTES

// basic route to check if the API is running
app.get("/api", (req, res) => {
  res.send("kokou-stats API is running!");
});

//main player data
app.get("/api/player/:username", async (req, res) => {
  const username = req.params.username;
  // basic route to obtain a user that we want to fetch stats for

  const response = await axios.get(
    `https://api.worldofwarships.com/wows/account/list/?application_id=${process.env.WOWS_API_KEY}&search=${username}`,
  );

  const accountId = response.data.data[0].account_id;
  const accountData = await axios.get(
    `https://api.worldofwarships.com/wows/account/info/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}`,
  );
  res.send(accountData.data);
});

app.get("/api/player/:username/ships", async (req, res) => {
  const username = req.params.username;
  const searchRes = await axios.get(
    `https://api.worldofwarships.com/wows/account/list/?application_id=${process.env.WOWS_API_KEY}&search=${username}`,
  );

  const accountId = searchRes.data.data[0].account_id;
  const shipStatsRes = await axios.get(
    `https://api.worldofwarships.com/wows/ships/stats/?application_id=${process.env.WOWS_API_KEY}&account_id=${accountId}`,
  );

  const ships = shipStatsRes.data.data[accountId];
  const shipIds = ships.map((s) => s.ship_id).join(",");

  const encyclopediaRes = await axios.get(
    `https://api.worldofwarships.com/wows/encyclopedia/ships/?application_id=${process.env.WOWS_API_KEY}&ship_id=${shipIds}&fields=name,tier,type`,
  );

  const encyclopedia = encyclopediaRes.data.data;
  const enrichedShips = ships.map((ship) => ({
    ...ship,
    name: encyclopedia[ship.ship_id]?.name ?? null,
    tier: encyclopedia[ship.ship_id]?.tier ?? null,
    type: encyclopedia[ship.ship_id]?.type ?? null,
  }));

  res.send({ ...shipStatsRes.data, data: { [accountId]: enrichedShips } });
});

// temporary route to get a player's winrate
app.get("/player/:username/wr", async (req, res) => {
  const username = req.params.username;
  // basic route to obtain a user that we want to fetch stats for

  const response = await axios.get(
    `https://api.worldofwarships.com/wows/account/list/?application_id=${process.env.WOWS_API_KEY}&search=${username}`,
  );

  const accountId = response.data.data[0].account_id;
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
