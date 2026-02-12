import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { setupWebSocket } from "./ws.js";
import { neurolink } from "./neurolink.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ---------- STATIC FILES ---------- */

const publicPath = path.join(__dirname, "../public");
console.log("📂 Serving static from:", publicPath);

app.use(express.static(publicPath));

app.get("/", (_, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

/* ---------- HEALTH CHECK ---------- */

app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

/* ---------- SERVER ---------- */
// async function warmupLLM() {
//   try {
//     console.log("🔥 Warming up LLM...");

//     const start = performance.now();

//     // Use input.text instead of messages array
//     await neurolink.generate({
//       input: {
//         text: "Warmup ping. Respond with OK."
//       },
//       // No stream parameter - use neurolink.stream() for streaming
//       disableTools: true,  // Optional: faster warmup
//       maxTokens: 5         // Optional: minimal response
//     });

//     const end = performance.now();

//     console.log(
//       `✅ LLM warmup completed in ${(end - start).toFixed(2)} ms`
//     );
//   } catch (err) {
//     console.error("❌ LLM warmup failed:", err);
//   }
// }

const server = http.createServer(app);

/* ---------- WS ---------- */

setupWebSocket(server);
//warmupLLM() ;

/* ---------- START ---------- */

const PORT = 3000;

server.listen(PORT, async () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
