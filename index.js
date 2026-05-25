require("dotenv").config();
const express = require("express");
const axios = require("axios");
const app = express();
const PORT = 3000;

app.get("/", (req, res) => {
  res.send("kokou-stats API is running");
});

app.get("/player/:username", async (req, res) => {
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
