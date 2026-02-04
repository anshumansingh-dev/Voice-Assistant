// test-cartesia-ws.js
import WebSocket from "ws";

const ws = new WebSocket("wss://api.cartesia.ai/tts/websocket", {
  headers: {
    Authorization: `Bearer ${process.env.CARTESIA_API_KEY}`,
  },
});

ws.on("open", () => {
  console.log("✅ WS connected");
  ws.close();
});

ws.on("error", (err) => {
  console.error("❌ WS error:", err.message);
});

ws.on("close", (code) => {
  console.log("WS closed with code", code);
});
