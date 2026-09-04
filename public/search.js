// wires up a search form + input pair so submitting it navigates to the player's stats
// page, and attaches a username-suggestions dropdown fed by /api/players/search
function wireSearchForm(formId, inputId) {
  const form = document.getElementById(formId);
  const input = document.getElementById(inputId);
  if (!form || !input) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    goToPlayer(input.value);
  });

  wireSuggestions(form, input);
}

function goToPlayer(username) {
  const trimmed = username.trim();
  if (!trimmed) return;
  window.location.href = `/player/${encodeURIComponent(trimmed)}`;
}

const SUGGESTION_DEBOUNCE_MS = 150;
const SUGGESTION_MIN_CHARS = 2;

// attaches a keyboard-navigable, click-to-select suggestions dropdown to `input`, positioned
// under it within `form` (which is given position: relative so the dropdown, appended as a
// form child, can be absolutely positioned to match the input's own position/size)
function wireSuggestions(form, input) {
  form.style.position = "relative";
  form.setAttribute("autocomplete", "off");

  const list = document.createElement("ul");
  list.className = "search-suggestions";
  list.hidden = true;
  form.appendChild(list);

  let debounceTimer = null;
  let requestToken = 0;
  let activeIndex = -1;
  let currentUsernames = [];

  function hide() {
    list.hidden = true;
    list.innerHTML = "";
    activeIndex = -1;
    currentUsernames = [];
  }

  function updateActive() {
    Array.from(list.children).forEach((li, i) => {
      li.classList.toggle("active", i === activeIndex);
    });
  }

  function selectUsername(username) {
    input.value = username;
    hide();
    goToPlayer(username);
  }

  function render(usernames) {
    currentUsernames = usernames;
    activeIndex = -1;
    if (usernames.length === 0) {
      hide();
      return;
    }

    list.innerHTML = "";
    list.style.left = `${input.offsetLeft}px`;
    list.style.top = `${input.offsetTop + input.offsetHeight + 4}px`;
    list.style.width = `${input.offsetWidth}px`;

    usernames.forEach((username) => {
      const item = document.createElement("li");
      item.textContent = username;
      // mousedown (not click) fires before the input's blur handler, so preventing its
      // default here stops the input from losing focus/hiding the list before we can select
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        selectUsername(username);
      });
      list.appendChild(item);
    });

    list.hidden = false;
  }

  input.addEventListener("input", () => {
    const query = input.value.trim();
    clearTimeout(debounceTimer);

    if (query.length < SUGGESTION_MIN_CHARS) {
      hide();
      return;
    }

    debounceTimer = setTimeout(async () => {
      const token = ++requestToken;
      try {
        const response = await fetch(`/api/players/search?q=${encodeURIComponent(query)}`);
        if (!response.ok || token !== requestToken) return;
        const data = await response.json();
        if (token !== requestToken) return;
        render((data.suggestions || []).map((s) => s.username));
      } catch (err) {
        // suggestions are a nice-to-have; silently ignore network errors
      }
    }, SUGGESTION_DEBOUNCE_MS);
  });

  input.addEventListener("keydown", (event) => {
    if (list.hidden || currentUsernames.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % currentUsernames.length;
      updateActive();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + currentUsernames.length) % currentUsernames.length;
      updateActive();
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectUsername(currentUsernames[activeIndex]);
    } else if (event.key === "Escape") {
      hide();
    }
  });

  // delayed so a suggestion's mousedown handler still fires before the list is torn down
  input.addEventListener("blur", () => setTimeout(hide, 100));
}

// navbar search bar, present on every page
wireSearchForm("nav-search-form", "nav-username");

// search box on the landing page
wireSearchForm("home-search-form", "home-username");
