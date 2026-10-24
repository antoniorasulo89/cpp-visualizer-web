import { validateInput } from "./input-values.js";

export class InteractiveChannel {
  constructor(post) {
    this.post = post;
    this.serial = 0;
    this.pending = null;
    this.bytes = new Uint8Array();
    this.eof = false;
    this.totalBytes = 0;
  }
  step() {
    return this.wait("step", {});
  }
  input(spec) {
    if (this.eof) return 0;
    return this.wait("input", spec);
  }
  wait(kind, spec) {
    if (this.pending) throw Error("Richiesta interattiva già in attesa.");
    const id = ++this.serial;
    return new Promise((resolve) => {
      this.pending = { kind, id, spec, resolve };
      this.post({ type: "paused", reason: kind, id, ...spec });
    });
  }
  receive(message) {
    const waiting = this.pending;
    if (
      !waiting ||
      message.id !== waiting.id ||
      message.type !== (waiting.kind === "step" ? "continue" : "input")
    )
      return;
    if (waiting.kind === "input") {
      const error =
        message.eof === true ? "" : validateInput(message.value, waiting.spec);
      if (error) {
        this.post({ type: "input-error", id: waiting.id, text: error });
        return;
      }
      const bytes =
        message.eof === true
          ? new Uint8Array()
          : new TextEncoder().encode(message.value + "\n");
      if (this.totalBytes + bytes.length > 10000) {
        this.post({
          type: "input-error",
          id: waiting.id,
          text: "Input: massimo complessivo 10.000 byte UTF-8.",
        });
        return;
      }
      this.totalBytes += bytes.length;
      const combined = new Uint8Array(this.bytes.length + bytes.length);
      combined.set(this.bytes);
      combined.set(bytes, this.bytes.length);
      this.bytes = combined;
      if (message.eof === true) this.eof = true;
    }
    if (waiting.kind === "input")
      this.post({
        type: "input-accepted",
        id: waiting.id,
        eof: message.eof === true,
        value: message.eof === true ? "" : message.value,
      });
    this.pending = null;
    waiting.resolve(0);
  }
  read(instance, iovs, count, readPointer, spec) {
    if (!this.bytes.length && !this.eof)
      return Promise.resolve(
        this.input(
          spec || { name: "", line: 0, kind: 0, bits: 0, signed: false },
        ),
      ).then(() => this.copy(instance, iovs, count, readPointer));
    return this.copy(instance, iovs, count, readPointer);
  }
  copy(instance, iovs, count, readPointer) {
    if (count < 0 || count > 1024) throw Error("Buffer di input non valido.");
    const memory = new Uint8Array(instance.exports.memory.buffer),
      view = new DataView(memory.buffer);
    let used = 0;
    for (let i = 0; i < count; i++) {
      const pointer = view.getUint32(iovs + i * 8, true),
        size = view.getUint32(iovs + i * 8 + 4, true);
      const amount = Math.min(size, this.bytes.length - used);
      memory.set(this.bytes.subarray(used, used + amount), pointer);
      used += amount;
      if (amount < size) break;
    }
    this.bytes = this.bytes.slice(used);
    view.setUint32(readPointer, used, true);
    return 0;
  }
}
