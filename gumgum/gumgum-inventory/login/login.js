const loginForm = document.getElementById("loginForm");
const loginCard = document.querySelector(".login-card");
const pinForm = document.getElementById("pinForm");
const pinInput = document.getElementById("staffPin");
const pinError = document.getElementById("pinError");
const pinHelp = document.getElementById("pinHelp");
const pinSubmit = document.querySelector(".pin-submit");
const passwordField = document.getElementById("password");
const togglePasswordBtn = document.querySelector(".toggle-password");

if (pinForm && pinInput) {
  pinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const pinValue = pinInput.value.trim().toLowerCase();

    if (pinValue === "kang") {
      pinError.hidden = true;
      if (pinHelp) {
        pinHelp.textContent = "Access granted. Proceed with your staff credentials.";
      }
      pinForm.classList.remove("pin-form--error");
      pinForm.classList.add("pin-form--success");
      if (pinSubmit) {
        pinSubmit.textContent = "Access Granted";
        pinSubmit.disabled = true;
      }
      pinInput.disabled = true;
      loginForm.hidden = false;
      loginCard?.classList.add("login-card--unlocked");

      requestAnimationFrame(() => {
        const usernameField = document.getElementById("username");
        usernameField?.focus();
      });

      setTimeout(() => {
        pinForm.hidden = true;
      }, 350);
    } else {
      pinError.hidden = false;
      pinForm.classList.remove("pin-form--success");
      pinForm.classList.add("pin-form--error");
      pinInput.focus();
      pinInput.select();
      setTimeout(() => pinForm.classList.remove("pin-form--error"), 400);
    }
  });

  pinInput.addEventListener("input", () => {
    pinError.hidden = true;
  });
}

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