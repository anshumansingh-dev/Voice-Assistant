export class FrameBus {
  private handlers: Record<string, Function[]> = {};

  subscribe(type: string, fn: Function) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(fn);
  }

  publish(frame: any) {
    const subs = this.handlers[frame.type];
    if (!subs) return;
    subs.forEach((fn) => fn(frame));
  }
}
