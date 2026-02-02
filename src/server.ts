import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { setupWebSocket } from "./ws.js";
import { neurolink } from "./neurolink.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ---------------- STATIC FRONTEND ---------------- */
app.use(express.static(path.join(__dirname, "../public")));

/* ---------------- HTTP SERVER ---------------- */
const server = http.createServer(app);

/* ---------------- WEBSOCKET ---------------- */
setupWebSocket(server);

/* ---------------- START ---------------- */
const PORT = 3000;

server.listen(PORT, async () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);

  // 🔥 LLM WARM-UP (keep this)
  try {
    console.log("🔥 Warming up Vertex LLM...");
    await neurolink.generate({
      provider: "vertex",
      model: "gemini-2.5-flash",
      input: { text: "hi" },
      maxTokens: 5,
      disableTools: true,
      enableAnalytics: false,
      enableEvaluation: false,
    });
    console.log("✅ Vertex LLM warmed up");
  } catch (err) {
    console.error("❌ LLM warm-up failed:", err);
  }
});
