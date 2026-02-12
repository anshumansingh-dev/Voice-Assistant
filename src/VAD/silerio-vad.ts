import * as ort from "onnxruntime-node";
import { VADConfig } from "./vad-config.js";

export class SileroVAD {
  private session!: ort.InferenceSession;
  private speechFrames = 0;
  private silenceFrames = 0;

  constructor(
    private bus: any,
    private config: VADConfig
  ) {}

  async init() {
    this.session = await ort.InferenceSession.create("models/silero_vad.onnx");
  }

  async process(frame: Int16Array) {
    const input = new Float32Array(frame.length);

    for (let i = 0; i < frame.length; i++) {
      input[i] = (frame[i] ?? 0) / 32768;
    }

    const tensor = new ort.Tensor("float32", input, [1, frame.length]);
    const result = await this.session.run({ input: tensor });

    const confidence = result.output?.data[0];

    if (typeof confidence === "number" && confidence >= this.config.confidence) {
      this.speechFrames++;
      this.silenceFrames = 0;

      if (this.speechFrames >= this.config.startFrames) {
        this.bus.publish({ type: "vad_start" });
        this.speechFrames = 0; // prevent repeated triggers
      }
    } else {
      this.silenceFrames++;
      this.speechFrames = 0;

      if (this.silenceFrames >= this.config.stopFrames) {
        this.bus.publish({ type: "vad_stop" });
        this.silenceFrames = 0;
      }
    }
  }
}
