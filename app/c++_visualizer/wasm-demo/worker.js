import { compile } from "./toolchain/index.js";
import { WASI, File, OpenFile, ConsoleStdout } from "./toolchain/wasi.js";
import { analyze } from "./clang-ast.js";
import { importFlow } from "./flow-import.js";
import { instrumentFlow } from "./flow-instrument.js";
import { TraceStore, visibleText } from "./trace-store.js";
self.onmessage = async ({ data }) => {
  let phase = "loading",
    log = "",
    output = "",
    outputBytes = 0,
    lastLine = null;
  const trace = new TraceStore(),
    { states, values } = trace,
    started = performance.now();
  let instance;
  const status = (text) => self.postMessage({ type: "status", phase, text });
  function record(state) {
    trace.record(state);
    if (!state.final) {
      lastLine = state.line;
      self.postMessage({ type: "progress", state });
    }
  }
  function nameAt(pointer) {
    const bytes = new Uint8Array(instance.exports.memory.buffer);
    if (pointer < 0 || pointer >= bytes.length)
      throw Error("Nome di osservazione non valido.");
    let end = pointer;
    while (end < bytes.length && bytes[end] !== 0 && end - pointer <= 4096)
      ++end;
    if (end >= bytes.length || end - pointer > 4096)
      throw Error("Nome di osservazione troppo lungo o non terminato.");
    return new TextDecoder().decode(bytes.subarray(pointer, end));
  }
  function textAt(pointer, length) {
    const bytes = new Uint8Array(instance.exports.memory.buffer);
    if (
      !Number.isInteger(length) ||
      length < 0 ||
      length > 4096 ||
      pointer < 0 ||
      pointer > bytes.length ||
      length > bytes.length - pointer
    )
      throw Error("Valore testuale non valido: massimo 4096 byte.");
    return visibleText(
      new TextDecoder().decode(bytes.subarray(pointer, pointer + length)),
    );
  }
  try {
    if (
      typeof data.code !== "string" ||
      new TextEncoder().encode(data.code).length > (data.flow ? 131072 : 30000)
    )
      throw Error(
        data.flow
          ? "Il diagramma genera oltre 128 KB di codice. Riduci i blocchi."
          : "Il sorgente deve contenere al massimo 30.000 byte.",
      );
    if (
      typeof data.input !== "string" ||
      new TextEncoder().encode(data.input).length > 10000
    )
      throw Error("Input: massimo 10.000 byte UTF-8.");
    status("Caricamento della toolchain verificata…");
    let source = data.code;
    if (data.action === "import" || data.flow) {
      phase = "compiling";
      status(
        data.action === "import"
          ? "Conversione C++ → Flowchart con Clang nel browser…"
          : "Analisi e osservazioni automatiche del diagramma…",
      );
      const ast = await analyze(source);
      if (data.action === "import") {
        self.postMessage({ type: "imported", document: importFlow(ast) });
        return;
      }
      source = instrumentFlow(ast, {
        lineMap: data.lineMap,
        flow: data.flowInfo,
      });
    }
    const response = await fetch("runtime.hpp");
    if (!response.ok) throw Error("Runtime di osservazione non disponibile.");
    const runtime = await response.text();
    phase = "compiling";
    status("Compilazione C++17 e collegamento nel browser…");
    const result = await compile({
      source: '#include "runtime.hpp"\n#line 1 "programma.cpp"\n' + source,
      fileName: "programma.cpp",
      flags: [
        "-std=c++17",
        "-O0",
        "-fno-exceptions",
        "-fno-color-diagnostics",
        "-Werror=return-type",
        "-Wl,--allow-undefined-file=/imports.txt",
        "-Wl,--max-memory=67108864",
        "-Wl,-z,stack-size=1048576",
      ],
      extraFiles: {
        "/runtime.hpp": runtime,
        "/imports.txt":
          "__cv_trace\n__cv_text\n__cv_flow_reset\n__cv_flow_commit\n",
      },
    });
    log = result.compileOutput;
    if (!result.module)
      throw Error(
        "Compilazione non riuscita. Correggi il blocco o la riga indicati.",
      );
    const allowed = new Set([
      "cv_trace",
      "cv_text",
      "cv_flow_reset",
      "cv_flow_commit",
    ]);
    for (const item of WebAssembly.Module.imports(result.module))
      if (
        item.kind !== "function" ||
        (item.module !== "wasi_snapshot_preview1" &&
          !(item.module === "env" && allowed.has(item.name)))
      )
        throw Error(
          "Il programma richiede una funzionalità non disponibile nel browser.",
        );
    phase = "running";
    status("Esecuzione nel browser (memoria massima 64 MB)…");
    const stream = () => {
      const decoder = new TextDecoder();
      return new ConsoleStdout((chunk) => {
        if (outputBytes + chunk.length > 20000)
          throw Error("Superato il limite di output: 20.000 byte.");
        outputBytes += chunk.length;
        const text = decoder.decode(chunk, { stream: true });
        output += text;
        self.postMessage({ type: "output", chunk: text });
      });
    };
    const wasi = new WASI(
      ["programma.wasm"],
      [],
      [
        new OpenFile(
          new File(new TextEncoder().encode(data.input), { readonly: true }),
        ),
        stream(),
        stream(),
      ],
    );
    instance = await WebAssembly.instantiate(result.module, {
      wasi_snapshot_preview1: wasi.wasiImport,
      env: {
        cv_trace(line, pointer, value) {
          const name = nameAt(pointer);
          trace.set(name, Number.isFinite(value) ? value : String(value));
          if (!data.flow) record({ line, name, values: { ...values }, output });
        },
        cv_text(line, pointer, textPointer, length) {
          if (!data.flow)
            throw Error("Osservazioni testuali riservate ai diagrammi.");
          trace.set(nameAt(pointer), textAt(textPointer, length));
        },
        cv_flow_reset() {
          trace.reset();
        },
        cv_flow_commit(line, result) {
          if (line > 0) lastLine = line;
          if (result === -2)
            throw Error(
              "Input esaurito o non valido: completa i dati e riesegui.",
            );
          if (result === -3)
            throw Error("Superato il limite di 200 variabili attive.");
          if (result === -4)
            throw Error(
              "Lettura di una variabile o cella prima dell’inizializzazione. Controlla i rami percorsi.",
            );
          if (result === -5)
            throw Error("Superato il limite di 128 chiamate annidate.");
          if (result === -6)
            throw Error("Array: massimo 100 elementi osservabili.");
          record({
            line,
            name: null,
            values: { ...values },
            output,
            result: result < 0 ? null : !!result,
          });
        },
      },
    });
    const code = wasi.start(instance);
    if (code !== 0) throw Error(`Il programma è terminato con codice ${code}.`);
    record({
      line: null,
      name: null,
      values: { ...values },
      output,
      final: true,
    });
    const binary = result.bytes.slice();
    self.postMessage(
      {
        type: "done",
        states,
        log,
        bytes: binary.length,
        elapsed: Math.round(performance.now() - started),
        wasm: binary,
      },
      [binary.buffer],
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      text: error.message || String(error),
      phase,
      log,
      states,
      output,
      line: lastLine,
    });
  }
};
