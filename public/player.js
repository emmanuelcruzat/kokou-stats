//get the username from the URL
const username = window.location.pathname.split("/")[2];
console.log(username);

// fetch the player's stats from the server
fetch(`/api/player/${username}`)
  .then((response) => response.json())
  .then((data) => {
    console.log(data);
    document.getElementById;

    // display the player's stats on the page
    const statsContainer = document.getElementById("stats-container");
    const accountData = data.data[Object.keys(data.data)[0]];
    statsContainer.innerHTML = `
        <h2>${accountData.nickname}'s Stats</h2>
        <p>Last Battle Time: ${new Date(
          accountData.last_battle_time * 1000,
        ).toLocaleString()}</p>
        <p>Win Rate: ${(
          (accountData.statistics.pvp.wins /
            accountData.statistics.pvp.battles) *
          100
        ).toFixed(2)}%</p>
        <p>Total Battles: ${accountData.statistics.pvp.battles}</p>
        <p>Total Wins: ${accountData.statistics.pvp.wins}</p>
        <p>Total Losses: ${accountData.statistics.pvp.losses}</p>
        <p>Total Damage Dealt: ${accountData.statistics.pvp.damage_dealt}</p>
        <p>Total Ships Destroyed: ${accountData.statistics.pvp.ships_destroyed}</p>
        <p>Total Experience: ${accountData.statistics.pvp.experience}</p>
      `;
  })
  .catch((error) => {
    console.error("Error fetching player stats:", error);
    const statsContainer = document.getElementById("stats-container");
    statsContainer.innerHTML = `<p>Error fetching player stats. Please try again later.</p>`;
  });
