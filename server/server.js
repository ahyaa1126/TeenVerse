require("dotenv").config();

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "teenverse-local-secret-change-me";
const OWNER_USERNAME = String(process.env.OWNER_USERNAME || "ahya").toLowerCase();

const DATA_DIR = path.join(__dirname, "data");
const UPLOADS_DIR = path.join(__dirname, "../public/uploads");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const DM_MESSAGES_FILE = path.join(DATA_DIR, "dmMessages.json");
const ROOMS = ["General", "Gaming", "Music", "Study", "Memes"];

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
  if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, "[]");
  if (!fs.existsSync(DM_MESSAGES_FILE)) fs.writeFileSync(DM_MESSAGES_FILE, "[]");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8") || "[]");
  } catch {
    return [];
  }
}

function writeJson(file, data) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, file);
}

function cleanUsername(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 24);
}

function safeRoom(value) {
  return ROOMS.includes(value) ? value : "General";
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    age: user.age,
    country: user.country,
    avatar: user.avatar || ""
  };
}

ensureDataFiles();
// ===========================
// MULTER CONFIG
// ===========================

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },

  filename: (req, file, cb) => {

    const ext = path.extname(file.originalname);

    cb(null, Date.now() + ext);

  }

});

const upload = multer({ storage });

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, storage: "local-json", rooms: ROOMS });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const username = cleanUsername(req.body.username);
    const usernameLower = username.toLowerCase();
    const password = String(req.body.password || "");
    const age = Number(req.body.age);
    const country = String(req.body.country || "Unknown").trim().slice(0, 40);

    if (username.length < 3) {
      return res.status(400).json({ message: "Username must be at least 3 characters." });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }
    if (!Number.isInteger(age) || age < 13 || age > 20) {
      return res.status(400).json({ message: "Age must be between 13 and 20." });
    }

    const users = readJson(USERS_FILE);
    if (users.some((u) => u.usernameLower === usernameLower)) {
      return res.status(409).json({ message: "Username already exists." });
    }
const role =
  usernameLower === OWNER_USERNAME
    ? "OWNER"
    : "USER";
    
    const user = {
      id: crypto.randomUUID(),
      username,
      usernameLower,
      passwordHash: await bcrypt.hash(password, 12),
      age,
      country,
      role,
      avatar: "",
      banned: false,
      muted: false,
      createdAt: new Date().toISOString()
    };

    users.push(user);
    writeJson(USERS_FILE, users);
    res.status(201).json({ message: "Registration successful." });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Registration failed." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const usernameLower = cleanUsername(req.body.username).toLowerCase();
    const password = String(req.body.password || "");
    const users = readJson(USERS_FILE);
    const user = users.find((u) => u.usernameLower === usernameLower);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Wrong username or password." });
    }
    if (user.banned) {
      return res.status(403).json({ message: "This account is banned." });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, user: publicUser(user) });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed." });
  }
});
// ===========================
// GET ALL REGISTERED USERS
// ===========================

function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";

    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = auth.substring(7);

    req.user = jwt.verify(token, JWT_SECRET);

    next();

  } catch {
    res.status(401).json({ message: "Unauthorized" });
  }
}

app.get("/api/users", requireAuth, (req, res) => {

  const users = readJson(USERS_FILE);

  res.json({
    users: users.map(user => ({
      username: user.username,
      role: user.role,
      country: user.country
    }))
  });

});
// ===========================
// PROFILE IMAGE UPLOAD
// ===========================

app.post(
  "/api/profile/upload",
  requireAuth,
  upload.single("avatar"),
  (req, res) => {

    if (!req.file) {
      return res.status(400).json({
        message: "No image uploaded."
      });
    }

    const users = readJson(USERS_FILE);

    const user = users.find(u => u.id === req.user.userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found."
      });
    }

    user.avatar = "/uploads/" + req.file.filename;

    writeJson(USERS_FILE, users);

    res.json({
      success: true,
      avatar: user.avatar
    });

  }
);

const online = new Map();

function onlineList() {
  return [...online.values()].map(({ socketIds, ...safe }) => safe);
}

io.use((socket, next) => {
  try {
    socket.auth = jwt.verify(socket.handshake.auth?.token, JWT_SECRET);
    next();
  } catch {
    next(new Error("AUTH_REQUIRED"));
  }
});

io.on("connection", (socket) => {
  const users = readJson(USERS_FILE);
  const user = users.find((u) => u.id === socket.auth.userId);

  if (!user || user.banned) {
    socket.disconnect(true);
    return;
  }

  socket.userId = user.id;
  socket.username = user.username;
  socket.role = user.role;
  socket.usernameLower = user.usernameLower;
  socket.room = "General";

  socket.join(socket.room);

  const current = online.get(user.usernameLower) || {
    username: user.username,
    role: user.role,
    country: user.country,
    avatar: user.avatar || "/uploads/default.jpg",
    socketIds: new Set()
  };
  current.socketIds.add(socket.id);
  online.set(user.usernameLower, current);
  io.emit("online users", onlineList());

  function emitHistory(room) {
    const rows = readJson(MESSAGES_FILE)
      .filter((m) => m.room === room)
      .slice(-100)
      .map((m) => ({ ...m, time: formatTime(m.createdAt) }));
    socket.emit("room history", rows);
  }

  emitHistory(socket.room);

  socket.on("join room", (roomName) => {
    const room = safeRoom(roomName);
    socket.leave(socket.room);
    socket.room = room;
    socket.join(room);
    emitHistory(room);
  });

  socket.on("chat message", (raw) => {
    const allUsers = readJson(USERS_FILE);
    const fresh = allUsers.find((u) => u.id === socket.userId);
    if (!fresh || fresh.banned || fresh.muted) return;

    const text = String(raw || "").trim().slice(0, 500);
    if (!text) return;

    if (text.toLowerCase() === "/clear") {
      if (!["OWNER", "ADMIN"].includes(fresh.role)) {
        socket.emit("chat error", "Only OWNER or ADMIN can clear a room.");
        return;
      }

      const remaining = readJson(MESSAGES_FILE).filter((m) => m.room !== socket.room);
      writeJson(MESSAGES_FILE, remaining);
      io.to(socket.room).emit("room cleared", {
        room: socket.room,
        by: fresh.username
      });
      return;
    }

    const message = {
      id: crypto.randomUUID(),
      room: socket.room,
      username: fresh.username,
      role: fresh.role,
       avatar: fresh.avatar || "/uploads/default.jpg",
      message: text,
      createdAt: new Date().toISOString()
    };

    const messages = readJson(MESSAGES_FILE);
    messages.push(message);

    if (messages.length > 5000) messages.splice(0, messages.length - 5000);
    writeJson(MESSAGES_FILE, messages);

    io.to(socket.room).emit("chat message", {
      ...message,
      time: formatTime(message.createdAt)
    });
  });

  // ===========================
// LOAD PRIVATE MESSAGE HISTORY
// ===========================

socket.on("load private messages", (username) => {

    const allDMs = readJson(DM_MESSAGES_FILE);

    const history = allDMs.filter(dm =>
        (dm.from === socket.username && dm.to === username) ||
        (dm.from === username && dm.to === socket.username)
    );

    socket.emit("private message history", history);

});
  // ===========================
// PRIVATE MESSAGES
// ===========================

socket.on("private message", ({ to, message }) => {

  const targetSocket = [...io.sockets.sockets.values()].find(
    s => s.username === to
  );

  if (!targetSocket) {
    socket.emit("chat error", "User is offline.");
    return;
  }

  const users = readJson(USERS_FILE);
  const sender = users.find(u => u.id === socket.userId);

  const dm = {
    from: sender.username,
    to,
    avatar: sender.avatar || "/uploads/default.jpg",
    role: sender.role,
    message: String(message).trim().slice(0, 500),
    time: formatTime(new Date())
  };
  // Save DM history
const dmMessages = readJson(DM_MESSAGES_FILE);

dmMessages.push({
  ...dm,
  createdAt: new Date().toISOString()
});

writeJson(DM_MESSAGES_FILE, dmMessages);
targetSocket.emit("private message", {
    ...dm,
    unread: true
});

socket.emit("private message", {
    ...dm,
    unread: false
});

});

  socket.on("typing", () => {
    socket.to(socket.room).emit("typing", socket.username);
  });

  socket.on("stop typing", () => {
    socket.to(socket.room).emit("stop typing", socket.username);
  });
socket.on("announcement", (rawText) => {
  const users = readJson(USERS_FILE);
  const fresh = users.find((user) => user.id === socket.userId);

  if (!fresh || fresh.role !== "OWNER") {
    socket.emit("chat error", "Only the OWNER can send announcements.");
    return;
  }

  const text = String(rawText || "").trim().slice(0, 300);
  if (!text) return;

  io.emit("chat message", {
    id: crypto.randomUUID(),
    room: "All",
    username: "TeenVerse",
    role: "OWNER",
    message: `📢 ${text}`,
    time: formatTime(new Date())
  });
});

socket.on("clear room", () => {
  const users = readJson(USERS_FILE);
  const fresh = users.find((user) => user.id === socket.userId);

  if (!fresh || !["OWNER", "ADMIN"].includes(fresh.role)) {
    socket.emit("chat error", "Only OWNER or ADMIN can clear a room.");
    return;
  }

  const remainingMessages = readJson(MESSAGES_FILE).filter(
    (message) => message.room !== socket.room
  );

  writeJson(MESSAGES_FILE, remainingMessages);

  io.to(socket.room).emit("room cleared", {
    room: socket.room,
    by: fresh.username
  });
});
  socket.on("disconnect", () => {
    const item = online.get(socket.usernameLower);
    if (!item) return;

    item.socketIds.delete(socket.id);
    if (item.socketIds.size === 0) {
      online.delete(socket.usernameLower);
    }
    io.emit("online users", onlineList());
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("🌊 TeenVerse is running");
  console.log(`💻 Open: http://localhost:${PORT}`);
  console.log("💾 Storage: local JSON (no MongoDB required)");
});
