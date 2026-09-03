const CONFIG = window.CHAT_CONFIG || {};
const WS_URL = CONFIG.WS_URL || (
  location.protocol === "https:" ? `wss://${location.host}` : `ws://${location.host}`
);

const $ = id => document.getElementById(id);

let socket;
let currentRoom = "#general";
let myName = "Connecting…";
let myColor = "#7dd3fc";
let typingTimer;
let reconnectTimer;
let shouldReconnect = true;

function esc(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function initials(name) {
  return (name || "?").slice(0, 2).toUpperCase();
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function setConnection(online) {
  const el = $("connection");
  el.textContent = online ? "● Connected" : "○ Disconnected";
  el.className = `connection ${online ? "online" : "offline"}`;
}

function connect() {
  clearTimeout(reconnectTimer);
  socket = new WebSocket(WS_URL);

  socket.addEventListener("open", () => {
    setConnection(true);
  });

  socket.addEventListener("close", () => {
    setConnection(false);
    if (shouldReconnect) reconnectTimer = setTimeout(connect, 1500);
  });

  socket.addEventListener("error", () => setConnection(false));

  socket.addEventListener("message", event => {
    const data = JSON.parse(event.data);

    if (data.type === "ready" || data.type === "identity") {
      myName = data.username;
      myColor = data.color;
      $("myName").textContent = myName;
      $("avatar").textContent = initials(myName);
      $("avatar").style.background = myColor;
      if (data.room) setRoomName(data.room);
    }

    if (data.type === "room") {
      setRoomName(data.room);
    }

    if (data.type === "history") {
      $("messages").replaceChildren();
      data.messages.forEach(renderMessage);
      scrollBottom();
    }

    if (data.type === "message") {
      renderMessage(data.message);
      scrollBottom();
    }

    if (data.type === "clear") {
      $("messages").replaceChildren();
    }

    if (data.type === "users" || data.type === "user_joined" || data.type === "user_left" || data.type === "user_renamed") {
      if (data.users) renderUsers(data.users);
    }

    if (data.type === "rooms") renderRooms(data.rooms);

    if (data.type === "typing") {
      showTyping(data.username, data.typing);
    }

    if (data.type === "notice") addSystem(data.text);
    if (data.type === "error") addSystem(`ERROR: ${data.text}`);
  });
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function sendMessage(text) {
  if (!text.trim()) return;
  send({ type: "message", text });
}

function renderMessage(m) {
  const wrap = document.createElement("article");

  if (m.kind === "system") {
    wrap.className = "system";
    wrap.textContent = m.text;
    $("messages").appendChild(wrap);
    return;
  }

  wrap.className = `message ${m.kind === "action" ? "action" : ""}`;
  const color = m.color || "#7dd3fc";

  wrap.innerHTML = `
    <div class="message-avatar" style="background:${esc(color)}">${esc(initials(m.username))}</div>
    <div class="message-body">
      <div class="message-head">
        <span class="username" style="color:${esc(color)}">${esc(m.username)}</span>
        <span class="time">${formatTime(m.created_at)}</span>
      </div>
      <div class="message-text">${esc(m.text)}</div>
    </div>
  `;

  $("messages").appendChild(wrap);
}

function addSystem(text) {
  const el = document.createElement("div");
  el.className = "system";
  el.textContent = text;
  $("messages").appendChild(el);
  scrollBottom();
}

function renderUsers(users) {
  $("userCount").textContent = users.length;
  $("panelCount").textContent = users.length;
  $("users").innerHTML = users.map(u => `
    <div class="user">
      <span class="user-dot" style="background:${esc(u.color || "#45d483")}"></span>
      <span class="user-name">${esc(u.username)}</span>
    </div>
  `).join("");
}

function renderRooms(rooms) {
  const container = $("rooms");
  container.innerHTML = "";

  for (const room of rooms) {
    const btn = document.createElement("button");
    btn.className = `room ${room.name === currentRoom ? "active" : ""}`;
    btn.innerHTML = `<span>▸ ${esc(room.name)}</span><span class="count">${room.users}</span>`;
    btn.onclick = () => send({ type: "join", room: room.name });
    container.appendChild(btn);
  }

  if (!rooms.some(r => r.name === currentRoom)) {
    const general = document.createElement("button");
    general.className = "room active";
    general.innerHTML = `<span>▸ #general</span>`;
    general.onclick = () => send({ type: "join", room: "#general" });
    container.prepend(general);
  }
}

function setRoomName(room) {
  currentRoom = room;
  $("roomName").textContent = room;
  $("input").placeholder = `Message ${room} — Enter to send, Shift+Enter for a new line`;
  renderRooms([...document.querySelectorAll(".room")].map(x => ({name: x.textContent.trim(), users: 0})));
}

function scrollBottom() {
  const box = $("messages");
  box.scrollTop = box.scrollHeight;
}

function showTyping(username, isTyping) {
  const el = $("typing");
  el.dataset[username] = isTyping ? "1" : "0";

  const names = Object.keys(el.dataset)
    .filter(k => el.dataset[k] === "1");

  el.textContent = names.length
    ? `${names.slice(0, 2).join(", ")} ${names.length === 1 ? "is" : "are"} typing…`
    : "";
}

function openModal(title, initial, callback) {
  $("modalTitle").textContent = title;
  $("modalInput").value = initial;
  $("modal").classList.remove("hidden");
  $("modalInput").focus();
  $("modalInput").select();

  const finish = ok => {
    $("modal").classList.add("hidden");
    if (ok) callback($("modalInput").value.trim());
  };

  $("modalOK").onclick = () => finish(true);
  $("modalCancel").onclick = () => finish(false);
  $("modalInput").onkeydown = e => {
    if (e.key === "Enter") finish(true);
    if (e.key === "Escape") finish(false);
  };
}

$("composer").addEventListener("submit", e => {
  e.preventDefault();
  const input = $("input");
  sendMessage(input.value);
  input.value = "";
  input.style.height = "auto";
  send({ type: "typing", typing: false });
});

$("input").addEventListener("input", () => {
  const input = $("input");
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";

  send({ type: "typing", typing: input.value.length > 0 });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => send({ type: "typing", typing: false }), 900);
});

$("input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
});

$("changeNick").onclick = () => {
  openModal("Change nickname", myName, name => {
    if (name) sendMessage(`/nick ${name}`);
  });
};

$("newRoom").onclick = () => {
  openModal("Join a room", "#my-room", room => {
    if (room) send({ type: "join", room });
  });
};

$("usersToggle").onclick = () => {
  $("userPanel").style.display =
    $("userPanel").style.display === "none" ? "block" : "";
};

connect();
