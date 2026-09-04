const API = "https://len-superintendent-spec-segment.trycloudflare.com";

const usernameInput = document.getElementById("username");
const messageInput = document.getElementById("message");
const messagesDiv = document.getElementById("messages");
const sendButton = document.getElementById("send");

async function loadMessages() {
    try {
        const response = await fetch(`${API}/api/messages`);

        if (!response.ok) {
            throw new Error("Failed to load messages");
        }

        const messages = await response.json();

        messagesDiv.innerHTML = "";

        for (const msg of messages) {
            addMessage(msg);
        }

        messagesDiv.scrollTop = messagesDiv.scrollHeight;

    } catch (error) {
        console.error("Could not load messages:", error);
    }
}

async function sendMessage() {
    const username = usernameInput.value.trim();
    const message = messageInput.value.trim();

    if (!username || !message) {
        return;
    }

    try {
        const response = await fetch(`${API}/api/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username: username,
                message: message
            })
        });

        if (!response.ok) {
            throw new Error("Failed to send message");
        }

        const newMessage = await response.json();

        if (newMessage.error) {
            alert(newMessage.error);
            return;
        }

        addMessage(newMessage);

        messageInput.value = "";
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

    } catch (error) {
        console.error("Could not send message:", error);
        alert("Could not connect to Chatty server.");
    }
}

function addMessage(msg) {
    const element = document.createElement("div");

    element.className = "message";

    const username = document.createElement("strong");
    username.textContent = msg.username;

    const message = document.createElement("span");
    message.textContent = `: ${msg.message}`;

    element.appendChild(username);
    element.appendChild(message);

    messagesDiv.appendChild(element);
}

sendButton.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        sendMessage();
    }
});

loadMessages();

setInterval(loadMessages, 3000);
