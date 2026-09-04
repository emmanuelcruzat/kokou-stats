// mirrors the WoWS rating tiers/colors used for player winrates in player.js
function winrateTierColor(rate) {
  return rate >= 65
    ? "#a855f7" // Super Unicum
    : rate >= 60
      ? "#9b59b6" // Unicum
      : rate >= 56
        ? "#3498db" // Great
        : rate >= 54
          ? "#1abc9c" // Very Good
          : rate >= 52
            ? "#2ecc71" // Good
            : rate >= 49
              ? "#f1c40f" // Average
              : rate >= 47
                ? "#e67e22" // Below Average
                : "#e74c3c"; // Terrible
}

function winrateTierLabel(rate) {
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
                : "Terrible";
}

function makeDistributionChart(id, labels, counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  const colors = labels.map((_, i) => winrateTierColor(i));

  return new Chart(document.getElementById(id), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: counts,
          backgroundColor: colors,
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
              const pct = total ? ((ctx.parsed.y / total) * 100).toFixed(1) : 0;
              const tier = winrateTierLabel(ctx.dataIndex);
              return `${ctx.parsed.y.toLocaleString()} players (${pct}%) — ${tier}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#e0e6ed",
            autoSkip: false,
            callback: (value, index) => (index % 5 === 0 ? `${index}%` : undefined),
          },
          grid: { color: "#1e3448" },
        },
        y: { ticks: { color: "#e0e6ed" }, grid: { color: "#1e3448" } },
      },
    },
  });
}

let distributionChart = null;

function loadDistribution(range) {
  fetch(`/api/na-server/winrate-distribution?range=${range}`)
    .then((response) => response.json())
    .then((data) => {
      if (distributionChart) {
        distributionChart.data.datasets[0].data = data.counts;
        distributionChart.update();
      } else {
        distributionChart = makeDistributionChart(
          "chart-winrate-distribution",
          data.labels,
          data.counts,
        );
      }
      renderSkillTierPercentages(data.counts);
    })
    .catch((err) => console.error("Error loading winrate distribution:", err));
}

// share of players falling into each skill tier (Terrible through Super Unicum), shown as
// its own summary row. data.counts is a 101-bucket (0%-100%) winrate histogram, so buckets
// are rolled up into tiers using the same thresholds winrateTierLabel/Color use elsewhere.
function renderSkillTierPercentages(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  const tiers = [];
  counts.forEach((count, pct) => {
    const label = winrateTierLabel(pct);
    let tier = tiers.find((t) => t.label === label);
    if (!tier) {
      tier = { label, color: winrateTierColor(pct), count: 0 };
      tiers.push(tier);
    }
    tier.count += count;
  });

  document.getElementById("dash-bucket-percentages").innerHTML = tiers
    .map(({ label, color, count }) => {
      const pct = total > 0 ? (count / total) * 100 : 0;
      return `
        <div class="clan-item">
          <div class="clan-item-label">${label}</div>
          <div class="clan-item-value" style="color: ${color}">${pct.toFixed(1)}%</div>
        </div>`;
    })
    .join("");
}

// a few points below the lowest bucket's winrate and above the highest, rather than 0 and
// an auto-scaled max, so the bar-height differences between buckets (usually just a few
// points apart) are actually visible
function winrateByBattlesYMin(winratePcts) {
  const valid = winratePcts.filter((pct) => pct != null);
  if (valid.length === 0) return undefined;
  return Math.max(0, Math.floor(Math.min(...valid) - 2));
}

function winrateByBattlesYMax(winratePcts) {
  const valid = winratePcts.filter((pct) => pct != null);
  if (valid.length === 0) return undefined;
  return Math.ceil(Math.max(...valid) + 2);
}

function makeWinrateByBattlesChart(id, labels, avgWinrates, counts) {
  const winratePcts = avgWinrates.map((wr) => (wr != null ? wr * 100 : null));
  const colors = winratePcts.map((pct) => (pct != null ? winrateTierColor(pct) : "#3a4a5c"));

  return new Chart(document.getElementById(id), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: winratePcts,
          backgroundColor: colors,
          borderWidth: 0,
          counts,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.parsed.y == null) return "No data";
              const count = ctx.dataset.counts[ctx.dataIndex];
              return `${ctx.parsed.y.toFixed(2)}% winrate — ${count.toLocaleString()} players`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#e0e6ed" },
          grid: { color: "#1e3448" },
        },
        y: {
          min: winrateByBattlesYMin(winratePcts),
          max: winrateByBattlesYMax(winratePcts),
          ticks: { color: "#e0e6ed", callback: (value) => `${value}%` },
          grid: { color: "#1e3448" },
        },
      },
    },
  });
}

let winrateByBattlesChart = null;

function loadWinrateByBattles(range) {
  fetch(`/api/na-server/winrate-by-battles?range=${range}`)
    .then((response) => response.json())
    .then((data) => {
      const winratePcts = data.avgWinrates.map((wr) => (wr != null ? wr * 100 : null));
      if (winrateByBattlesChart) {
        const dataset = winrateByBattlesChart.data.datasets[0];
        dataset.data = winratePcts;
        dataset.backgroundColor = winratePcts.map((pct) =>
          pct != null ? winrateTierColor(pct) : "#3a4a5c",
        );
        dataset.counts = data.counts;
        winrateByBattlesChart.options.scales.y.min = winrateByBattlesYMin(winratePcts);
        winrateByBattlesChart.options.scales.y.max = winrateByBattlesYMax(winratePcts);
        winrateByBattlesChart.update();
      } else {
        winrateByBattlesChart = makeWinrateByBattlesChart(
          "chart-winrate-by-battles",
          data.labels,
          data.avgWinrates,
          data.counts,
        );
      }
      renderBattlesBucketPercentages(data.labels, data.counts);
    })
    .catch((err) => console.error("Error loading winrate by battles played:", err));
}

// share of players falling into each battles-played bucket, shown as its own summary row
function renderBattlesBucketPercentages(labels, counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  document.getElementById("dash-battles-bucket-percentages").innerHTML = labels
    .map((label, i) => {
      const pct = total > 0 ? (counts[i] / total) * 100 : 0;
      return `
        <div class="clan-item">
          <div class="clan-item-label">${label} Battles</div>
          <div class="clan-item-value">${pct.toFixed(1)}%</div>
        </div>`;
    })
    .join("");
}

function loadSummary(range) {
  fetch(`/api/na-server/summary?range=${range}`)
    .then((response) => response.json())
    .then((data) => {
      document.getElementById("dash-total-players").textContent =
        data.totalPlayers.toLocaleString();

      if (data.totalPlayers === 0) {
        document.getElementById("dash-average-winrate").textContent = "--";
        document.getElementById("dash-average-battles").textContent = "--";
        document.getElementById("dash-stddev").textContent = "--";
        document.getElementById("dash-q1").textContent = "--";
        document.getElementById("dash-q3").textContent = "--";

        const tierEl = document.getElementById("dash-summary-tier");
        tierEl.textContent = "no data yet";
        tierEl.style.color = "";

        document.getElementById("dash-summary-winrate").textContent = "--";
        document.getElementById("dash-summary-winrate").style.color = "";
        document.getElementById("dash-summary-battles").textContent = "0";
        return;
      }

      const winratePct = data.averageWinrate * 100;
      const tierColor = winrateTierColor(winratePct);

      const avgWrEl = document.getElementById("dash-average-winrate");
      avgWrEl.textContent = `${winratePct.toFixed(2)}%`;
      avgWrEl.style.color = tierColor;

      document.getElementById("dash-average-battles").textContent =
        Math.round(data.averageBattles).toLocaleString();

      document.getElementById("dash-stddev").textContent =
        `±${(data.stdDevWinrate * 100).toFixed(2)}%`;
      document.getElementById("dash-q1").textContent =
        `${(data.q1Winrate * 100).toFixed(2)}%`;
      document.getElementById("dash-q3").textContent =
        `${(data.q3Winrate * 100).toFixed(2)}%`;

      const tierEl = document.getElementById("dash-summary-tier");
      tierEl.textContent = winrateTierLabel(winratePct);
      tierEl.style.color = tierColor;

      const winrateEl = document.getElementById("dash-summary-winrate");
      winrateEl.textContent = `${winratePct.toFixed(2)}%`;
      winrateEl.style.color = tierColor;

      document.getElementById("dash-summary-battles").textContent =
        Math.round(data.averageBattles).toLocaleString();
    })
    .catch((err) => console.error("Error loading NA server summary:", err));
}

function loadRange(range) {
  loadSummary(range);
  loadDistribution(range);
  loadWinrateByBattles(range);
}

loadRange("all");
