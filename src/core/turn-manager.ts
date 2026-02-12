enum State {
  IDLE,
  USER_SPEAKING,
  PROCESSING,
  ASSISTANT_SPEAKING
}

export class TurnManager {
  private state = State.IDLE;

  constructor(private bus: any) {
    bus.subscribe("vad_start", () => this.onStart());
    bus.subscribe("vad_stop", () => this.onStop());
  }

  private onStart() {
    if (this.state === State.ASSISTANT_SPEAKING) {
      this.bus.publish({ type: "interrupt" });
    }
    this.state = State.USER_SPEAKING;
  }

  private onStop() {
    this.state = State.PROCESSING;
  }

  assistantSpeaking() {
    this.state = State.ASSISTANT_SPEAKING;
  }

  reset() {
    this.state = State.IDLE;
  }
}
