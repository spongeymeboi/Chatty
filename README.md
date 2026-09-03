# Instant Chat

A Discord/old-school IRC-style realtime chat room using:

- Node.js
- Express
- WebSocket (`ws`)
- SQLite (`better-sqlite3`)
- Plain HTML/CSS/JS frontend

## Run locally

1. Install Node.js 20+.
2. Open a terminal in this folder.
3. Run:

```bash
npm install
npm start
```

4. Open http://localhost:3000

The server creates `chat.db` automatically.

## Public hosting

Host this Node.js app on a machine/server that is reachable from the Internet. The browser connects to the same host over WebSocket.

If you put the frontend itself on jsDelivr/GitHub Pages, change `WS_URL` in `public/config.js` to your public WebSocket URL, such as:

```js
window.CHAT_CONFIG = {
  WS_URL: "wss://chat.example.com"
};
```

jsDelivr/GitHub Pages can serve the static frontend, but they cannot run the realtime WebSocket backend or SQLite database.

## Commands

- `/help`
- `/nick NAME`
- `/join ROOM`
- `/rooms`
- `/who`
- `/me ACTION`
- `/clear`
- `/logout`

Rooms are simple `#room` names. Message history is stored in SQLite.
