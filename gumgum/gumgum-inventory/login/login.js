const loginForm = document.getElementById("loginForm");
const passwordField = document.getElementById("password");
const togglePasswordBtn = document.querySelector(".toggle-password");

if (togglePasswordBtn && passwordField) {
  togglePasswordBtn.addEventListener("click", () => {
    const isHidden = passwordField.type === "password";
    passwordField.type = isHidden ? "text" : "password";
    togglePasswordBtn.textContent = isHidden ? "🙈" : "👁️";
    togglePasswordBtn.setAttribute(
      "aria-label",
      isHidden ? "Hide password" : "Show password"
    );
    passwordField.focus();
  });
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = passwordField.value.trim();

  if (username === "admin" && password === "gumgum") {
    localStorage.setItem("isLoggedIn", "true");
    window.location.href = "../main/index.html";
  } else {
    alert("Incorrect username or password. Try admin / gumgum");
  }
});