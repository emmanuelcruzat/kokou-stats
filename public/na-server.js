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
          ticks: { color: "#e0e6ed", autoSkip: true, maxTicksLimit: 20 },
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
    })
    .catch((err) => console.error("Error loading winrate distribution:", err));
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
}

loadRange("all");
