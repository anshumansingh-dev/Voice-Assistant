import WebSocket from "ws";

const SONIOX_WS = "wss://api.soniox.com/realtime";
const API_KEY = process.env.SONIOX_API_KEY!;

type TranscriptHandler = (text: string) => void;

export class SonioxSession {
  private ws: WebSocket;
  private onFinal?: TranscriptHandler;

  constructor() {
    this.ws = new WebSocket(SONIOX_WS, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });

    this.ws.on("open", () => {
      this.ws.send(
        JSON.stringify({
          type: "start",
          config: {
            language: "en",
            punctuation: true,
          },
        })
      );
    });

    this.ws.on("message", (msg) => {
      const data = JSON.parse(msg.toString());

      if (data.type === "final_transcript" && data.text) {
        this.onFinal?.(data.text);
      }
    });
  }

  sendAudio(buffer: Buffer) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(buffer);
    }
  }

  onFinalTranscript(cb: TranscriptHandler) {
    this.onFinal = cb;
  }

  close() {
    this.ws.close();
  }
}
