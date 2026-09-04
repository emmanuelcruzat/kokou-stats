const clanId = window.location.pathname.split("/")[2];

const roleLabel = {
  commander: "Commander",
  executive_officer: "Executive Officer",
  commissioned_officer: "Commissioned Officer",
  recruitment_officer: "Recruiter",
  officer: "Line Officer",
  private: "Midshipman",
};

const roleOrder = {
  commander: 0,
  executive_officer: 1,
  commissioned_officer: 2,
  recruitment_officer: 3,
  officer: 4,
  private: 5,
};

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

// same 8-tier win rate scale as player.js — see that file's TIER_LABELS/WR_TIER_CUTOFFS
// comment for why the color doubles as a lookup key
const TIER_LABELS = {
  "#a855f7": "Super Unicum",
  "#9b59b6": "Unicum",
  "#3498db": "Great",
  "#1abc9c": "Very Good",
  "#2ecc71": "Good",
  "#f1c40f": "Average",
  "#e67e22": "Below Average",
  "#e74c3c": "Bad",
};

const TIER_ORDER = ["Bad", "Below Average", "Average", "Good", "Very Good", "Great", "Unicum", "Super Unicum"];
const TIER_COLORS = ["#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#1abc9c", "#3498db", "#9b59b6", "#a855f7"];
const WR_TIER_CUTOFFS = [0, 47, 49, 52, 54, 56, 60, 65];

function nextTierGap(value, cutoffs) {
  let idx = 0;
  for (let i = 1; i < cutoffs.length; i++) {
    if (value >= cutoffs[i]) idx = i;
  }
  if (idx >= cutoffs.length - 1) return null;
  return { label: TIER_ORDER[idx + 1], color: TIER_COLORS[idx + 1], gap: cutoffs[idx + 1] - value };
}

let allMembers = [];
let sortCol = "role";
let sortAsc = true;

const columns = [
  { key: "account_name", label: "Player" },
  { key: "role", label: "Role" },
  { key: "battles", label: "Battles" },
  { key: "winrate", label: "Win Rate" },
  { key: "joined_at", label: "Joined" },
];

function getSortVal(member, key) {
  switch (key) {
    case "account_name": return member.account_name.toLowerCase();
    case "role": return roleOrder[member.role] ?? 99;
    case "winrate": return member.winrate ?? -1;
    case "battles": return member.battles ?? 0;
    case "joined_at": return member.joined_at;
  }
}

const clanItem = (label, value) =>
  `<div class="clan-item"><div class="clan-item-label">${label}</div><div class="clan-item-value">${value}</div></div>`;

// battles-weighted (total wins / total battles), matching wows-numbers' clan average — an
// unweighted mean of each member's win rate lets a handful of battles from an inactive
// member swing the number as much as a main's full season
function clanAvgWinRate(tracked) {
  const totalBattles = tracked.reduce((sum, m) => sum + m.battles, 0);
  return (tracked.reduce((sum, m) => sum + m.winrate * m.battles, 0) / totalBattles) * 100;
}

function renderClanStats() {
  const section = document.getElementById("clan-stats");
  const tracked = allMembers.filter((m) => m.winrate != null);
  if (tracked.length === 0) return;

  const totalBattles = tracked.reduce((sum, m) => sum + m.battles, 0);
  const totalDamage = tracked.reduce((sum, m) => sum + m.damage_dealt, 0);
  const avgWr = clanAvgWinRate(tracked);
  const avgBattles = totalBattles / tracked.length;
  const avgDmg = totalDamage / totalBattles;

  const wrTierColor = wrColor(avgWr);
  const nextTier = nextTierGap(avgWr, WR_TIER_CUTOFFS);
  const wrValue = `
    <span style="color:${wrTierColor}">${avgWr.toFixed(2)}%</span>
    <span class="hero-tier" style="color:${wrTierColor}">${TIER_LABELS[wrTierColor]}</span>
    ${nextTier ? `<div class="hero-next" style="color:${nextTier.color}">+${nextTier.gap.toFixed(2)}% to ${nextTier.label}</div>` : ""}
  `;

  section.innerHTML = `
    <h2 class="section-title">Clan Stats</h2>
    <div class="clan-row overall-hero-row">
      ${clanItem("Avg. Win Rate", wrValue)}
      ${clanItem("Avg. Damage", Math.round(avgDmg).toLocaleString())}
      ${clanItem("Avg. Battles", Math.round(avgBattles).toLocaleString())}
    </div>
  `;
  section.style.display = "";
}

function renderMembersTable() {
  const container = document.getElementById("members-container");
  const sorted = [...allMembers].sort((a, b) => {
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
    .map((m) => {
      const wr = m.winrate != null ? (m.winrate * 100).toFixed(2) + "%" : `<span class="placeholder">--</span>`;
      const wrStyle = m.winrate != null ? `style="color:${wrColor(m.winrate * 100)}"` : "";
      const battles = m.battles > 0 ? m.battles.toLocaleString() : `<span class="placeholder">--</span>`;
      return `
        <tr>
          <td><a href="/player/${m.account_name}" class="clan-leader-link">${m.account_name}</a></td>
          <td>${roleLabel[m.role] ?? m.role}</td>
          <td>${battles}</td>
          <td ${wrStyle}>${wr}</td>
          <td>${new Date(m.joined_at * 1000).toLocaleDateString()}</td>
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <h2 class="section-title">Members</h2>
    <div class="table-wrapper">
      <table>
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  container.addEventListener("click", (e) => {
    const th = e.target.closest("th[data-col]");
    if (!th) return;
    const col = th.dataset.col;
    if (col === sortCol) {
      sortAsc = !sortAsc;
    } else {
      sortCol = col;
      sortAsc = col === "role";
    }
    renderMembersTable();
  }, { once: true });
}

const clanPromise = fetch(`/api/clan/${clanId}`).then((r) => r.json());
const statsPromise = fetch(`/api/clan/${clanId}/members/stats`).then((r) => r.json());

clanPromise
  .then((data) => {
    const clan = data.data[clanId];
    if (!clan) throw new Error("Clan not found");

    document.title = `[${clan.tag}] ${clan.name} - KokouStats`;
    const created = new Date(clan.created_at * 1000).toLocaleDateString();

    document.getElementById("clan-header-container").innerHTML = `
      <div class="player-header">
        <h2><span style="color:#4fc3f7">[${clan.tag}]</span> ${clan.name}</h2>
        <div id="clan-skill-tag"></div>
        ${clan.description ? `<p style="color:var(--text-secondary);margin-top:0.5rem;line-height:1.5">${clan.description}</p>` : ""}
        <div class="clan-row" style="margin-top:1.25rem">
          <div class="clan-item">
            <div class="clan-item-label">Commander</div>
            <div class="clan-item-value">
              <a href="/player/${clan.leader_name}" class="clan-leader-link">${clan.leader_name}</a>
            </div>
          </div>
          <div class="clan-divider"></div>
          <div class="clan-item">
            <div class="clan-item-label">Members</div>
            <div class="clan-item-value">${clan.members_count}</div>
          </div>
          <div class="clan-item">
            <div class="clan-item-label">Founded</div>
            <div class="clan-item-value">${created}</div>
          </div>
        </div>
      </div>
    `;

    return clan;
  })
  .catch((err) => {
    console.error("Error fetching clan data:", err);
    document.getElementById("clan-header-container").innerHTML = "";
    document.querySelector(".error-message").style.display = "";
  });

Promise.all([clanPromise, statsPromise])
  .then(([clanData, statsData]) => {
    const clan = clanData.data[clanId];
    if (!clan?.members) return;

    const stats = statsData.data ?? {};
    allMembers = Object.values(clan.members).map((m) => ({
      ...m,
      winrate: stats[m.account_id]?.winrate ?? null,
      battles: stats[m.account_id]?.battles ?? 0,
      damage_dealt: stats[m.account_id]?.damage_dealt ?? 0,
    }));

    renderClanStats();

    const tracked = allMembers.filter((m) => m.winrate != null);
    const skillTagEl = document.getElementById("clan-skill-tag");
    if (skillTagEl && tracked.length > 0) {
      const avgWr = clanAvgWinRate(tracked);
      const color = wrColor(avgWr);
      skillTagEl.innerHTML = `<span class="skill-tag" style="color:${color}; border-color:${color}">${TIER_LABELS[color]} Clan</span>`;
    }

    const membersSection = document.getElementById("members-container");
    membersSection.style.display = "";
    renderMembersTable();
  })
  .catch((err) => {
    console.error("Error loading member stats:", err);
    document.getElementById("members-container").innerHTML = `
      <h2 class="section-title">Members</h2>
      <p style="color:var(--error-text)">Failed to load member stats.</p>
    `;
    document.getElementById("members-container").style.display = "";
  });
