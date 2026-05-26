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
    const pvp = accountData.statistics.pvp;
    const winRate = (pvp.wins / pvp.battles) * 100;

    // color scheme to indicate the player's winrate
    const wrColor =
      winRate >= 60
        ? "#9b59b6"
        : winRate >= 55
          ? "#1abc9c"
          : winRate >= 52
            ? "#2ecc71"
            : winRate >= 49
              ? "#f1c40f"
              : winRate >= 47
                ? "#e67e22"
                : "#e74c3c";

    statsContainer.innerHTML = `
        <h2>${accountData.nickname}'s Stats</h2>
        <p>Last Updated: ${new Date(accountData.stats_updated_at * 1000).toLocaleString()}</p>
        <p>Last Battle Time: ${new Date(
          accountData.last_battle_time * 1000,
        ).toLocaleString()}</p>
        <h3>Win Rate: <span style="color: ${wrColor}">${winRate.toFixed(2)}%</span></h3>
        <p>Random Battles: ${pvp.battles.toLocaleString()}</p>
        <p>Wins: ${pvp.wins.toLocaleString()}</p>
        <p>Losses: ${pvp.losses.toLocaleString()}</p>
        <p>Draws: ${pvp.draws.toLocaleString()}</p>
        <p>Damage Dealt: ${pvp.damage_dealt.toLocaleString()}</p>
        <p>Average Damage per Battle: ${(
          pvp.damage_dealt / pvp.battles
        ).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        <p>Warships Sunk: ${pvp.frags.toLocaleString()}</p>
        <p>Average Warships Sunk per Battle: ${(
          pvp.frags / pvp.battles
        ).toFixed(2)}</p>
        <p>Total Experience: ${pvp.xp.toLocaleString()}</p>
        <p>Average Experience per Battle: ${(
          pvp.xp / pvp.battles
        ).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        <p>Survival Rate: ${(
          (pvp.survived_battles / pvp.battles) *
          100
        ).toFixed(2)}%</p>
        <p>Destruction Ratio: ${(
          pvp.frags /
          (pvp.battles - pvp.survived_battles)
        ).toFixed(2)}</p>
        <p>Spotting Damage: ${pvp.damage_scouting.toLocaleString()}</p>
        <p>Average Spotting Damage per Battle: ${(
          pvp.damage_scouting / pvp.battles
        ).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
      `;
  })
  .catch((error) => {
    console.error("Error fetching player stats:", error);
    const statsContainer = document.getElementById("stats-container");
    statsContainer.innerHTML = `<p>Error fetching player stats. Please try again later.</p>`;
  });
