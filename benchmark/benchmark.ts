import { performance } from "perf_hooks";
import fs from "fs";
import path from "path";
import { streamAnswer } from "../src/llm.js";
import { CartesiaStream } from "../src/tts.js";
import WebSocket from "ws";

const RUNS = 5;
const AUDIO_PATH = path.resolve("test-audio/question.wav");

// ------------ CONFIG ------------
// IMPORTANT:
// Keep your Soniox config as:
// audio_format: "auto"
// (since that’s what works in your system)

const SONIOX_URL = "wss://stt-rt.soniox.com/transcribe-websocket";
const SONIOX_API_KEY = process.env.SONIOX_API_KEY!;

// --------------------------------

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) {
    throw new Error("Cannot compute percentile of empty array");
  }

  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;

  const value = sorted[Math.max(0, Math.min(index, sorted.length - 1))];

  if (value === undefined) {
    throw new Error("Percentile calculation failed");
  }

  return value;
}

async function benchmarkSTT(audioBuffer: Buffer): Promise<{ text: string; latency: number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SONIOX_URL);

    let transcript = "";
    const start = performance.now();

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          api_key: SONIOX_API_KEY,
          model: "stt-rt-preview",
          audio_format: "auto",
          enable_endpoint_detection: true,
        })
      );

      ws.send(audioBuffer);
    });

    ws.on("message", (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        if (!Array.isArray(data.tokens)) return;

        const finals = data.tokens.filter(
          (t: any) => t.is_final && t.text
        );

        if (!finals.length) return;

        transcript += finals.map((t: any) => t.text).join(" ");

        const hasEnd = finals.some((t: any) => t.text === "<end>");
        if (!hasEnd) return;

        const end = performance.now();
        ws.close();

        resolve({
          text: transcript.replace("<end>", "").trim(),
          latency: end - start,
        });
      } catch {}
    });

    ws.on("error", reject);
  });
}

async function benchmarkLLM(text: string) {
  const start = performance.now();

  const stream = await streamAnswer([
    { role: "user", content: text },
  ]);

  let firstTokenTime: number | null = null;
  let fullText = "";

  for await (const chunk of stream) {
    if ("content" in chunk && typeof chunk.content === "string") {
      if (!firstTokenTime) {
        firstTokenTime = performance.now();
      }
      fullText += chunk.content;
    }
  }

  const end = performance.now();

  return {
    text: fullText,
    ttft: firstTokenTime ? firstTokenTime - start : 0,
    total: end - start,
  };
}

async function benchmarkTTS(text: string) {
  return new Promise<{ firstAudio: number }>((resolve, reject) => {
    const tts = new CartesiaStream(`bench-${Date.now()}`);
    const start = performance.now();
    let firstAudioCaptured = false;

    tts.on("audio", () => {
      if (!firstAudioCaptured) {
        firstAudioCaptured = true;
        const firstAudio = performance.now();
        resolve({ firstAudio: firstAudio - start });
      }
    });

    tts.on("error", reject);

    tts.ready().then(() => {
      tts.send(text, false);
      tts.flush();
    });
  });
}

async function run() {
  console.log("🚀 AI LATENCY BENCHMARK\n");

  const audioBuffer = fs.readFileSync(AUDIO_PATH);

  const totals: number[] = [];
  const stts: number[] = [];
  const llmTTFTs: number[] = [];
  const ttsLatencies: number[] = [];

  for (let i = 1; i <= RUNS; i++) {
    console.log(`🔄 Run ${i}/${RUNS}`);

    const totalStart = performance.now();

    // ---- STT ----
    const stt = await benchmarkSTT(audioBuffer);
    console.log(`📝 STT: ${stt.latency.toFixed(2)} ms`);
    stts.push(stt.latency);

    // ---- LLM ----
    const llm = await benchmarkLLM(stt.text);
    console.log(`🤖 LLM TTFT: ${llm.ttft.toFixed(2)} ms`);
    llmTTFTs.push(llm.ttft);

    // ---- TTS ----
    const tts = await benchmarkTTS(llm.text);
    console.log(`🔊 TTS First Audio: ${tts.firstAudio.toFixed(2)} ms`);
    ttsLatencies.push(tts.firstAudio);

    const totalEnd = performance.now();
    const totalLatency = totalEnd - totalStart;
    totals.push(totalLatency);

    console.log(`🔥 TOTAL: ${totalLatency.toFixed(2)} ms\n`);
  }

  console.log("========== SUMMARY ==========");
  console.log(`Avg Total: ${(totals.reduce((a,b)=>a+b,0)/totals.length).toFixed(2)} ms`);
  console.log(`P95 Total: ${percentile(totals,95).toFixed(2)} ms`);
  console.log(`P99 Total: ${percentile(totals,99).toFixed(2)} ms`);
}

run();
