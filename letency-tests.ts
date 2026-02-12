import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const TEST_URL = "http://localhost:3000";
const AUDIO_PATH = path.resolve("test-audio/browser.wav");

const RUNS = 10;
const OUTPUT_CSV = "latency-results.csv";
const TIMEOUT_MS = 15000;

console.log("🚀 Voice Latency Benchmark Framework");
console.log("🎧 Audio:", AUDIO_PATH);
console.log("🔁 Runs:", RUNS);
console.log("--------------------------------------------------");

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1
  );
  return sorted[index];
}

(async () => {
  const results: number[] = [];

  for (let i = 1; i <= RUNS; i++) {
    console.log(`\n🔄 Run ${i}/${RUNS}`);

    const browser = await chromium.launch({
      headless: true,
      args: [
        "--use-fake-ui-for-media-stream",
        `--use-file-for-fake-audio-capture=${AUDIO_PATH}`,
        "--autoplay-policy=no-user-gesture-required"
      ]
    });

    const context = await browser.newContext({
      permissions: ["microphone"]
    });

    const page = await context.newPage();

    let latencyResult: number | null = null;

    await page.exposeFunction("reportLatency", (latency: number) => {
      latencyResult = latency;
    });

    await page.addInitScript(() => {
      let speechSentTime = 0;

      const OriginalWS = window.WebSocket;

      window.WebSocket = function (url: any, protocols: any) {
        const ws = protocols
          ? new OriginalWS(url, protocols)
          : new OriginalWS(url);

        const originalSend = ws.send.bind(ws);

        ws.send = function (data: any) {
          if (data instanceof Blob && speechSentTime === 0) {
            speechSentTime = performance.now();
          }
          return originalSend(data);
        };

        return ws;
      } as any;

      const originalStart = AudioBufferSourceNode.prototype.start;

      AudioBufferSourceNode.prototype.start = function (...args: any[]) {
        const ttsStart = performance.now();

        if (speechSentTime) {
          const latency = ttsStart - speechSentTime;

          // @ts-ignore
          window.reportLatency(latency);

          speechSentTime = 0;
        }

        return originalStart.apply(this, args as [number?, number?, number?]);
      };
    });

    await page.goto(TEST_URL);

    await page.waitForSelector("#toggleBtn");
    await page.click("#toggleBtn");

    await page.waitForTimeout(TIMEOUT_MS);

    await browser.close();

    if (latencyResult !== null) {
      console.log(`✅ Latency: ${latencyResult} ms`);
      results.push(latencyResult);
    } else {
      console.log("⚠️ No latency captured in this run");
    }
  }

  if (results.length === 0) {
    throw new Error("No latency results collected.");
  }

  const avg =
    results.reduce((a, b) => a + b, 0) / results.length;

  const min = Math.min(...results);
  const max = Math.max(...results);
  const p50 = percentile(results, 50);
  const p95 = percentile(results, 95);
  const p99 = percentile(results, 99);

  console.log("\n================ BENCHMARK RESULTS ================");
  console.log(`Runs: ${results.length}`);
  console.log(`Average: ${avg.toFixed(2)} ms`);
  console.log(`Min: ${min.toFixed(2)} ms`);
  console.log(`Max: ${max.toFixed(2)} ms`);
  console.log(`P50: ${p50.toFixed(2)} ms`);
  console.log(`P95: ${p95.toFixed(2)} ms`);
  console.log(`P99: ${p99.toFixed(2)} ms`);
  console.log("===================================================\n");

  const csvLines: string[] = ["run,latency_ms"];

  results.forEach((val, index) => {
    csvLines.push(`${index + 1},${val.toFixed(2)}`);
  });

  csvLines.push("");
  csvLines.push(`average,${avg.toFixed(2)}`);
  csvLines.push(`min,${min.toFixed(2)}`);
  csvLines.push(`max,${max.toFixed(2)}`);
  csvLines.push(`p50,${p50.toFixed(2)}`);
  csvLines.push(`p95,${p95.toFixed(2)}`);
  csvLines.push(`p99,${p99.toFixed(2)}`);

  fs.writeFileSync(OUTPUT_CSV, csvLines.join("\n"));

  console.log(`📁 Results saved to ${OUTPUT_CSV}`);
})();
