const THEME_KEY = "kokoustats-theme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = theme === "light" ? "☾ Dark Mode" : "☀ Light Mode";
}

// the inline snippet in <head> already set the initial data-theme attribute
// to avoid a flash of the wrong theme; this just syncs the button label
applyTheme(document.documentElement.getAttribute("data-theme") || "dark");

const toggleBtn = document.getElementById("theme-toggle");
if (toggleBtn) {
  toggleBtn.addEventListener("click", () => {
    const next =
      document.documentElement.getAttribute("data-theme") === "light"
        ? "dark"
        : "light";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
}
