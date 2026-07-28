const statusElement = document.getElementById("status");

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "Request failed.");
  return result;
}

document.getElementById("registerForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusElement.textContent = "Creating your account...";

  try {
    await postJson("/api/auth/register", {
      username: document.getElementById("username").value,
      password: document.getElementById("password").value,
      age: Number(document.getElementById("age").value),
      country: document.getElementById("country").value
    });

    statusElement.textContent = "Account created! Opening login...";
    setTimeout(() => location.href = "login.html", 700);
  } catch (error) {
    statusElement.textContent = error.message;
  }
});

document.getElementById("loginForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusElement.textContent = "Signing in...";

  try {
    const result = await postJson("/api/auth/login", {
      username: document.getElementById("username").value,
      password: document.getElementById("password").value
    });

    localStorage.setItem("teenverseToken", result.token);
    localStorage.setItem("teenverseUser", JSON.stringify(result.user));
    location.href = "chat.html";
  } catch (error) {
    statusElement.textContent = error.message;
  }
});
