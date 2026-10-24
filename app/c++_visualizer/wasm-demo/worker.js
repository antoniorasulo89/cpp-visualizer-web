import { compile } from "./toolchain/index.js";
import { WASI, File, OpenFile, ConsoleStdout } from "./toolchain/wasi.js";
import { analyze } from "./clang-ast.js";
import { importFlow } from "./flow-import.js";
import { instrumentFlow } from "./flow-instrument.js";
import { TraceStore, visibleText } from "./trace-store.js";
import { CPP_STANDARD, FLOW_CPP_COMPAT } from "./compiler-options.js";
import { suspendable, SuspendedExecution } from "./asyncify.js";
import { InteractiveChannel } from "./interactive.js";
let channel;
self.onmessage = async ({ data }) => {
  if (data.type === "continue" || data.type === "input") {
    channel?.receive(data);
    return;
  }
  if (channel) return;
  const interactive = data.inputMode === "interactive";
  let consoleOutput = "";
  channel = interactive
    ? new InteractiveChannel((message) => {
        if (message.type === "input-accepted") {
          if (!message.eof) consoleOutput += message.value + "\n";
          message.consoleOutput = consoleOutput;
        }
        self.postMessage(message);
      })
    : null;
  const execution = interactive ? new SuspendedExecution() : null;
  const automatic = data.flow || data.traceMode === "automatic";
  let phase = "loading",
    log = "",
    output = "",
    outputBytes = 0,
    lastLine = null;
  const trace = new TraceStore(),
    { states, values } = trace,
    started = performance.now();
  let instance, inputSpec;
  let inputOutputOffset = 0;
  const status = (text) => self.postMessage({ type: "status", phase, text });
  function record(state) {
    if (interactive) state.consoleOutput = consoleOutput;
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
      data.inputMode !== undefined &&
      !["interactive", "prepared"].includes(data.inputMode)
    )
      throw Error("Modalità di input non valida.");
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
    if (
      data.traceMode !== undefined &&
      !["automatic", "manual"].includes(data.traceMode)
    )
      throw Error("Modalità di tracciamento non valida.");
    if (data.action === "import" || automatic) {
      phase = "compiling";
      status(
        data.action === "import"
          ? "Conversione C++ → Flowchart con Clang nel browser…"
          : data.flow
            ? "Analisi e osservazioni automatiche del diagramma…"
            : "Analisi dei passi del programma C++…",
      );
      let ast;
      try {
        ast = await analyze(source, { flowCompatibility: !!data.flow });
        // Validate before rewriting. Unsupported programs stay in the editor
        // and can use the explicit manual mode without a silent fallback.
        if (data.action !== "import" && !data.flow)
          importFlow(ast, { validateOnly: true });
      } catch (error) {
        if (data.action === "import" || data.flow) throw error;
        throw Error(
          `Tracciamento automatico: ${error.message} Seleziona Manuale (OSSERVA) per compilare senza tracciamento automatico.`,
        );
      }
      if (data.action === "import") {
        self.postMessage({ type: "imported", document: importFlow(ast) });
        return;
      }
      source = instrumentFlow(
        ast,
        data.flow
          ? {
              lineMap: data.lineMap,
              flow: data.flowInfo,
            }
          : { automatic: true },
      );
    }
    const response = await fetch("runtime.hpp");
    if (!response.ok) throw Error("Runtime di osservazione non disponibile.");
    const runtime = await response.text();
    phase = "compiling";
    status("Compilazione C++23 e collegamento nel browser…");
    const result = await compile({
      source:
        '#include "runtime.hpp"\n' +
        (data.flow ? FLOW_CPP_COMPAT : "") +
        '#line 1 "programma.cpp"\n' +
        source,
      fileName: "programma.cpp",
      flags: [
        `-std=${CPP_STANDARD}`,
        `-DCV_INTERACTIVE=${interactive ? 1 : 0}`,
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
          "__cv_trace\n__cv_text\n__cv_flow_reset\n__cv_flow_commit\n__cv_input\n",
      },
    });
    log = result.compileOutput;
    if (!result.module)
      throw Error(
        "Compilazione non riuscita. Correggi il blocco o la riga indicati.",
      );
    if (interactive) {
      status("Preparazione delle pause interattive…");
      result.bytes = await suspendable(result.bytes);
      result.module = await WebAssembly.compile(result.bytes);
    }
    const allowed = new Set([
      "cv_trace",
      "cv_text",
      "cv_flow_reset",
      "cv_flow_commit",
      "cv_input",
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
        consoleOutput += text;
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
    const env = {
      cv_trace(line, pointer, value) {
        const name = nameAt(pointer);
        trace.set(name, Number.isFinite(value) ? value : String(value));
        if (!automatic) record({ line, name, values: { ...values }, output });
      },
      cv_text(line, pointer, textPointer, length) {
        if (!automatic)
          throw Error(
            "Osservazioni testuali riservate al tracciamento automatico.",
          );
        trace.set(nameAt(pointer), textAt(textPointer, length));
      },
      cv_flow_reset() {
        trace.reset();
      },
      cv_flow_commit(line, result) {
        inputSpec = null;
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
        if (interactive) return channel.step();
      },
      cv_input(line, pointer, kind, bits, signed) {
        if (!interactive || channel.eof) return 0;
        const name = nameAt(pointer);
        if (
          !Number.isInteger(kind) ||
          kind < 0 ||
          kind > 6 ||
          (kind === 1 && ![8, 16, 32, 64].includes(bits))
        )
          throw Error("Tipo di input non valido.");
        if (line > 0) lastLine = line;
        record({
          line: line || lastLine,
          name: null,
          values: { ...values },
          output,
          awaitingInput: true,
        });
        inputSpec = {
          name,
          line: line || lastLine,
          kind,
          bits,
          signed: !!signed,
          prompt: output.slice(inputOutputOffset).slice(-500),
        };
        inputOutputOffset = output.length;
        return 0;
      },
    };
    if (interactive) {
      env.cv_flow_commit = execution.wrap(env.cv_flow_commit);
      env.cv_input = execution.wrap(env.cv_input);
      const originalRead = wasi.wasiImport.fd_read;
      wasi.wasiImport.fd_read = execution.wrap(
        (fd, iovs, count, readPointer) =>
          fd === 0
            ? channel.read(
                instance,
                iovs,
                count,
                readPointer,
                inputSpec || {
                  name: "",
                  line: lastLine,
                  kind: 0,
                  bits: 0,
                  signed: false,
                  prompt: output.slice(-500),
                },
              )
            : originalRead(fd, iovs, count, readPointer),
      );
    }
    instance = await WebAssembly.instantiate(result.module, {
      wasi_snapshot_preview1: wasi.wasiImport,
      env,
    });
    const code = interactive
      ? await execution.run(instance, () => wasi.start(instance))
      : wasi.start(instance);
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
      consoleOutput,
    });
  } finally {
    channel = null;
  }
};
