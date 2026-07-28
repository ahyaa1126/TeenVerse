const token = localStorage.getItem("teenverseToken");
const currentUser = JSON.parse(localStorage.getItem("teenverseUser") || "null");

if (!token || !currentUser) {
  location.href = "login.html";
}

const socket = io({ auth: { token } });
const $ = (selector) => document.querySelector(selector);

// =========================
// PROFILE POPUP
// =========================
const profileModal = document.getElementById("profileModal");
const closeProfile = document.getElementById("closeProfile");
const profileImage = document.getElementById("profileImage");
const profileName = document.getElementById("profileName");
const profileRole = document.getElementById("profileRole");
const profileCountry = document.getElementById("profileCountry");
const profileAge = document.getElementById("profileAge");
const profileBio = document.getElementById("profileBio");
const profileStatus = document.getElementById("profileStatus");

const saveProfileBtn = document.getElementById("saveProfileBtn");

// =========================
// DIRECT MESSAGES
// =========================

const dmModal = document.getElementById("dmModal");
const closeDM = document.getElementById("closeDM");
const dmTitle = document.getElementById("dmTitle");
const dmMessages = document.getElementById("dmMessages");
const dmInput = document.getElementById("dmInput");
const sendDM = document.getElementById("sendDM");
const startDM = document.getElementById("startDM");

let currentDMUser = null;

let currentRoom = "General";
let typingTimer;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}

function roleClass(role) {
  return `role-${String(role || "USER").toLowerCase()}`;
}

function buildMessage(message) {
  const firstLetter = String(message.username || "?").charAt(0).toUpperCase();

  // Crown for Owner and Co-Owner
  const roleIcons = {
    OWNER: "👑",
    CO_OWNER: "👑",
    SUPER_ADMIN: "⭐",
    ADMIN: "🛡️",
    MODERATOR: "🛠️",
    VIP: "💎",
    USER: "👤"
};

const icon = roleIcons[message.role] || "👤";

  // Friendly role names
  let roleName = message.role;
  if (message.role === "CO_OWNER") roleName = "CO-OWNER";
  if (message.role === "SUPER_ADMIN") roleName = "SUPER ADMIN";

  return `
    <article class="chat-message">
     <div class="message-avatar">
<img src="${message.avatar || "/uploads/default.jpg"}" alt="Profile" class="avatar-img"></div>
      <div class="message-content">
        <div class="message-meta">
<strong>${icon} ${escapeHtml(message.username)}</strong>
          <span class="role-badge ${roleClass(message.role)}">
            ${escapeHtml(roleName)}
          </span>

          <time>${escapeHtml(message.time)}</time>
        </div>

        <p>${escapeHtml(message.message)}</p>
      </div>
    </article>
  `;
}


function scrollMessages() {
  const messages = $("#messages");
  messages.scrollTop = messages.scrollHeight;
}

function renderHistory(rows) {
  $("#messages").innerHTML = rows.map(buildMessage).join("");
  scrollMessages();
}

function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $("#sidebarOverlay").classList.remove("show");
}

function openSidebar() {
  $("#sidebar").classList.add("open");
  $("#sidebarOverlay").classList.add("show");
}

$("#myProfile").innerHTML = `
<div class="profile-avatar">
    <img src="${currentUser.avatar || "/uploads/default.jpg"}"
         class="avatar-img"
         alt="Profile">
</div>

<div>
    <strong>${escapeHtml(currentUser.username)}</strong>
    <small>${escapeHtml(currentUser.role)}</small>
</div>
`;

$("#desktopUser").textContent = `${currentUser.username} · ${currentUser.role}`;
if (currentUser.role === "OWNER") {
  $("#ownerPanel")?.classList.remove("hidden");
}

socket.on("connect_error", (error) => {
  if (error.message === "AUTH_REQUIRED") {
    localStorage.clear();
    location.href = "login.html";
  }
});

socket.on("room history", renderHistory);

socket.on("chat message", (message) => {
  $("#messages").insertAdjacentHTML("beforeend", buildMessage(message));
  scrollMessages();
});

socket.on("room cleared", (data) => {
  $("#messages").innerHTML = `
    <div class="system-message">
      🧹 ${escapeHtml(data.by)} cleared #${escapeHtml(data.room)}.
    </div>
  `;
});

socket.on("chat error", (message) => {
  alert(message);
});

socket.on("online users", (users) => {
  $("#onlineCount").textContent = users.length;

if ($("#ownerOnlineCount")) {
  $("#ownerOnlineCount").textContent = users.length;
}
  $("#onlineUsers").innerHTML = users.map((user) => `
<div class="online-user" onclick='openProfile(${JSON.stringify(user)})'>      <span class="online-dot"></span>
      <div class="online-avatar">
    <img src="${user.avatar || "/uploads/default.jpg"}"
         class="avatar-img"
         alt="Profile">
</div>
      <div>
        <strong>${escapeHtml(user.username)}</strong>
        <small>${escapeHtml(user.role)} · ${escapeHtml(user.country || "Unknown")}</small>
      </div>
    </div>
  `).join("");
});

socket.on("typing", (username) => {
  $("#typingIndicator").textContent = `${username} is typing...`;
});

socket.on("stop typing", () => {
  $("#typingIndicator").textContent = "";
});

$("#messageForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const input = $("#messageInput");
  const message = input.value.trim();
  if (!message) return;

  socket.emit("chat message", message);
  socket.emit("stop typing");
  input.value = "";
  $("#emojiPanel").classList.add("hidden");
});

$("#messageInput").addEventListener("input", () => {
  socket.emit("typing");
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => socket.emit("stop typing"), 900);
});

document.querySelectorAll(".room-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".room-button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");

    currentRoom = button.dataset.room;
    $("#roomTitle").textContent = `# ${currentRoom}`;
    $("#messageInput").placeholder = `Message #${currentRoom}`;
    socket.emit("join room", currentRoom);
    closeSidebar();
  });
});

$("#emojiButton").addEventListener("click", () => {
  $("#emojiPanel").classList.toggle("hidden");
});

document.querySelectorAll("#emojiPanel button").forEach((button) => {
  button.addEventListener("click", () => {
    $("#messageInput").value += button.textContent;
    $("#messageInput").focus();
  });
});

$("#menuButton").addEventListener("click", openSidebar);
$("#closeSidebar").addEventListener("click", closeSidebar);
$("#sidebarOverlay").addEventListener("click", closeSidebar);
// Load Registered Users
async function loadRegisteredUsers() {
  const container = $("#registeredUsers");

  if (!container || currentUser.role !== "OWNER") return;

  try {
    const response = await fetch("/api/users", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();

    container.innerHTML = data.users.map(user => `
      <div class="user-row">
        <strong>${user.username}</strong>
        <span class="user-role">${user.role}</span>
      </div>
    `).join("");

  } catch (err) {
    container.innerHTML = "Failed to load users.";
  }
}

loadRegisteredUsers();

$("#logoutButton").addEventListener("click", () => {
  localStorage.clear();
  location.href = "login.html";
});

// ===========================
// OWNER PANEL BUTTONS
// ===========================

$("#announceBtn")?.addEventListener("click", () => {

  const announcement = prompt("Enter announcement:");

  if (!announcement) return;

  socket.emit("announcement", announcement);

});

$("#clearChatBtn")?.addEventListener("click", () => {

  if (confirm("Clear the current room?")) {

    socket.emit("clear room");

  }

});
// =========================
// SETTINGS
// =========================

const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.getElementById("closeSettings");

settingsBtn.addEventListener("click", () => {
    settingsModal.classList.remove("hidden");
});

closeSettings.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
});
// =========================
// PROFILE PREVIEW
// =========================

const profileUpload = document.getElementById("profileUpload");
const profilePreview = document.getElementById("profilePreview");

profileUpload.addEventListener("change", () => {

    const file = profileUpload.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {

        profilePreview.src = e.target.result;
        profilePreview.style.display = "block";

    };

    reader.readAsDataURL(file);

});
saveProfileBtn.addEventListener("click", async () => {

    const file = profileUpload.files[0];

    if (!file) {
        alert("Please choose an image first.");
        return;
    }

    const formData = new FormData();
    formData.append("avatar", file);

const token = localStorage.getItem("teenverseToken");

    const response = await fetch("/api/profile/upload", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`
        },
        body: formData
    });

    const data = await response.json();

    if (data.success) {

        profilePreview.src = data.avatar;

        alert("✅ Profile picture updated!");

    } else {

        alert(data.message || "Upload failed.");

    }

});
function openProfile(user) {

    profileImage.src = user.avatar || "/uploads/default.jpg";

    profileName.textContent = user.username;

    profileRole.textContent = user.role || "User";

    profileCountry.textContent = user.country || "Unknown";

    profileAge.textContent = user.age || "--";

    profileBio.textContent = user.bio || "No bio yet.";

    profileStatus.textContent = "🟢 Online";

    currentDMUser = user.username;

if (user.username === currentUser.username) {

    startDM.style.display = "none";

} else {

    startDM.style.display = "inline-block";

    startDM.onclick = () => {

        profileModal.style.display = "none";

        dmModal.style.display = "flex";

        dmTitle.textContent = `💬 Chat with ${user.username}`;

        dmMessages.innerHTML = "";
        socket.emit("load private messages", user.username);

    };

}
// Close profile popup
closeProfile.addEventListener("click", () => {
    profileModal.style.display = "none";
});

// Close when clicking outside the popup
profileModal.addEventListener("click", (e) => {
    if (e.target === profileModal) {
        profileModal.style.display = "none";
    }
});

    profileModal.style.display = "flex";

}

// =========================
// DIRECT MESSAGES
// =========================

closeDM.addEventListener("click", () => {
    dmModal.style.display = "none";
});

sendDM.addEventListener("click", () => {

    const text = dmInput.value.trim();

    if (!text || !currentDMUser) return;

    socket.emit("private message", {
        to: currentDMUser,
        message: text
    });

    dmInput.value = "";

});
socket.on("private message history", (history) => {

    dmMessages.innerHTML = "";

    history.forEach((msg) => {

        dmMessages.innerHTML += `
            <div style="margin-bottom:12px;padding:8px;border-radius:8px;background:#10253d;">
                <strong>${msg.from}</strong><br>
                ${msg.message}
                <div style="font-size:12px;opacity:.7;">${msg.time}</div>
            </div>
        `;

    });

    dmMessages.scrollTop = dmMessages.scrollHeight;

});

socket.on("private message", (msg) => {
  if (msg.unread && msg.from !== username) {

    alert(`💬 New message from ${msg.from}`);

}

    // Open the DM window automatically
    dmModal.style.display = "flex";
    dmTitle.textContent = `💬 Chat with ${msg.from}`;

    dmMessages.innerHTML += `
        <div style="margin-bottom:12px;padding:8px;border-radius:8px;background:#10253d;">
            <strong>${msg.from}</strong><br>
            ${msg.message}
            <div style="font-size:12px;opacity:.7;">${msg.time}</div>
        </div>
    `;

    dmMessages.scrollTop = dmMessages.scrollHeight;

});