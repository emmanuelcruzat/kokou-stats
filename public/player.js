//get the username from the URL
const username = window.location.pathname.split("/")[2];
console.log(username);

// shown while the initial player fetch is in flight, since that request is also what
// checks (and possibly records) a new stats snapshot server-side
const statsUpdateModal = document.getElementById("stats-update-modal");
const statsUpdateModalShownAt = Date.now();
const STATS_UPDATE_MODAL_MIN_MS = 400;

function hideStatsUpdateModal() {
  const elapsed = Date.now() - statsUpdateModalShownAt;
  setTimeout(() => {
    statsUpdateModal.style.display = "none";
  }, Math.max(0, STATS_UPDATE_MODAL_MIN_MS - elapsed));
}

let resolvedClanTag = null;
let resolvedClanId = null;
let clanPayload = null;

function applyClanTag(tag, id) {
  resolvedClanTag = tag;
  resolvedClanId = id;
  const el = document.getElementById("clan-tag");
  if (el) el.innerHTML = `<a href="/clan/${id}" class="clan-leader-link">[${tag}]</a>`;
}

const clanItem = (label, value) =>
  `<div class="clan-item"><div class="clan-item-label">${label}</div><div class="clan-item-value">${value}</div></div>`;

let accountData = null;
let accountId = null;
let captainTitle = null;
let expectedData = null;
let initialPrReady = false;
let currentMode = "pvp";
const modeCache = {};

// windowed (24h/7d/30d/90d/365d) stats, tracked independently per battle-type mode
let currentRange = "all";
const windowsCache = {};
const windowsPromiseCache = {};
const nextSnapshotAtByMode = {};

// per-ship baseline totals for each window, used to compute exact windowed PR (see
// rangeRowStats) — tracked the same way as windowsCache above
const shipWindowsCache = {};
const shipWindowsPromiseCache = {};

const rangeOrder = ["all", "24h", "7d", "30d", "90d", "365d"];
const rangeTableLabels = {
  all: "Overall",
  "24h": "Last 24 Hours",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  "90d": "Last 90 Days",
  "365d": "Last 365 Days",
};

function fetchWindows(mode) {
  if (!windowsPromiseCache[mode]) {
    windowsPromiseCache[mode] = fetch(`/api/player/${username}/windows?mode=${mode}`)
      .then((r) => r.json())
      .then((data) => {
        windowsCache[mode] = data;
        nextSnapshotAtByMode[mode] = data.nextSnapshotAt ?? null;
        if (currentMode === mode) renderNextUpdateNote();
        return data;
      })
      .catch((err) => {
        console.error(`Error loading time-windowed stats for ${mode}:`, err);
        windowsCache[mode] = { windows: {} };
        return windowsCache[mode];
      });
  }
  return windowsPromiseCache[mode];
}

function fetchShipWindows(mode) {
  if (!shipWindowsPromiseCache[mode]) {
    shipWindowsPromiseCache[mode] = fetch(`/api/player/${username}/ship-windows?mode=${mode}`)
      .then((r) => r.json())
      .then((data) => {
        shipWindowsCache[mode] = data;
        return data;
      })
      .catch((err) => {
        console.error(`Error loading windowed ship stats for ${mode}:`, err);
        shipWindowsCache[mode] = { windows: {} };
        return shipWindowsCache[mode];
      });
  }
  return shipWindowsPromiseCache[mode];
}

// standard normal CDF (Abramowitz & Stegun 7.1.26 approximation, ~7 decimal places accurate)
function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) prob = 1 - prob;
  return prob;
}

// two-tailed p-value for a z statistic
function twoTailedPValue(z) {
  return 2 * (1 - normalCdf(Math.abs(z)));
}

// two-proportion z-test comparing a window's win rate against the player's win rate in
// everything OUTSIDE that window (not the raw lifetime rate, which would double-count the
// window itself). Tells apart a real shift in skill from ordinary streak variance — small
// samples naturally need a much bigger gap to clear the bar, since the standard error grows
// as either sample shrinks. Standard p < 0.05 (two-tailed) is the bar for "significant";
// p < 0.01 for "strong".
function winrateSignificance(windowBattles, windowWins, overallBattles, overallWins) {
  const priorBattles = overallBattles - windowBattles;
  const priorWins = overallWins - windowWins;
  if (priorBattles <= 0 || windowBattles <= 0) return null;

  const p1 = priorWins / priorBattles;
  const p2 = windowWins / windowBattles;
  const pooled = (priorWins + windowWins) / (priorBattles + windowBattles);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / priorBattles + 1 / windowBattles));
  if (!se) return null;

  const z = (p2 - p1) / se;
  const pValue = twoTailedPValue(z);
  return { significant: pValue < 0.05, better: z > 0, pValue };
}

// resolves the stats to show for one row of the range table, for the current mode
function rangeRowStats(key) {
  if (key === "all") {
    const entry = modeCache[currentMode];
    if (!entry) return { loading: true };
    const kei =
      entry.pvp.battles > 0
        ? entry.pvp.damage_scouting / entry.pvp.battles / 1000 + entry.winRate
        : null;
    return { available: true, pvp: entry.pvp, winRate: entry.winRate, pr: entry.pr, kei };
  }

  const w = windowsCache[currentMode]?.windows?.[key];
  if (!w) return { loading: true };
  if (!w.available) return { available: false, unlocksAt: w.unlocksAt, reason: w.reason };

  const winRate = w.battles > 0 ? (w.wins / w.battles) * 100 : 0;
  // windowed PR: diff this mode's live per-ship totals against the per-ship baseline
  // snapshot for this window, then run the actual-vs-expected formula on the deltas
  const shipWindow = shipWindowsCache[currentMode]?.windows?.[key];
  const liveShips = modeCache[currentMode]?.ships;
  const pr =
    w.battles > 0 && shipWindow?.available && liveShips && expectedData
      ? calculatePRFromShipTotals(
          diffShipTotals(liveShips, battleModeConfig[currentMode].statsField, shipWindow.ships),
          expectedData,
        )
      : null;
  const kei = w.battles > 0 ? w.damage_scouting / w.battles / 1000 + winRate : null;
  const overall = modeCache[currentMode]?.pvp;
  const significance =
    w.battles > 0 && overall
      ? winrateSignificance(w.battles, w.wins, overall.battles, overall.wins)
      : null;
  return { available: true, pvp: w, winRate, pr, kei, approximate: w.approximate, significance };
}

// (re)builds the Range table for the current mode
function renderRangeTable() {
  const container = document.getElementById("range-toggle");
  if (!modeCache[currentMode]) {
    container.innerHTML = `<div class="loading"><div class="spinner"></div><p>Loading ranges...</p></div>`;
    return;
  }

  const rowStats = rangeOrder.map((key) => ({ key, stats: rangeRowStats(key) }));

  const rows = rowStats
    .map(({ key, stats }) => {
      const label = rangeTableLabels[key];

      if (stats.loading) {
        return `<tr class="range-row locked"><td>${label}</td><td class="placeholder">--</td><td class="placeholder">--</td><td class="placeholder">--</td><td class="placeholder">--</td><td class="placeholder">--</td><td>Loading…</td></tr>`;
      }

      if (!stats.available) {
        const status = stats.reason
          ? stats.reason
          : stats.unlocksAt
            ? `Unlocks ${new Date(stats.unlocksAt).toLocaleDateString()}`
            : "Not tracked yet";
        return `
          <tr class="range-row locked" data-range="${key}">
            <td>${label}</td>
            <td class="placeholder">--</td>
            <td class="placeholder">--</td>
            <td class="placeholder">--</td>
            <td class="placeholder">--</td>
            <td class="placeholder">--</td>
            <td>${status}</td>
          </tr>
        `;
      }

      const { pvp, winRate, pr, kei, approximate, significance } = stats;
      const battles = pvp.battles;
      const hasBattles = battles > 0;
      const sigDot = significance
        ? significance.significant
          ? `<span class="sig-dot ${significance.better ? "sig-up" : "sig-down"}" title="Statistically significant ${significance.better ? "improvement" : "decline"}"></span>`
          : `<span class="sig-dot sig-none" title="Not Statistically Significant"></span>`
        : "";
      const wr = hasBattles
        ? `<span style="color:${wrColor(winRate)}">${winRate.toFixed(2)}%</span>${sigDot}`
        : `<span class="placeholder">--</span>`;
      const avgDmg = hasBattles
        ? Math.round(pvp.damage_dealt / battles).toLocaleString()
        : `<span class="placeholder">--</span>`;
      const prCell =
        pr != null
          ? `<span style="color:${prColor(pr)}">${pr.toLocaleString()}</span>`
          : `<span class="placeholder">--</span>`;
      const keiCell =
        kei != null
          ? `<span style="color:${keiColor(kei)}">${kei.toFixed(2)}</span>`
          : `<span class="placeholder">--</span>`;
      const status = !hasBattles
        ? "No battles on record"
        : approximate
          ? `Since ${new Date(pvp.since).toLocaleDateString()}`
          : "";
      const activeClass = key === currentRange ? " active" : "";

      return `
        <tr class="range-row${activeClass}" data-range="${key}">
          <td>${label}</td>
          <td>${battles.toLocaleString()}</td>
          <td>${wr}</td>
          <td>${avgDmg}</td>
          <td>${prCell}</td>
          <td>${keiCell}</td>
          <td>${status}</td>
        </tr>
      `;
    })
    .join("");

  const legend = `<p class="range-note"><span class="sig-dot sig-up"></span> significant improvement · <span class="sig-dot sig-down"></span> significant decline · <span class="sig-dot sig-none"></span> not statistically significant <a href="/significance" target="_blank" class="info-link">?</a></p>`;

  container.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr><th>Range</th><th>Battles</th><th>Win Rate</th><th>Avg. Damage</th><th>PR</th><th>KEI</th><th>Status</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${legend}
  `;
}

// Charts card: winrate/avg. damage/KEI/PR-over-time, from recorded snapshots
let winrateHistoryChart = null;
let damageHistoryChart = null;
let keiHistoryChart = null;
let prHistoryChart = null;
const historyCache = {};
const historyPromiseCache = {};
const shipHistoryCache = {};
const shipHistoryPromiseCache = {};

function fetchStatHistory(mode) {
  if (!historyPromiseCache[mode]) {
    historyPromiseCache[mode] = fetch(`/api/player/${username}/stat-history?mode=${mode}`)
      .then((r) => r.json())
      .then((data) => {
        historyCache[mode] = data.history ?? [];
        return historyCache[mode];
      })
      .catch((err) => {
        console.error(`Error loading stat history for ${mode}:`, err);
        historyCache[mode] = [];
        return historyCache[mode];
      });
  }
  return historyPromiseCache[mode];
}

function fetchShipStatHistory(mode) {
  if (!shipHistoryPromiseCache[mode]) {
    shipHistoryPromiseCache[mode] = fetch(`/api/player/${username}/ship-stat-history?mode=${mode}`)
      .then((r) => r.json())
      .then((data) => {
        shipHistoryCache[mode] = data.history ?? [];
        return shipHistoryCache[mode];
      })
      .catch((err) => {
        console.error(`Error loading ship stat history for ${mode}:`, err);
        shipHistoryCache[mode] = [];
        return shipHistoryCache[mode];
      });
  }
  return shipHistoryPromiseCache[mode];
}

// creates a line chart the first time, or updates its data on subsequent calls
function renderLineChart(existingChart, canvas, labels, values, opts) {
  if (existingChart) {
    existingChart.data.labels = labels;
    existingChart.data.datasets[0].data = values;
    existingChart.update();
    return existingChart;
  }

  return new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: opts.label,
          data: values,
          borderColor: opts.color,
          backgroundColor: opts.bgColor,
          fill: true,
          tension: 0.25,
          pointRadius: 3,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: opts.tooltipLabel } },
      },
      scales: {
        x: { ticks: { color: "#e0e6ed" }, grid: { color: "#1e3448" } },
        y: {
          ticks: { color: "#e0e6ed", callback: opts.yTickCallback },
          grid: { color: "#1e3448" },
        },
      },
    },
  });
}

function renderChartsCard(history) {
  const winrateCanvas = document.getElementById("chart-winrate-history");
  const damageCanvas = document.getElementById("chart-damage-history");
  const keiCanvas = document.getElementById("chart-kei-history");

  if (history.length < 1) {
    winrateCanvas.style.display = "none";
    damageCanvas.style.display = "none";
    keiCanvas.style.display = "none";
    let placeholder = document.getElementById("charts-history-placeholder");
    if (!placeholder) {
      placeholder = document.createElement("p");
      placeholder.id = "charts-history-placeholder";
      placeholder.className = "range-note";
      winrateCanvas.closest(".charts-grid").insertAdjacentElement("beforebegin", placeholder);
    }
    placeholder.textContent =
      "Not tracked yet — check back after this player has been looked up.";
    return;
  }

  document.getElementById("charts-history-placeholder")?.remove();
  winrateCanvas.style.display = "";
  damageCanvas.style.display = "";
  keiCanvas.style.display = "";

  const labels = history.map((h) => new Date(h.recordedAt).toLocaleDateString());

  winrateHistoryChart = renderLineChart(
    winrateHistoryChart,
    winrateCanvas,
    labels,
    history.map((h) => (h.winrate * 100).toFixed(2)),
    {
      label: "Winrate",
      color: "#3498db",
      bgColor: "rgba(52, 152, 219, 0.15)",
      tooltipLabel: (ctx) => `${ctx.parsed.y}% winrate`,
      yTickCallback: (v) => `${v}%`,
    },
  );

  damageHistoryChart = renderLineChart(
    damageHistoryChart,
    damageCanvas,
    labels,
    history.map((h) => Math.round(h.avgDamage)),
    {
      label: "Avg. Damage",
      color: "#e67e22",
      bgColor: "rgba(230, 126, 34, 0.15)",
      tooltipLabel: (ctx) => `${ctx.parsed.y.toLocaleString()} avg. damage`,
      yTickCallback: (v) => v.toLocaleString(),
    },
  );

  keiHistoryChart = renderLineChart(
    keiHistoryChart,
    keiCanvas,
    labels,
    history.map((h) => h.kei.toFixed(2)),
    {
      label: "KEI",
      color: "#9b59b6",
      bgColor: "rgba(155, 89, 182, 0.15)",
      tooltipLabel: (ctx) => `${ctx.parsed.y} KEI`,
      yTickCallback: (v) => v,
    },
  );
}

// PR-over-time, computed from the per-ship snapshot history (player_ship_stat_history)
// against today's expected values — same data source and cadence as the winrate/damage/KEI
// charts, just run through the actual-vs-expected formula per snapshot
function renderPRChart() {
  const canvas = document.getElementById("chart-pr-history");
  const history = shipHistoryCache[currentMode];

  if (!expectedData || !history || history.length === 0) {
    canvas.style.display = "none";
    let placeholder = document.getElementById("pr-history-placeholder");
    if (!placeholder) {
      placeholder = document.createElement("p");
      placeholder.id = "pr-history-placeholder";
      placeholder.className = "range-note";
      canvas.insertAdjacentElement("afterend", placeholder);
    }
    placeholder.textContent = expectedData
      ? "Not tracked yet — check back after this player has been looked up again."
      : "PR isn't available for this player.";
    return;
  }

  document.getElementById("pr-history-placeholder")?.remove();
  canvas.style.display = "";

  const labels = history.map((h) => new Date(h.recordedAt).toLocaleDateString());
  const values = history.map((h) => calculatePRFromShipTotals(h.ships, expectedData));

  prHistoryChart = renderLineChart(
    prHistoryChart,
    canvas,
    labels,
    values,
    {
      label: "PR",
      color: "#c9a84c",
      bgColor: "rgba(201, 168, 76, 0.15)",
      tooltipLabel: (ctx) => `${ctx.parsed.y.toLocaleString()} PR`,
      yTickCallback: (v) => v.toLocaleString(),
    },
  );
}

// "next update" countdown, based on when the next stat snapshot for this player will be due
function formatCountdown(target) {
  const diffMs = new Date(target).getTime() - Date.now();
  if (diffMs <= 0) {
    return "The next update is available now — look this player up again to record it.";
  }
  const totalMinutes = Math.ceil(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return `Next update available in ${parts.join(" ")}.`;
}

function renderNextUpdateNote() {
  const note = document.getElementById("next-update-note");
  const nextSnapshotAt = nextSnapshotAtByMode[currentMode];
  note.textContent = nextSnapshotAt
    ? formatCountdown(nextSnapshotAt)
    : "This will start tracking the first time this player is looked up.";
}

setInterval(renderNextUpdateNote, 30000);

// shared state for the ships table + charts so they can be re-rendered per battle-type mode
let sortCol = "battles";
let sortAsc = false;
let nationView = "nation";
let classChart = null;
let nationChart = null;
let tierChart = null;
let currentByNation = {};
let currentByCoalition = {};

// maps each battle-type button to the account-info field and ships endpoint needed to load it
const battleModeConfig = {
  pvp: { statsField: "pvp", endpoint: null, shipsExtra: null },
  solo: { statsField: "pvp_solo", endpoint: "solo", shipsExtra: "pvp_solo" },
  div2: { statsField: "pvp_div2", endpoint: "div2", shipsExtra: "pvp_div2" },
  div3: { statsField: "pvp_div3", endpoint: "div3", shipsExtra: "pvp_div3" },
  rank: { statsField: "rank_solo", endpoint: "rank", shipsExtra: "rank_solo" },
  coop: { statsField: "pve", endpoint: "coop", shipsExtra: "pve" },
};

function tryRenderPlayerDetails() {
  if (!accountData || captainTitle === null || !initialPrReady) return;

  document.title = `${accountData.nickname} - KokouStats`;
  document.getElementById("player-header-container").innerHTML = `
    <div class="player-header">
      <h2><span id="clan-tag">${resolvedClanTag ? `<a href="/clan/${resolvedClanId}" class="clan-leader-link">[${resolvedClanTag}]</a>` : ""}</span>${accountData.nickname}</h2>
      <div id="captain-title" class="captain-title">${captainTitle}</div>
      <div class="player-meta">
        <span>Last Battle: ${new Date(accountData.last_battle_time * 1000).toLocaleString()}</span>
        <span>Updated: ${new Date(accountData.stats_updated_at * 1000).toLocaleString()}</span>
      </div>
    </div>
  `;

}

// fetches and caches the account + ship stats needed to display a given battle type
async function loadMode(mode) {
  if (modeCache[mode]) return modeCache[mode];

  const config = battleModeConfig[mode];
  const [accountRes, shipsRes] = await Promise.all([
    fetch(`/api/player/${username}/${config.endpoint}`).then((r) => r.json()),
    fetch(`/api/player/${username}/ships?extra=${config.shipsExtra}`).then((r) => r.json()),
  ]);

  const pvp = accountRes.data[accountId].statistics[config.statsField];
  const winRate = (pvp.wins / pvp.battles) * 100;
  const currentWrColor = wrColor(winRate);
  const modeShips = shipsRes.data[accountId];
  const pr = expectedData ? calculatePR(modeShips, expectedData, config.statsField) : null;

  const entry = { pvp, winRate, currentWrColor, pr, ships: modeShips };
  modeCache[mode] = entry;
  return entry;
}

function tryClanRender() {
  const clanCard = document.getElementById("clan-card");
  if (!clanCard || !clanPayload) return;
  const { clan, details, role, joined_at } = clanPayload;
  clanCard.style.display = "";
  clanCard.innerHTML = `
    <h3>Clan</h3>
    <div class="clan-row">
      ${clanItem("Name", `<a href="/clan/${clanPayload.clan_id}" class="clan-leader-link">[${clan.tag}] ${clan.name}</a>`)}
      ${clanItem("Role", roleLabel[role] ?? role)}
      ${clanItem("Joined", new Date(joined_at * 1000).toLocaleDateString())}
      <div class="clan-divider"></div>
      ${clanItem("Leader", `<a href="/player/${details.leader_name}" class="clan-leader-link">${details.leader_name}</a>`)}
      ${clanItem("Members", clan.members_count)}
    </div>
  `;
}

// range table + Charts card: shown for every battle-type mode, each tracked
// independently via the per-mode caches above
const rangeToggle = document.getElementById("range-toggle");

// (re)loads the range table + Charts card for whichever mode is passed in, using
// cached data where available and fetching (once, cached) otherwise
function loadRangeAndCharts(mode) {
  renderRangeTable();
  renderNextUpdateNote();
  renderPRChart();

  fetchWindows(mode).then(() => {
    if (currentMode === mode) renderRangeTable();
  });
  fetchShipWindows(mode).then(() => {
    if (currentMode === mode) renderRangeTable();
  });
  fetchStatHistory(mode).then((history) => {
    if (currentMode === mode) renderChartsCard(history);
  });
  fetchShipStatHistory(mode).then(() => {
    if (currentMode === mode) renderPRChart();
  });
}

// event delegation: the range table is fully rebuilt on every render, so the
// listener is attached once on the (stable) container
rangeToggle.addEventListener("click", (e) => {
  const row = e.target.closest("tr.range-row:not(.locked)");
  if (!row) return;
  const range = row.dataset.range;
  if (range === currentRange) return;

  currentRange = range;
  renderRangeTable();
});

// battle type rack: switches the Range table, Charts card, and ships data between
// Random Battles, Solo, Duo Division, Trio Division, Ranked, and Co-Op
const battleTypeButtons = document.querySelectorAll("#mode-toggle .battle-type-btn");
battleTypeButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const mode = btn.dataset.mode;
    if (!accountId || mode === currentMode) return;

    battleTypeButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = mode;
    currentRange = "all";
    loadRangeAndCharts(mode);
    renderShipsForMode(mode);

    if (modeCache[mode]) {
      renderRangeTable();
      renderPRChart();
      return;
    }

    try {
      await loadMode(mode);
      if (currentMode === mode) {
        renderRangeTable();
        renderPRChart();
        renderShipsForMode(mode);
      }
    } catch (err) {
      console.error("Error loading battle type stats:", err);
      if (currentMode === mode) {
        document.getElementById("range-toggle").innerHTML =
          `<p>Error loading stats. Please try again later.</p>`;
        document.getElementById("ships-container").innerHTML =
          `<p>Error loading ship stats. Please try again later.</p>`;
      }
    }
  });
});

// fetch the player's main stats from the server
fetch(`/api/player/${username}`)
  .then((response) => response.json())
  .then((data) => {
    console.log(data);
    document.getElementById;

    // display the player's stats on the page
    accountId = Object.keys(data.data)[0];
    accountData = data.data[accountId];
    const pvp = accountData.statistics.pvp;
    const winRate = (pvp.wins / pvp.battles) * 100;
    const currentWrColor = wrColor(winRate);

    modeCache.pvp = { pvp, winRate, currentWrColor, pr: null };
    tryRenderPlayerDetails();
    tryClanRender();
    hideStatsUpdateModal();

    // eagerly load the range table + Charts card since pvp is the default mode
    loadRangeAndCharts("pvp");
  })
  .catch((error) => {
    console.error("Error fetching player stats:", error);
    const statsContainer = document.getElementById("stats-container");
    statsContainer.innerHTML = `<p>Error fetching player stats. Please try again later.</p>`;
    hideStatsUpdateModal();
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

function getSortVal(ship, key, pvpKey = "pvp") {
  const pvp = ship[pvpKey];
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

const coalitionColors = {
  Allies: "#3498db",
  Axis: "#e74c3c",
  "Non-Aligned": "#c9a84c",
};

const nationColors = {
  "United States": "#3498db",
  "United Kingdom": "#e74c3c",
  France: "#5dade2",
  "British Commonwealth": "#9b59b6",
  Netherlands: "#e67e22",
  "Soviet Union": "#c0392b",
  "Pan-America": "#1abc9c",
  "German Reich": "#95a5a6",
  "Empire of Japan": "#e91e63",
  "Kingdom of Italy": "#2ecc71",
  "Spanish State": "#f39c12",
  "Pan-Europe": "#34495e",
  "Pan-Asia": "#f1c40f",
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

// the WoWS Numbers PR formula, given per-ship actual totals ({shipId, battles, wins,
// damageDealt, frags}) for some slice of a player's play — their whole career, a past
// snapshot, or a windowed delta between two snapshots — compared against today's
// per-ship expected values
function calculatePRFromShipTotals(shipTotals, expectedData) {
  let actualDmg = 0,
    actualFrags = 0,
    actualWins = 0;
  let expectedDmg = 0,
    expectedFrags = 0,
    expectedWins = 0;

  shipTotals.forEach(({ shipId, battles, wins, damageDealt, frags }) => {
    if (!battles) return;
    const exp = expectedData[shipId];
    // wows-numbers returns [] (not an object) for ships it doesn't have enough samples
    // for yet — treat that the same as no expected data for this ship
    if (!exp || Array.isArray(exp)) return;

    // Number(...) guards against damageDealt arriving as a numeric string (e.g. Postgres
    // BIGINT columns come back as strings), where += would silently concatenate instead
    // of add
    actualDmg += Number(damageDealt);
    actualFrags += Number(frags);
    actualWins += Number(wins);
    expectedDmg += exp.average_damage_dealt * battles;
    expectedFrags += exp.average_frags * battles;
    expectedWins += (exp.win_rate / 100) * battles;
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

// reshapes a live ships response (as returned by /api/player/:username/ships, keyed by
// ship_id/damage_dealt snake_case) into the {shipId, battles, wins, damageDealt, frags}
// shape calculatePRFromShipTotals expects
function normalizeShipTotals(ships, pvpKey = "pvp") {
  return ships.map((ship) => {
    const pvp = ship[pvpKey];
    return {
      shipId: ship.ship_id,
      battles: pvp?.battles ?? 0,
      wins: pvp?.wins ?? 0,
      damageDealt: pvp?.damage_dealt ?? 0,
      frags: pvp?.frags ?? 0,
    };
  });
}

// diffs live per-ship totals against a baseline snapshot's per-ship totals (keyed by
// ship_id, as returned by /api/player/:username/ship-windows), for windowed PR. Ships not
// present in the baseline (bought/first played within the window) diff against zero.
// Negative deltas (a ship's counters look like they went backwards — stats reset, snapshot
// skew) are clamped to zero rather than allowed to pollute the total.
function diffShipTotals(ships, pvpKey, baselineShips) {
  return ships.map((ship) => {
    const pvp = ship[pvpKey];
    const baseline = baselineShips?.[ship.ship_id];
    return {
      shipId: ship.ship_id,
      battles: Math.max(0, (pvp?.battles ?? 0) - (baseline?.battles ?? 0)),
      wins: Math.max(0, (pvp?.wins ?? 0) - (baseline?.wins ?? 0)),
      damageDealt: Math.max(0, (pvp?.damage_dealt ?? 0) - (baseline?.damageDealt ?? 0)),
      frags: Math.max(0, (pvp?.frags ?? 0) - (baseline?.frags ?? 0)),
    };
  });
}

function calculatePR(ships, expectedData, pvpKey = "pvp") {
  return calculatePRFromShipTotals(normalizeShipTotals(ships, pvpKey), expectedData);
}

function renderShipsTable(ships, sortCol, sortAsc, pvpKey = "pvp") {
  const ph = `<td class="placeholder">--</td>`;
  const sorted = [...ships].sort((a, b) => {
    const aVal = getSortVal(a, sortCol, pvpKey);
    const bVal = getSortVal(b, sortCol, pvpKey);
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
      const pvp = ship[pvpKey];
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

const barChartColor = "#3498db";

function makeBarChart(id, labels, values) {
  const total = values.reduce((a, b) => a + b, 0);
  return new Chart(document.getElementById(id), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: barChartColor,
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

function makeChart(id, labels, values, colors) {
  const total = values.reduce((a, b) => a + b, 0);
  return new Chart(document.getElementById(id), {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors ?? chartColors.slice(0, labels.length),
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

function updateNationChart(labels, values, colors) {
  const total = values.reduce((a, b) => a + b, 0);
  nationChart.data.labels = labels;
  nationChart.data.datasets[0].data = values;
  nationChart.data.datasets[0].backgroundColor =
    colors ?? chartColors.slice(0, labels.length);
  nationChart.options.plugins.tooltip.callbacks.label = (ctx) => {
    const pct = ((ctx.parsed / total) * 100).toFixed(1);
    return `${ctx.label}: ${ctx.parsed.toLocaleString()} battles (${pct}%)`;
  };
  nationChart.update();
}

// aggregates per-ship battle counts by class, nation, tier, and coalition for the given battle-type stats field
function aggregateShipBattles(ships, pvpKey) {
  const byClass = {};
  const byNation = {};
  const byTierNum = {};
  const byCoalition = {};
  ships.forEach((ship) => {
    const battles = ship[pvpKey]?.battles ?? 0;
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
  return { byClass, byNation, byTierNum, byCoalition };
}

// (re)builds the charts and ships table for the given mode's ships data
function renderShipSection(ships, pvpKey) {
  const shipsContainer = document.getElementById("ships-container");
  const { byClass, byNation, byTierNum, byCoalition } = aggregateShipBattles(ships, pvpKey);
  currentByNation = byNation;
  currentByCoalition = byCoalition;

  const classLabels = Object.keys(byClass);
  const classValues = Object.values(byClass);
  const nationLabels = Object.keys(byNation);
  const coalitionLabels = Object.keys(byCoalition);
  const allTiers = Array.from({ length: 11 }, (_, i) => i + 1);
  const tierValues = allTiers.map((t) => byTierNum[t] ?? 0);

  if (!classChart) {
    classChart = makeChart("chart-class", classLabels, classValues);
  } else {
    const total = classValues.reduce((a, b) => a + b, 0);
    classChart.data.labels = classLabels;
    classChart.data.datasets[0].data = classValues;
    classChart.data.datasets[0].backgroundColor = chartColors.slice(0, classLabels.length);
    classChart.options.plugins.tooltip.callbacks.label = (ctx) => {
      const pct = ((ctx.parsed / total) * 100).toFixed(1);
      return `${ctx.label}: ${ctx.parsed.toLocaleString()} battles (${pct}%)`;
    };
    classChart.update();
  }

  if (!nationChart) {
    nationChart = makeChart(
      "chart-nation",
      nationLabels,
      Object.values(byNation),
      nationLabels.map((label) => nationColors[label] ?? "#546e7a"),
    );
  } else if (nationView === "nation") {
    updateNationChart(
      nationLabels,
      Object.values(byNation),
      nationLabels.map((label) => nationColors[label] ?? "#546e7a"),
    );
  } else {
    updateNationChart(
      coalitionLabels,
      Object.values(byCoalition),
      coalitionLabels.map((label) => coalitionColors[label] ?? "#546e7a"),
    );
  }

  if (!tierChart) {
    tierChart = makeBarChart(
      "chart-tier",
      allTiers.map((t) => romanNumerals[t - 1]),
      tierValues,
    );
  } else {
    const total = tierValues.reduce((a, b) => a + b, 0);
    tierChart.data.datasets[0].data = tierValues;
    tierChart.options.plugins.tooltip.callbacks.label = (ctx) => {
      const pct = ((ctx.parsed.y / total) * 100).toFixed(1);
      return `${ctx.parsed.y.toLocaleString()} battles (${pct}%)`;
    };
    tierChart.update();
  }

  shipsContainer.innerHTML = renderShipsTable(ships, sortCol, sortAsc, pvpKey);
}

// shows the ships table + charts for the given battle-type mode, using cached data if available
function renderShipsForMode(mode) {
  const shipsContainer = document.getElementById("ships-container");
  const entry = modeCache[mode];
  if (!entry || !entry.ships) {
    shipsContainer.innerHTML = `<div class="loading"><div class="spinner"></div><p>Loading ship statistics...</p></div>`;
    return;
  }
  renderShipSection(entry.ships, battleModeConfig[mode].statsField);
}

const toggleNation = document.getElementById("toggle-nation");
const toggleCoalition = document.getElementById("toggle-coalition");

toggleNation.addEventListener("click", () => {
  nationView = "nation";
  const labels = Object.keys(currentByNation);
  updateNationChart(
    labels,
    Object.values(currentByNation),
    labels.map((label) => nationColors[label] ?? "#546e7a"),
  );
  toggleNation.classList.add("active");
  toggleCoalition.classList.remove("active");
});

toggleCoalition.addEventListener("click", () => {
  nationView = "coalition";
  const labels = Object.keys(currentByCoalition);
  updateNationChart(
    labels,
    Object.values(currentByCoalition),
    labels.map((label) => coalitionColors[label] ?? "#546e7a"),
  );
  toggleCoalition.classList.add("active");
  toggleNation.classList.remove("active");
});

document.getElementById("ships-container").addEventListener("click", (e) => {
  const th = e.target.closest("th[data-col]");
  if (!th) return;
  const entry = modeCache[currentMode];
  if (!entry || !entry.ships) return;

  const col = th.dataset.col;
  if (col === sortCol) {
    sortAsc = !sortAsc;
  } else {
    sortCol = col;
    sortAsc = false;
  }
  const pvpKey = battleModeConfig[currentMode].statsField;
  document.getElementById("ships-container").innerHTML = renderShipsTable(entry.ships, sortCol, sortAsc, pvpKey);
});

fetch(`/api/player/${username}/ships`)
  .then((r) => r.json())
  .then((data) => {
    const ships = data.data[Object.keys(data.data)[0]];
    modeCache.pvp = { ...modeCache.pvp, ships };

    // captain title is always based on overall Random Battles play, regardless of selected mode
    const { byClass, byCoalition } = aggregateShipBattles(ships, "pvp");

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

    captainTitle = coalitionPrefix ? `${coalitionPrefix} ${shipTypeTitle}` : shipTypeTitle;
    tryRenderPlayerDetails();

    renderShipSection(ships, "pvp");

    fetch(`/api/expected`)
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null)
      .then((expectedRes) => {
        expectedData = expectedRes ? expectedRes.data : null;
        if (modeCache.pvp) {
          modeCache.pvp.pr = expectedData ? calculatePR(ships, expectedData, "pvp") : null;
        }
        // backfill PR for any other modes the player switched to before this resolved —
        // loadMode() computes it inline, but only using whatever expectedData was in hand
        // at the time
        Object.entries(modeCache).forEach(([mode, entry]) => {
          if (mode === "pvp" || !entry.ships) return;
          const statsField = battleModeConfig[mode].statsField;
          entry.pr = expectedData ? calculatePR(entry.ships, expectedData, statsField) : null;
        });
        initialPrReady = true;
        tryRenderPlayerDetails();
        renderPRChart();
        renderRangeTable();
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

    applyClanTag(clan.tag, clan_id);
    clanPayload = { clan, clan_id, details, role, joined_at };
    tryClanRender();
  })
  .catch((err) => console.error("Error fetching clan data:", err));
