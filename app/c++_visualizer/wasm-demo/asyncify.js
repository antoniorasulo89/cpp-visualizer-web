// Portable suspension of the existing WASM stack. No replay, shared memory,
// cross-origin isolation headers, JSPI, or nested browser event loops.
export async function suspendable(bytes) {
  const { default: binaryen } = await import("./toolchain/binaryen.js");
  const module = binaryen.readBinary(bytes);
  try {
    // Enabling every experimental feature also changes binary encodings (for
    // example compact imports). Keep the portable feature set of our WASI target.
    const f = binaryen.Features;
    module.setFeatures(
      f.MutableGlobals |
        f.NontrappingFPToInt |
        f.BulkMemory |
        f.BulkMemoryOpt |
        f.SignExt |
        f.ReferenceTypes |
        f.Multivalue |
        f.SIMD128,
    );
    binaryen.setPassArgument(
      "asyncify-imports",
      "env.cv_input,env.cv_flow_commit,wasi_snapshot_preview1.fd_read",
    );
    module.runPasses(["asyncify"]);
    if (!module.validate())
      throw Error("Trasformazione del programma non valida.");
    return module.emitBinary();
  } finally {
    module.dispose();
  }
}

export class SuspendedExecution {
  constructor() {
    this.instance = null;
    this.pending = null;
    this.value = 0;
  }
  wrap(fn) {
    return (...args) => {
      const exports = this.instance.exports;
      if (exports.asyncify_get_state() === 2) {
        exports.asyncify_stop_rewind();
        return this.value;
      }
      const result = fn(...args);
      if (result && typeof result.then === "function") {
        if (this.pending) throw Error("Sospensioni sovrapposte.");
        this.pending = result;
        exports.asyncify_start_unwind(this.data);
        return 0;
      }
      return result;
    };
  }
  async run(instance, entry) {
    this.instance = instance;
    this.data = instance.exports.cv_async_data();
    while (true) {
      const result = entry();
      if (instance.exports.asyncify_get_state() !== 1) return result;
      instance.exports.asyncify_stop_unwind();
      const pending = this.pending;
      this.pending = null;
      this.value = await pending;
      instance.exports.asyncify_start_rewind(this.data);
    }
  }
}
