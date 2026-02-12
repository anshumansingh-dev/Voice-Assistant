class PCMProcessor extends AudioWorkletProcessor {

  constructor() {
    super();
    this.queue = [];
    this.offset = 0;

    this.port.onmessage = (event) => {
      this.queue.push(new Float32Array(event.data));
    };
  }

  process(_, outputs) {

    const output = outputs[0][0];

    if (!this.queue.length) {
      output.fill(0);
      return true;
    }

    let chunk = this.queue[0];

    for (let i = 0; i < output.length; i++) {

      if (this.offset >= chunk.length) {
        this.queue.shift();
        this.offset = 0;

        if (!this.queue.length) {
          output.fill(0, i);
          break;
        }

        chunk = this.queue[0];
      }

      output[i] = chunk[this.offset++];
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);

