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

fetch("/api/na-server/winrate-distribution")
  .then((response) => response.json())
  .then((data) => {
    makeDistributionChart("chart-winrate-distribution", data.labels, data.counts);
  })
  .catch((err) => console.error("Error loading winrate distribution:", err));

fetch("/api/na-server/summary")
  .then((response) => response.json())
  .then((data) => {
    document.getElementById("dash-total-players").textContent =
      data.totalPlayers.toLocaleString();

    document.getElementById("dash-average-winrate").textContent =
      `${(data.averageWinrate * 100).toFixed(2)}%`;

    document.getElementById("dash-average-battles").textContent =
      Math.round(data.averageBattles).toLocaleString();

    const winratePct = data.averageWinrate * 100;
    const tierColor = winrateTierColor(winratePct);

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
