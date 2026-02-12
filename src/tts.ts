import WebSocket from "ws";
import { EventEmitter } from "events";

const CARTESIA_WS_URL =
  "wss://api.cartesia.ai/tts/websocket" +
  `?cartesia_version=2025-04-16` +
  `&api_key=${process.env.CARTESIA_API_KEY}`;

export class CartesiaStream extends EventEmitter {
  private ws: WebSocket | null = null;
  private contextId: string;
  private isReady = false;

  constructor(contextId: string) {
    super();
    this.contextId = contextId;

    this.ws = new WebSocket(CARTESIA_WS_URL);

    this.ws.on("open", () => {
      this.isReady = true;
      console.log("🔊 [CARTESIA] WS connected");
      this.emit("ready");
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.data) {
          const audio = Buffer.from(msg.data, "base64");
          this.emit("audio", audio);
        }

        if (msg.done) {
          this.emit("done");
        }

        if (msg.error) {
          this.emit("error", new Error(msg.error));
        }
      } catch (err) {
        console.error("Cartesia parse error:", err);
      }
    });

    this.ws.on("error", (err) => this.emit("error", err));

    this.ws.on("close", () => {
      this.isReady = false;
    });
  }

  async ready() {
    if (this.isReady) return;

    return new Promise<void>((resolve, reject) => {
      if (!this.ws) return reject();

      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
  }

  send(text: string, cont = true) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        context_id: this.contextId,
        model_id: "sonic-3",
        transcript: text,
        voice: {
          mode: "id",
          id: "694f9389-aac1-45b6-b726-9d9369183238",
        },
        output_format: {
          container: "raw",
          encoding: "pcm_s16le",
          sample_rate: 24000,
        },
        continue: cont,
      })
    );
  }

  flush() {
    this.send("", false);
  }

  close() {
    if (!this.ws) return;

    if (
      this.ws.readyState === WebSocket.OPEN ||
      this.ws.readyState === WebSocket.CONNECTING
    ) {
      try {
        this.ws.close();
      } catch {}
    }

    this.ws.removeAllListeners();
    this.ws = null;
  }
}
