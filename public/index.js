document.getElementById("view-stats").addEventListener("click", (event) => {
  // prevent the default form submission behavior
  event.preventDefault();
  const username = document.getElementById("username").value;
  window.location.href = `/player/${username}`;
});
