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

function renderClanStats() {
  const section = document.getElementById("clan-stats");
  const tracked = allMembers.filter((m) => m.winrate != null);
  if (tracked.length === 0) return;

  const avgWr = (tracked.reduce((sum, m) => sum + m.winrate, 0) / tracked.length) * 100;
  const avgBattles = tracked.reduce((sum, m) => sum + m.battles, 0) / tracked.length;
  const avgDmg = tracked.reduce((sum, m) => sum + (m.battles > 0 ? m.damage_dealt / m.battles : 0), 0) / tracked.length;

  const stat = (label, value, color) => `
    <div class="stat-card">
      <h3 style="border-bottom:none;margin-bottom:0.5rem">${label}</h3>
      <div class="winrate-display" style="border-bottom:none;margin-bottom:0${color ? `;color:${color}` : ""}">
        <div class="metric-pct">${value}</div>
      </div>
    </div>
  `;

  section.innerHTML = `
    <div class="stat-grid" style="grid-template-columns: repeat(3, 1fr)">
      ${stat("Avg. Win Rate", avgWr.toFixed(2) + "%", wrColor(avgWr))}
      ${stat("Avg. Damage", Math.round(avgDmg).toLocaleString())}
      ${stat("Avg. Battles", Math.round(avgBattles).toLocaleString())}
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
    <h2>Members</h2>
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

    const membersSection = document.getElementById("members-container");
    membersSection.style.display = "";
    renderMembersTable();
  })
  .catch((err) => {
    console.error("Error loading member stats:", err);
    document.getElementById("members-container").innerHTML = `
      <h2>Members</h2>
      <p style="color:var(--error-text)">Failed to load member stats.</p>
    `;
    document.getElementById("members-container").style.display = "";
  });
