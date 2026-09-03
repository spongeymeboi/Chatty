import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { WebSocketServer } from "ws";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MAX_MESSAGE = 2000;
const MAX_HISTORY = 100;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, "public")));

const db = new Database(path.join(__dirname, "chat.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT NOT NULL,
    username TEXT NOT NULL,
    text TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'message',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_room_id
  ON messages(room, id);
`);

const insertMessage = db.prepare(`
  INSERT INTO messages (room, username, text, kind, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

const getHistory = db.prepare(`
  SELECT id, room, username, text, kind, created_at
  FROM messages
  WHERE room = ?
  ORDER BY id DESC
  LIMIT ?
`);

const clients = new Map(); // ws -> client
const rooms = new Map();   // room -> Set<ws>

const COLORS = [
  "#7dd3fc", "#a7f3d0", "#f9a8d4", "#c4b5fd",
  "#fcd34d", "#fdba74", "#93c5fd", "#86efac"
];

function cleanText(value, max = MAX_MESSAGE) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function normalizeRoom(room) {
  let r = cleanText(room, 32).toLowerCase();
  if (!r) r = "#general";
  if (!r.startsWith("#")) r = "#" + r;
  r = r.replace(/[^a-z0-9_#-]/g, "");
  return r || "#general";
}

function normalizeNick(nick) {
  const n = cleanText(nick, 24).replace(/[^a-zA-Z0-9_[\]-]/g, "");
  return n || `Guest${crypto.randomInt(1000, 9999)}`;
}

function uniqueNick(requested, ws) {
  let base = normalizeNick(requested);
  let nick = base;
  let number = 2;

  while ([...clients.values()].some(c => c.username.toLowerCase() === nick.toLowerCase() && c.ws !== ws)) {
    nick = `${base}${number++}`;
  }
  return nick;
}

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function broadcastRoom(room, payload, except = null) {
  const members = rooms.get(room);
  if (!members) return;
  for (const ws of members) {
    if (ws !== except) send(ws, payload);
  }
}

function broadcastAll(payload) {
  for (const ws of clients.keys()) send(ws, payload);
}

function addToRoom(ws, room) {
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(ws);
}

function removeFromRoom(ws, room) {
  const members = rooms.get(room);
  if (!members) return;
  members.delete(ws);
  if (members.size === 0) rooms.delete(room);
}

function roomUsers(room) {
  return [...(rooms.get(room) || [])].map(ws => clients.get(ws))
    .filter(Boolean)
    .map(c => ({ username: c.username, color: c.color }))
    .sort((a, b) => a.username.localeCompare(b.username));
}

function sendUsers(ws) {
  const client = clients.get(ws);
  if (!client) return;
  send(ws, { type: "users", users: roomUsers(client.room) });
}

function sendHistory(ws) {
  const client = clients.get(ws);
  if (!client) return;

  const rows = getHistory.all(client.room, MAX_HISTORY).reverse();
  send(ws, {
    type: "history",
    room: client.room,
    messages: rows
  });
}

function systemMessage(room, text) {
  const payload = {
    type: "message",
    message: {
      id: null,
      room,
      username: "SYSTEM",
      text,
      kind: "system",
      created_at: Date.now()
    }
  };
  broadcastRoom(room, payload);
}

function sendRooms(ws) {
  const list = [...rooms.entries()]
    .map(([name, members]) => ({ name, users: members.size }))
    .sort((a, b) => a.name.localeCompare(b.name));
  send(ws, { type: "rooms", rooms: list });
}

function joinRoom(ws, requestedRoom) {
  const client = clients.get(ws);
  if (!client) return;

  const newRoom = normalizeRoom(requestedRoom);
  const oldRoom = client.room;

  if (newRoom === oldRoom) {
    sendHistory(ws);
    sendUsers(ws);
    return;
  }

  removeFromRoom(ws, oldRoom);
  client.room = newRoom;
  addToRoom(ws, newRoom);

  send(ws, { type: "room", room: newRoom });
  sendHistory(ws);
  sendUsers(ws);

  broadcastRoom(oldRoom, {
    type: "user_left",
    username: client.username,
    users: roomUsers(oldRoom)
  });

  broadcastRoom(newRoom, {
    type: "user_joined",
    username: client.username,
    users: roomUsers(newRoom)
  });

  systemMessage(newRoom, `${client.username} joined ${newRoom}`);
  sendRooms(ws);
  broadcastAll({ type: "rooms", rooms: [...rooms.entries()].map(([name, members]) => ({ name, users: members.size })) });
}

function handleCommand(ws, raw) {
  const client = clients.get(ws);
  const parts = raw.trim().split(/\s+/);
  const command = (parts.shift() || "").toLowerCase();
  const arg = parts.join(" ").trim();

  switch (command) {
    case "/help":
      send(ws, {
        type: "notice",
        text: "Commands: /help /nick NAME /join ROOM /rooms /who /me ACTION /clear /logout"
      });
      break;

    case "/nick": {
      if (!arg) return send(ws, { type: "error", text: "Usage: /nick NAME" });
      const old = client.username;
      client.username = uniqueNick(arg, ws);
      broadcastRoom(client.room, {
        type: "user_renamed",
        oldUsername: old,
        username: client.username,
        users: roomUsers(client.room)
      });
      systemMessage(client.room, `${old} is now known as ${client.username}`);
      send(ws, { type: "identity", username: client.username, color: client.color });
      break;
    }

    case "/join":
      if (!arg) return send(ws, { type: "error", text: "Usage: /join ROOM" });
      joinRoom(ws, arg);
      break;

    case "/rooms":
      sendRooms(ws);
      break;

    case "/who":
      send(ws, { type: "users", users: roomUsers(client.room) });
      break;

    case "/me":
      if (!arg) return send(ws, { type: "error", text: "Usage: /me ACTION" });
      insertMessage.run(client.room, client.username, arg, "action", Date.now());
      broadcastRoom(client.room, {
        type: "message",
        message: {
          id: null,
          room: client.room,
          username: client.username,
          text: arg,
          kind: "action",
          created_at: Date.now(),
          color: client.color
        }
      });
      break;

    case "/clear":
      send(ws, { type: "clear" });
      break;

    case "/logout":
      ws.close(1000, "logout");
      break;

    default:
      send(ws, { type: "error", text: `Unknown command: ${command}. Try /help.` });
  }
}

wss.on("connection", (ws) => {
  const client = {
    ws,
    username: uniqueNick("Guest", ws),
    room: "#general",
    color: COLORS[crypto.randomInt(COLORS.length)],
    joinedAt: Date.now()
  };

  clients.set(ws, client);
  addToRoom(ws, client.room);

  send(ws, {
    type: "ready",
    username: client.username,
    room: client.room,
    color: client.color
  });

  sendHistory(ws);
  sendUsers(ws);
  sendRooms(ws);
  broadcastRoom(client.room, {
    type: "user_joined",
    username: client.username,
    users: roomUsers(client.room)
  }, ws);

  ws.on("message", raw => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.type === "message") {
        const text = cleanText(data.text);
        if (!text) return;
        if (text.startsWith("/")) return handleCommand(ws, text);

        insertMessage.run(client.room, client.username, text, "message", Date.now());

        broadcastRoom(client.room, {
          type: "message",
          message: {
            id: null,
            room: client.room,
            username: client.username,
            text,
            kind: "message",
            created_at: Date.now(),
            color: client.color
          }
        });
      }

      if (data.type === "typing") {
        broadcastRoom(client.room, {
          type: "typing",
          username: client.username,
          typing: Boolean(data.typing)
        }, ws);
      }

      if (data.type === "join") joinRoom(ws, data.room);

    } catch {
      send(ws, { type: "error", text: "Invalid message format." });
    }
  });

  ws.on("close", () => {
    const current = clients.get(ws);
    if (!current) return;

    removeFromRoom(ws, current.room);
    clients.delete(ws);

    broadcastRoom(current.room, {
      type: "user_left",
      username: current.username,
      users: roomUsers(current.room)
    });

    systemMessage(current.room, `${current.username} left`);
    broadcastAll({
      type: "rooms",
      rooms: [...rooms.entries()].map(([name, members]) => ({ name, users: members.size }))
    });
  });
});

app.get("/health", (_, res) => {
  res.json({
    ok: true,
    websocketClients: clients.size,
    rooms: rooms.size
  });
});

server.listen(PORT, () => {
  console.log(`Instant Chat running at http://localhost:${PORT}`);
});
