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

let allMembers = [];
let sortCol = "role";
let sortAsc = true;

const columns = [
  { key: "account_name", label: "Player" },
  { key: "role", label: "Role" },
  { key: "joined_at", label: "Joined" },
];

function getSortVal(member, key) {
  switch (key) {
    case "account_name":
      return member.account_name.toLowerCase();
    case "role":
      return roleOrder[member.role] ?? 99;
    case "joined_at":
      return member.joined_at;
  }
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
    .map(
      (m) => `
    <tr>
      <td><a href="/player/${m.account_name}" class="clan-leader-link">${m.account_name}</a></td>
      <td>${roleLabel[m.role] ?? m.role}</td>
      <td>${new Date(m.joined_at * 1000).toLocaleDateString()}</td>
    </tr>
  `,
    )
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
      sortAsc = true;
    }
    renderMembersTable();
  }, { once: true });
}

fetch(`/api/clan/${clanId}`)
  .then((r) => r.json())
  .then((data) => {
    const clan = data.data[clanId];
    if (!clan) throw new Error("Clan not found");

    document.title = `[${clan.tag}] ${clan.name} — KokouStats`;

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

    allMembers = clan.members ? Object.values(clan.members) : [];

    const membersSection = document.getElementById("members-container");
    membersSection.style.display = "";
    renderMembersTable();
  })
  .catch((err) => {
    console.error("Error fetching clan data:", err);
    document.getElementById("clan-header-container").innerHTML = "";
    document.querySelector(".error-message").style.display = "";
  });
