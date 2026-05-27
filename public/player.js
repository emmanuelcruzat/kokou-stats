//get the username from the URL
const username = window.location.pathname.split("/")[2];
console.log(username);

const row = (label, value) =>
  `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;

let resolvedClanTag = null;
let clanPayload = null;

function applyClanTag(tag) {
  resolvedClanTag = tag;
  const el = document.getElementById("clan-tag");
  if (el) el.textContent = `[${tag}]`;
}

const clanItem = (label, value) =>
  `<div class="clan-item"><div class="clan-item-label">${label}</div><div class="clan-item-value">${value}</div></div>`;

function tryClanRender() {
  const clanCard = document.getElementById("clan-card");
  if (!clanCard || !clanPayload) return;
  const { clan, details, role, joined_at } = clanPayload;
  clanCard.style.display = "";
  clanCard.innerHTML = `
    <h3>Clan</h3>
    <div class="clan-row">
      ${clanItem("Name", `[${clan.tag}] ${clan.name}`)}
      ${clanItem("Role", roleLabel[role] ?? role)}
      ${clanItem("Joined", new Date(joined_at * 1000).toLocaleDateString())}
      <div class="clan-divider"></div>
      ${clanItem("Leader", `<a href="/player/${details.leader_name}" class="clan-leader-link">${details.leader_name}</a>`)}
      ${clanItem("Members", clan.members_count)}
    </div>
  `;
}

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
    const accountData = data.data[Object.keys(data.data)[0]];
    const pvp = accountData.statistics.pvp;
    const winRate = (pvp.wins / pvp.battles) * 100;

    const currentWrColor = wrColor(winRate);

    document.getElementById("player-header-container").innerHTML = `
      <div class="player-header">
        <h2><span id="clan-tag">${resolvedClanTag ? `[${resolvedClanTag}]` : ""}</span>${accountData.nickname}</h2>
        <div id="captain-title" class="captain-title placeholder">--</div>
        <div class="player-meta">
          <span>Last Battle: ${new Date(accountData.last_battle_time * 1000).toLocaleString()}</span>
          <span>Updated: ${new Date(accountData.stats_updated_at * 1000).toLocaleString()}</span>
        </div>
      </div>
    `;

    document.getElementById("stat-grid-container").innerHTML = `
      <div class="stat-grid">
        <div class="stat-card stat-card-battle">
          <h3>Battle Record</h3>
          ${(() => {
            const next = wrNextTier(winRate);
            const nextText = next
              ? `<div class="winrate-next" style="color:${wrColor(parseFloat(winRate) + parseFloat(next.needed))}">+${next.needed}% to ${next.label}</div>`
              : "";
            return `
              <div class="winrate-display" style="color:${currentWrColor}">
                <div class="metric-label">Random Battles Winrate</div>
                <div class="winrate-top">
                  <div class="winrate-pct">${winRate.toFixed(2)}%</div>
                  <div class="winrate-label">${wrLabel(winRate)}</div>
                </div>
                ${nextText}
              </div>
            `;
          })()}
          <div class="winrate-display" id="pr-display" style="color:#546e7a">
            <div class="metric-label">WoWS Numbers Personal Rating (PR)</div>
            <div class="winrate-top">
              <div class="metric-pct" id="pr-num">—</div>
              <div class="winrate-label" id="pr-tier"></div>
            </div>
            <div class="winrate-next" id="pr-next"></div>
          </div>
          ${(() => {
            const kei = pvp.damage_scouting / pvp.battles / 1000 + winRate;
            const nextKEI = keiNextTier(kei);
            const nextKEIText = nextKEI
              ? `<div class="winrate-next" style="color:${keiColor(kei + parseFloat(nextKEI.needed))}">+${nextKEI.needed} to ${nextKEI.label}</div>`
              : "";
            return `
              <div class="winrate-display" style="color:${keiColor(kei)}">
                <div class="metric-label">Kokou's Effectiveness Index (KEI)</div>
                <div class="winrate-top">
                  <div class="metric-pct">${kei.toFixed(2)}</div>
                  <div class="winrate-label">${keiLabel(kei)}</div>
                </div>
                ${nextKEIText}
              </div>
            `;
          })()}
          ${row("Battles", pvp.battles.toLocaleString())}
          ${row("Wins", pvp.wins.toLocaleString())}
          ${row("Losses", pvp.losses.toLocaleString())}
          ${row("Draws", pvp.draws.toLocaleString())}
          ${row("Survival Rate", `${((pvp.survived_battles / pvp.battles) * 100).toFixed(2)}%`)}
        </div>
        <div class="stat-card stat-card-medals">
          <h3>Medals</h3>
          <p class="wip-label">WORK IN PROGRESS</p>
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
    tryClanRender();
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

const nationLabel = {
  italy: "Kingdom of Italy",
  uk: "United Kingdom",
  netherlands: "Netherlands",
  france: "France",
  usa: "United States",
  germany: "German Reich",
  europe: "Pan-Europe",
  japan: "Empire of Japan",
  ussr: "Soviet Union",
  commonwealth: "British Commonwealth",
  pan_asia: "Pan-Asia",
  spain: "Spanish State",
  pan_america: "Pan-America",
};

const nationCoalition = {
  usa: "Allies",
  uk: "Allies",
  france: "Allies",
  commonwealth: "Allies",
  netherlands: "Allies",
  ussr: "Allies",
  pan_america: "Allies",
  germany: "Axis",
  japan: "Axis",
  italy: "Axis",
  spain: "Non-Aligned",
  europe: "Non-Aligned",
  pan_asia: "Non-Aligned",
};

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

const prTiers = [
  { threshold: 750, label: "Below Average" },
  { threshold: 1100, label: "Average" },
  { threshold: 1350, label: "Good" },
  { threshold: 1550, label: "Very Good" },
  { threshold: 1750, label: "Great" },
  { threshold: 2100, label: "Unicum" },
  { threshold: 2450, label: "Super Unicum" },
];

function prNextTier(pr) {
  const next = prTiers.find((t) => pr < t.threshold);
  if (!next) return null;
  return { label: next.label, needed: next.threshold - pr };
}

const keiTiers = [
  { threshold: 50, label: "Below Average" },
  { threshold: 58, label: "Average" },
  { threshold: 63, label: "Good" },
  { threshold: 68, label: "Very Good" },
  { threshold: 73, label: "Great" },
  { threshold: 80, label: "Unicum" },
  { threshold: 90, label: "Super Unicum" },
];

function keiNextTier(kei) {
  const next = keiTiers.find((t) => kei < t.threshold);
  if (!next) return null;
  return { label: next.label, needed: (next.threshold - kei).toFixed(2) };
}

function keiColor(kei) {
  return kei >= 90
    ? "#a855f7"
    : kei >= 80
      ? "#9b59b6"
      : kei >= 73
        ? "#3498db"
        : kei >= 68
          ? "#1abc9c"
          : kei >= 63
            ? "#2ecc71"
            : kei >= 58
              ? "#f1c40f"
              : kei >= 50
                ? "#e67e22"
                : "#e74c3c";
}

function keiLabel(kei) {
  return kei >= 90
    ? "Super Unicum"
    : kei >= 80
      ? "Unicum"
      : kei >= 73
        ? "Great"
        : kei >= 68
          ? "Very Good"
          : kei >= 63
            ? "Good"
            : kei >= 58
              ? "Average"
              : kei >= 50
                ? "Below Average"
                : "Bad";
}

function prLabel(pr) {
  return pr >= 2450
    ? "Super Unicum"
    : pr >= 2100
      ? "Unicum"
      : pr >= 1750
        ? "Great"
        : pr >= 1550
          ? "Very Good"
          : pr >= 1350
            ? "Good"
            : pr >= 1100
              ? "Average"
              : pr >= 750
                ? "Below Average"
                : "Bad";
}

function prColor(pr) {
  return pr >= 2450
    ? "#a855f7"
    : pr >= 2100
      ? "#9b59b6"
      : pr >= 1750
        ? "#3498db"
        : pr >= 1550
          ? "#1abc9c"
          : pr >= 1350
            ? "#2ecc71"
            : pr >= 1100
              ? "#f1c40f"
              : pr >= 750
                ? "#e67e22"
                : "#e74c3c";
}

function calculatePR(ships, expectedData) {
  let actualDmg = 0,
    actualFrags = 0,
    actualWins = 0;
  let expectedDmg = 0,
    expectedFrags = 0,
    expectedWins = 0;

  ships.forEach((ship) => {
    const pvp = ship.pvp;
    if (!pvp || pvp.battles === 0) return;
    const exp = expectedData[ship.ship_id];
    if (!exp) return;

    actualDmg += pvp.damage_dealt;
    actualFrags += pvp.frags;
    actualWins += pvp.wins;
    expectedDmg += exp.average_damage_dealt * pvp.battles;
    expectedFrags += exp.average_frags * pvp.battles;
    expectedWins += (exp.win_rate / 100) * pvp.battles;
  });

  if (expectedDmg === 0) return null;

  const rDmg = actualDmg / expectedDmg;
  const rFrags = actualFrags / expectedFrags;
  const rWins = actualWins / expectedWins;

  const nDmg = Math.max(0, (rDmg - 0.4) / 0.6);
  const nFrags = Math.max(0, (rFrags - 0.1) / 0.9);
  const nWins = Math.max(0, (rWins - 0.7) / 0.3);

  return Math.round(700 * nDmg + 300 * nFrags + 150 * nWins);
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


Promise.all([
  fetch(`/api/player/${username}/ships`).then((r) => r.json()),
  fetch(`/api/expected`).then((r) => r.json()),
])
  .then(([data, expectedRes]) => {
    const shipsContainer = document.getElementById("ships-container");
    const ships = data.data[Object.keys(data.data)[0]];

    let sortCol = "battles";
    let sortAsc = false;

    // aggregate battles by class, nation, tier, and coalition
    const byClass = {};
    const byNation = {};
    const byTierNum = {};
    const byCoalition = {};
    ships.forEach((ship) => {
      const battles = ship.pvp?.battles ?? 0;
      if (battles === 0) return;
      if (ship.type) {
        const t = ship.type === "AirCarrier" ? "Aircraft Carrier" : ship.type;
        byClass[t] = (byClass[t] ?? 0) + battles;
      }
      if (ship.nation) {
        const n = nationLabel[ship.nation] ?? ship.nation;
        byNation[n] = (byNation[n] ?? 0) + battles;
        const c = nationCoalition[ship.nation] ?? ship.nation;
        byCoalition[c] = (byCoalition[c] ?? 0) + battles;
      }
      if (ship.tier) {
        byTierNum[ship.tier] = (byTierNum[ship.tier] ?? 0) + battles;
      }
    });

    const classLabelMap = {
      Destroyer: "Destroyer",
      Cruiser: "Cruiser",
      Battleship: "Battleship",
      "Aircraft Carrier": "Aircraft Carrier",
      Submarine: "Submarine",
    };
    const totalClassBattles = Object.values(byClass).reduce((a, b) => a + b, 0);
    const sortedClasses = Object.entries(byClass).sort(([, a], [, b]) => b - a);
    const [topClass, topBattles] = sortedClasses[0] ?? [];
    const significantClasses =
      topClass && topBattles / totalClassBattles > 0.5
        ? [topClass]
        : sortedClasses
            .filter(([, battles]) => battles / totalClassBattles >= 0.25)
            .slice(0, 2)
            .map(([cls]) => cls);
    const shipTypeTitle =
      significantClasses.length > 0
        ? significantClasses.map((cls) => classLabelMap[cls] ?? cls).join(" & ") + " Main"
        : "Universal Main";

    const coalitionPrefixMap = { Allies: "Allied", Axis: "Axis", "Non-Aligned": "Non-Aligned" };
    const totalCoalitionBattles = Object.values(byCoalition).reduce((a, b) => a + b, 0);
    const [topCoalition, topCoalitionBattles] = Object.entries(byCoalition).sort(([, a], [, b]) => b - a)[0] ?? [];
    const coalitionPrefix =
      topCoalition && topCoalitionBattles / totalCoalitionBattles > 0.5
        ? (coalitionPrefixMap[topCoalition] ?? topCoalition)
        : "";

    const captainTitle = coalitionPrefix ? `${coalitionPrefix} ${shipTypeTitle}` : shipTypeTitle;
    const captainTitleEl = document.getElementById("captain-title");
    if (captainTitleEl) {
      captainTitleEl.textContent = captainTitle;
      captainTitleEl.classList.remove("placeholder");
    }

    //code for the charts, uses chart.js to display a doughnut chart of battles by class and nation
    const chartColors = [
      "#3498db",
      "#e74c3c",
      "#2ecc71",
      "#f1c40f",
      "#9b59b6",
      "#1abc9c",
      "#e67e22",
      "#e91e63",
      "#00bcd4",
      "#8bc34a",
      "#ff5722",
    ];

    function makeBarChart(id, labels, values) {
      const total = values.reduce((a, b) => a + b, 0);
      new Chart(document.getElementById(id), {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: chartColors.slice(0, labels.length),
              borderWidth: 0,
            },
          ],
        },
        options: {
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const pct = ((ctx.parsed.y / total) * 100).toFixed(1);
                  return `${ctx.parsed.y.toLocaleString()} battles (${pct}%)`;
                },
              },
            },
          },
          scales: {
            x: { ticks: { color: "#e0e6ed" }, grid: { color: "#1e3448" } },
            y: { ticks: { color: "#e0e6ed" }, grid: { color: "#1e3448" } },
          },
        },
      });
    }

    function makeChart(id, labels, values) {
      const total = values.reduce((a, b) => a + b, 0);
      return new Chart(document.getElementById(id), {
        type: "doughnut",
        data: {
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: chartColors.slice(0, labels.length),
              borderColor: "#132232",
              borderWidth: 2,
            },
          ],
        },
        options: {
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: "#e0e6ed", font: { size: 12 }, padding: 12 },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const pct = ((ctx.parsed / total) * 100).toFixed(1);
                  return `${ctx.label}: ${ctx.parsed.toLocaleString()} battles (${pct}%)`;
                },
              },
            },
          },
        },
      });
    }

    makeChart("chart-class", Object.keys(byClass), Object.values(byClass));
    const nationChart = makeChart(
      "chart-nation",
      Object.keys(byNation),
      Object.values(byNation),
    );

    const toggleNation = document.getElementById("toggle-nation");
    const toggleCoalition = document.getElementById("toggle-coalition");

    function updateNationChart(labels, values) {
      const total = values.reduce((a, b) => a + b, 0);
      nationChart.data.labels = labels;
      nationChart.data.datasets[0].data = values;
      nationChart.data.datasets[0].backgroundColor = chartColors.slice(
        0,
        labels.length,
      );
      nationChart.options.plugins.tooltip.callbacks.label = (ctx) => {
        const pct = ((ctx.parsed / total) * 100).toFixed(1);
        return `${ctx.label}: ${ctx.parsed.toLocaleString()} battles (${pct}%)`;
      };
      nationChart.update();
    }

    toggleNation.addEventListener("click", () => {
      updateNationChart(Object.keys(byNation), Object.values(byNation));
      toggleNation.classList.add("active");
      toggleCoalition.classList.remove("active");
    });

    toggleCoalition.addEventListener("click", () => {
      updateNationChart(Object.keys(byCoalition), Object.values(byCoalition));
      toggleCoalition.classList.add("active");
      toggleNation.classList.remove("active");
    });

    const allTiers = Array.from({ length: 11 }, (_, i) => i + 1);
    makeBarChart(
      "chart-tier",
      allTiers.map((t) => romanNumerals[t - 1]),
      allTiers.map((t) => byTierNum[t] ?? 0),
    );

    const pr = calculatePR(ships, expectedRes.data);
    if (pr !== null) {
      const nextPR = prNextTier(pr);
      document.getElementById("pr-display").style.color = prColor(pr);
      document.getElementById("pr-num").textContent = pr.toLocaleString();
      document.getElementById("pr-tier").textContent = prLabel(pr);
      const prNextEl = document.getElementById("pr-next");
      if (nextPR) {
        prNextEl.textContent = `+${nextPR.needed} to ${nextPR.label}`;
        prNextEl.style.color = prColor(pr + nextPR.needed);
      }
    }

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

const roleLabel = {
  commander: "Commander",
  executive_officer: "Executive Officer",
  recruitment_officer: "Recruitment Officer",
  officer: "Officer",
  private: "Recruit",
};

fetch(`/api/player/${username}/clan`)
  .then((r) => r.json())
  .then(async (clanAccountRes) => {
    const accountId = Object.keys(clanAccountRes.data)[0];
    const membership = clanAccountRes.data[accountId];
    if (!membership) return;

    const { clan_id, joined_at, role, clan } = membership;

    const clanRes = await fetch(`/api/clan/${clan_id}`);
    const clanData = await clanRes.json();
    const details = clanData.data[clan_id];

    applyClanTag(clan.tag);
    clanPayload = { clan, details, role, joined_at };
    tryClanRender();
  })
  .catch((err) => console.error("Error fetching clan data:", err));
