//get the username from the URL
const username = window.location.pathname.split("/")[2];
console.log(username);

// for the search bar
document.getElementById("view-stats").addEventListener("click", (event) => {
  // prevent the default form submission behavior
  event.preventDefault();
  const username = document.getElementById("username").value;
  window.location.href = `/player/${username}`;
});

// fetch the player's main stats from the server
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

const columns = [
  { key: "ship_id", label: "Ship ID" },
  { key: "battles", label: "Battles" },
  { key: "wins", label: "Wins" },
  { key: "losses", label: "Losses" },
  { key: "winrate", label: "Win Rate" },
  { key: "damage_dealt", label: "Damage Dealt" },
  { key: "avg_damage", label: "Average Damage" },
  { key: "frags", label: "Warships Sunk" },
  { key: "avg_frags", label: "Average Warships Sunk" },
  { key: "survival_rate", label: "Survival Rate" },
];

function getSortVal(ship, key) {
  const pvp = ship.pvp;
  const played = pvp && pvp.battles > 0;
  switch (key) {
    case "ship_id":
      return ship.ship_id;
    case "battles":
      return pvp?.battles ?? 0;
    case "wins":
      return pvp?.wins ?? 0;
    case "losses":
      return pvp?.losses ?? 0;
    case "winrate":
      return played ? pvp.wins / pvp.battles : -1;
    case "damage_dealt":
      return pvp?.damage_dealt ?? 0;
    case "avg_damage":
      return played ? pvp.damage_dealt / pvp.battles : 0;
    case "frags":
      return pvp?.frags ?? 0;
    case "avg_frags":
      return played ? pvp.frags / pvp.battles : 0;
    case "survival_rate":
      return played ? pvp.survived_battles / pvp.battles : 0;
  }
}

function wrColor(rate) {
  return rate >= 60
    ? "#9b59b6"
    : rate >= 55
      ? "#1abc9c"
      : rate >= 52
        ? "#2ecc71"
        : rate >= 49
          ? "#f1c40f"
          : rate >= 47
            ? "#e67e22"
            : "#e74c3c";
}

function renderShipsTable(ships, sortCol, sortAsc) {
  const ph = `<td class="placeholder">--</td>`;
  const sorted = [...ships].sort((a, b) => {
    const diff = getSortVal(a, sortCol) - getSortVal(b, sortCol);
    return sortAsc ? diff : -diff;
  });

  const headers = columns
    .map((col) => {
      const arrow = col.key === sortCol ? (sortAsc ? " ▲" : " ▼") : "";
      return `<th data-col="${col.key}" class="sortable">${col.label}${arrow}</th>`;
    })
    .join("");

  const rows = sorted
    .map((ship) => {
      const pvp = ship.pvp;
      const hasPlayed = pvp && pvp.battles > 0;
      if (!hasPlayed)
        return `<tr><td>${ship.ship_id}</td><td>0</td><td>0</td><td>0</td>${ph}${ph}${ph}${ph}${ph}${ph}</tr>`;

      const wr = (pvp.wins / pvp.battles) * 100;
      return `
      <tr>
        <td>${ship.ship_id}</td>
        <td>${pvp.battles.toLocaleString()}</td>
        <td>${pvp.wins.toLocaleString()}</td>
        <td>${pvp.losses.toLocaleString()}</td>
        <td style="color:${wrColor(wr)}">${wr.toFixed(2)}%</td>
        <td>${pvp.damage_dealt.toLocaleString()}</td>
        <td>${(pvp.damage_dealt / pvp.battles).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
        <td>${pvp.frags.toLocaleString()}</td>
        <td>${(pvp.frags / pvp.battles).toFixed(2)}</td>
        <td>${((pvp.survived_battles / pvp.battles) * 100).toFixed(2)}%</td>
      </tr>
    `;
    })
    .join("");

  return `
    <h2>Ship Stats</h2>
    <div class="table-wrapper">
      <table>
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

fetch(`/api/player/${username}/ships`)
  .then((response) => response.json())
  .then((data) => {
    const shipsContainer = document.getElementById("ships-container");
    const ships = data.data[Object.keys(data.data)[0]];

    let sortCol = "battles";
    let sortAsc = false;

    shipsContainer.innerHTML = renderShipsTable(ships, sortCol, sortAsc);

    shipsContainer.addEventListener("click", (e) => {
      const th = e.target.closest("th[data-col]");
      if (!th) return;
      const col = th.dataset.col;
      if (col === sortCol) {
        sortAsc = !sortAsc;
      } else {
        sortCol = col;
        sortAsc = false;
      }
      shipsContainer.innerHTML = renderShipsTable(ships, sortCol, sortAsc);
    });
  })
  .catch((error) => {
    console.error("Error fetching ship stats:", error);
    document.getElementById("ships-container").innerHTML =
      `<p>Error fetching ship stats. Please try again later.</p>`;
  });
