// wires up a search form + input pair so submitting it navigates to the player's stats page
function wireSearchForm(formId, inputId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = document.getElementById(inputId).value;
    window.location.href = `/player/${username}`;
  });
}

// navbar search bar, present on every page
wireSearchForm("nav-search-form", "nav-username");

// search box on the landing page
wireSearchForm("home-search-form", "home-username");
