// test-cartesia-ws.js
import WebSocket from "ws";
import "dotenv/config";

if (!process.env.CARTESIA_API_KEY) {
  throw new Error("CARTESIA_API_KEY is not set");
}

const url =
  "wss://api.cartesia.ai/tts/websocket" +
  "?cartesia_version=2025-04-16" +  // Updated version
  `&api_key=${process.env.CARTESIA_API_KEY}`;

const ws = new WebSocket(url);

ws.on("open", () => {
  console.log("✅ Cartesia WS connected");
  ws.close();
});

ws.on("error", (err) => {
  console.error("❌ WS error:", err.message);
});

ws.on("close", (code) => {
  console.log("WS closed with code", code);
});
