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

    const currentWrColor = wrColor(winRate);

    const row = (label, value) =>
      `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;

    statsContainer.innerHTML = `
      <div class="player-header">
        <h2>${accountData.nickname}</h2>
        <div class="player-meta">
          <span>Last Battle: ${new Date(accountData.last_battle_time * 1000).toLocaleString()}</span>
          <span>Updated: ${new Date(accountData.stats_updated_at * 1000).toLocaleString()}</span>
        </div>
      </div>
      <div class="stat-grid">
        <div class="stat-card">
          <h3>Battle Record</h3>
          ${(() => {
            const next = wrNextTier(winRate);
            const nextText = next
              ? `<div class="winrate-next" style="color:${wrColor(parseFloat(winRate) + parseFloat(next.needed))}">+${next.needed}% to ${next.label}</div>`
              : "";
            return `
              <div class="winrate-display" style="color:${currentWrColor}">
                <div class="winrate-top">
                  <div class="winrate-pct">${winRate.toFixed(2)}%</div>
                  <div class="winrate-label">${wrLabel(winRate)}</div>
                </div>
                ${nextText}
              </div>
            `;
          })()}
          ${row("Battles", pvp.battles.toLocaleString())}
          ${row("Wins", pvp.wins.toLocaleString())}
          ${row("Losses", pvp.losses.toLocaleString())}
          ${row("Draws", pvp.draws.toLocaleString())}
          ${row("Survival Rate", `${((pvp.survived_battles / pvp.battles) * 100).toFixed(2)}%`)}
        </div>
        <div class="stat-card">
          <h3>Damage</h3>
          ${row("Damage Dealt", pvp.damage_dealt.toLocaleString())}
          ${row("Avg. Damage / Battle", (pvp.damage_dealt / pvp.battles).toLocaleString(undefined, { maximumFractionDigits: 0 }))}
          ${row("Spotting Damage", pvp.damage_scouting.toLocaleString())}
          ${row("Avg. Spotting / Battle", (pvp.damage_scouting / pvp.battles).toLocaleString(undefined, { maximumFractionDigits: 0 }))}
        </div>
        <div class="stat-card">
          <h3>Sinks</h3>
          ${row("Warships Sunk", pvp.frags.toLocaleString())}
          ${row("Avg. Sunk / Battle", (pvp.frags / pvp.battles).toFixed(2))}
          ${row("Destruction Ratio", (pvp.frags / (pvp.battles - pvp.survived_battles)).toFixed(2))}
        </div>
        <div class="stat-card">
          <h3>Experience</h3>
          ${row("Total XP", pvp.xp.toLocaleString())}
          ${row("Avg. XP / Battle", (pvp.xp / pvp.battles).toLocaleString(undefined, { maximumFractionDigits: 0 }))}
        </div>
      </div>
    `;
  })
  .catch((error) => {
    console.error("Error fetching player stats:", error);
    const statsContainer = document.getElementById("stats-container");
    statsContainer.innerHTML = `<p>Error fetching player stats. Please try again later.</p>`;
  });

// column names and labels for the ships table, along with a function to get the value to sort by for each column
const columns = [
  { key: "name", label: "Ship" },
  { key: "type", label: "Type" },
  { key: "tier", label: "Tier" },
  { key: "battles", label: "Battles" },
  { key: "winrate", label: "Win Rate" },
  { key: "damage_dealt", label: "Damage Dealt" },
  { key: "Avg._damage", label: "Avg. Damage" },
  { key: "frags", label: "Warships Sunk" },
  { key: "Avg._frags", label: "Avg. Sunk / Battle" },
  { key: "survival_rate", label: "Survival Rate" },
];

function getSortVal(ship, key) {
  const pvp = ship.pvp;
  const played = pvp && pvp.battles > 0;
  switch (key) {
    case "name":
      return ship.name ?? "";
    case "tier":
      return ship.tier ?? 0;
    case "type":
      return ship.type ?? "";
    case "battles":
      return pvp?.battles ?? 0;
    case "winrate":
      return played ? pvp.wins / pvp.battles : -1;
    case "damage_dealt":
      return pvp?.damage_dealt ?? 0;
    case "Avg._damage":
      return played ? pvp.damage_dealt / pvp.battles : 0;
    case "frags":
      return pvp?.frags ?? 0;
    case "Avg._frags":
      return played ? pvp.frags / pvp.battles : 0;
    case "survival_rate":
      return played ? pvp.survived_battles / pvp.battles : 0;
  }
}

const romanNumerals = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
];

const wrTiers = [
  { threshold: 47, label: "Below Average" },
  { threshold: 49, label: "Average" },
  { threshold: 52, label: "Good" },
  { threshold: 54, label: "Very Good" },
  { threshold: 56, label: "Great" },
  { threshold: 60, label: "Unicum" },
  { threshold: 65, label: "Super Unicum" },
];

function wrNextTier(rate) {
  const next = wrTiers.find((t) => rate < t.threshold);
  if (!next) return null;
  return { label: next.label, needed: (next.threshold - rate).toFixed(2) };
}

function wrLabel(rate) {
  return rate >= 65
    ? "Super Unicum"
    : rate >= 60
      ? "Unicum"
      : rate >= 56
        ? "Great"
        : rate >= 54
          ? "Very Good"
          : rate >= 52
            ? "Good"
            : rate >= 49
              ? "Average"
              : rate >= 47
                ? "Below Average"
                : "Bad";
}

function wrColor(rate) {
  return rate >= 65
    ? "#a855f7"
    : rate >= 60
      ? "#9b59b6"
      : rate >= 56
        ? "#3498db"
        : rate >= 54
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
    const aVal = getSortVal(a, sortCol);
    const bVal = getSortVal(b, sortCol);
    const diff =
      typeof aVal === "string" ? aVal.localeCompare(bVal) : aVal - bVal;
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
        return `<tr><td>${ship.name ?? `<span class="placeholder">Unknown</span>`}</td><td>${ship.type ? (ship.type === "AirCarrier" ? "Aircraft Carrier" : ship.type) : `<span class="placeholder">--</span>`}</td><td>${ship.tier ? (romanNumerals[ship.tier - 1] ?? ship.tier) : `<span class="placeholder">--</span>`}</td><td>0</td>${ph}${ph}${ph}${ph}${ph}${ph}</tr>`;

      const wr = (pvp.wins / pvp.battles) * 100;
      return `
      <tr>
        <td>${ship.name ?? `<span class="placeholder">Unknown</span>`}</td>
        <td>${ship.type ? (ship.type === "AirCarrier" ? "Aircraft Carrier" : ship.type) : `<span class="placeholder">--</span>`}</td>
        <td>${ship.tier ? (romanNumerals[ship.tier - 1] ?? ship.tier) : `<span class="placeholder">--</span>`}</td>
        <td>${pvp.battles.toLocaleString()}</td>
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
