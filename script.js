
// ==========================================
// CHATTY - FRONTEND CLIENT
// GitHub Pages -> Cloudflare Tunnel -> FastAPI -> chat.db
// ==========================================

// CHANGE THIS to your Cloudflare Tunnel URL.
const API = "https://len-superintendent-spec-segment.trycloudflare.com";

// ==========================================
// ELEMENTS
// ==========================================

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const composer = document.getElementById("composer");

const myNameEl = document.getElementById("myName");
const avatarEl = document.getElementById("avatar");

const connectionEl = document.getElementById("connection");

const roomsEl = document.getElementById("rooms");
const roomNameEl = document.getElementById("roomName");
const roomTopicEl = document.getElementById("roomTopic");

const newRoomButton = document.getElementById("newRoom");
const changeNickButton = document.getElementById("changeNick");

const modal = document.getElementById("modal");
const modalInput = document.getElementById("modalInput");
const modalOK = document.getElementById("modalOK");
const modalCancel = document.getElementById("modalCancel");

const usersToggle = document.getElementById("usersToggle");
const userPanel = document.getElementById("userPanel");

const typingEl = document.getElementById("typing");


// ==========================================
// STATE
// ==========================================

let username = localStorage.getItem("chatty_username");

if (!username) {
    username = "Guest" + Math.floor(Math.random() * 9999);
    localStorage.setItem("chatty_username", username);
}

let currentRoom = "general";

let messages = [];


// ==========================================
// INITIALIZATION
// ==========================================

function initialize() {
    myNameEl.textContent = username;

    avatarEl.textContent = username.charAt(0).toUpperCase();

    roomNameEl.textContent = "#general";
    roomTopicEl.textContent = "Realtime chat";

    createDefaultRoom();

    loadMessages();

    // Refresh messages every 3 seconds.
    setInterval(loadMessages, 3000);

    setConnection("Connecting…", false);
}

initialize();


// ==========================================
// CONNECTION STATUS
// ==========================================

function setConnection(text, online) {
    connectionEl.textContent = text;

    connectionEl.classList.remove("online");
    connectionEl.classList.remove("offline");

    if (online) {
        connectionEl.classList.add("online");
    } else {
        connectionEl.classList.add("offline");
    }
}


// ==========================================
// ROOMS
// ==========================================

function createDefaultRoom() {
    roomsEl.innerHTML = "";

    const room = document.createElement("button");

    room.className = "room active";
    room.textContent = "# general";

    room.addEventListener("click", () => {
        switchRoom("general");
    });

    roomsEl.appendChild(room);
}


function switchRoom(room) {
    currentRoom = room;

    roomNameEl.textContent = "#" + room;

    inputEl.placeholder =
        `Message #${room} — Enter to send, Shift+Enter for a new line`;

    loadMessages();
}


newRoomButton.addEventListener("click", () => {
    const name = prompt("Enter a room name:");

    if (!name) {
        return;
    }

    const cleanName = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, "-");

    if (!cleanName) {
        return;
    }

    const room = document.createElement("button");

    room.className = "room";
    room.textContent = "# " + cleanName;

    room.addEventListener("click", () => {
        switchRoom(cleanName);
    });

    roomsEl.appendChild(room);

    switchRoom(cleanName);
});


// ==========================================
// LOAD MESSAGES
// ==========================================

async function loadMessages() {
    try {
        const response = await fetch(
            `${API}/api/messages`,
            {
                method: "GET",
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(
                `Server returned HTTP ${response.status}`
            );
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("Invalid message data received.");
        }

        messages = data;

        renderMessages();

        setConnection("Connected", true);

    } catch (error) {
        console.error("Chatty API error:", error);

        setConnection("Offline", false);
    }
}


// ==========================================
// RENDER MESSAGES
// ==========================================

function renderMessages() {
    messagesEl.innerHTML = "";

    for (const message of messages) {
        addMessageToScreen(message);
    }

    scrollToBottom();
}


function addMessageToScreen(message) {
    const wrapper = document.createElement("div");

    wrapper.className = "message";

    const usernameElement = document.createElement("strong");

    usernameElement.className = "message-user";

    usernameElement.textContent = message.username;

    const textElement = document.createElement("span");

    textElement.className = "message-text";

    textElement.textContent = message.message;

    wrapper.appendChild(usernameElement);
    wrapper.appendChild(textElement);

    if (message.created_at) {
        const timeElement = document.createElement("small");

        timeElement.className = "message-time";

        const date = new Date(
            message.created_at.replace(" ", "T") + "Z"
        );

        if (!Number.isNaN(date.getTime())) {
            timeElement.textContent =
                date.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                });
        }

        wrapper.appendChild(timeElement);
    }

    messagesEl.appendChild(wrapper);
}


// ==========================================
// SEND MESSAGE
// ==========================================

composer.addEventListener("submit", async (event) => {
    event.preventDefault();

    await sendMessage();
});


async function sendMessage() {
    const message = inputEl.value.trim();

    if (!message) {
        return;
    }

    if (message.length > 2000) {
        alert("Message is too long.");

        return;
    }

    inputEl.disabled = true;

    try {
        const response = await fetch(
            `${API}/api/messages`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    username: username,
                    message: message
                })
            }
        );

        if (!response.ok) {
            throw new Error(
                `Server returned HTTP ${response.status}`
            );
        }

        const data = await response.json();

        if (data.error) {
            alert(data.error);

            return;
        }

        // Add the newly created message immediately.
        addMessageToScreen(data);

        messages.push(data);

        inputEl.value = "";

        scrollToBottom();

        setConnection("Connected", true);

    } catch (error) {
        console.error("Send message error:", error);

        setConnection("Offline", false);

        alert("Could not connect to the Chatty server.");

    } finally {
        inputEl.disabled = false;

        inputEl.focus();
    }
}


// ==========================================
// ENTER TO SEND
// SHIFT + ENTER = NEW LINE
// ==========================================

inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();

        composer.requestSubmit();
    }
});


// ==========================================
// NICKNAME
// ==========================================

changeNickButton.addEventListener("click", () => {
    modalInput.value = username;

    modal.classList.remove("hidden");

    modalInput.focus();

    modalInput.select();
});


modalCancel.addEventListener("click", () => {
    modal.classList.add("hidden");
});


modalOK.addEventListener("click", () => {
    changeUsername();
});


modalInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        changeUsername();
    }

    if (event.key === "Escape") {
        modal.classList.add("hidden");
    }
});


function changeUsername() {
    const newName = modalInput.value.trim();

    if (!newName) {
        return;
    }

    if (newName.length > 24) {
        alert("Nickname must be 24 characters or less.");

        return;
    }

    username = newName;

    localStorage.setItem(
        "chatty_username",
        username
    );

    myNameEl.textContent = username;

    avatarEl.textContent =
        username.charAt(0).toUpperCase();

    modal.classList.add("hidden");
}


// ==========================================
// USER PANEL
// ==========================================

usersToggle.addEventListener("click", () => {
    userPanel.classList.toggle("hidden");
});


// ==========================================
// TYPING UI
// ==========================================

let typingTimeout;

inputEl.addEventListener("input", () => {
    typingEl.textContent = "";

    clearTimeout(typingTimeout);

    typingTimeout = setTimeout(() => {
        typingEl.textContent = "";
    }, 1000);
});


// ==========================================
// SCROLL
// ==========================================

function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

