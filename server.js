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
  const response = await axios.get(
    `https://api.worldofwarships.com/wows/account/list/?application_id=${process.env.WOWS_API_KEY}&search=${username}`,
  );

  const accountId = response.data.data[0].account_id;
  const shipData = await axios.get(
    `https://api.worldofwarships.com/wows/ships/stats/?application_id=8bef8d52a6ece3ab64303f1564ac8468&account_id=${accountId}`,
  );
  res.send(shipData.data);
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
