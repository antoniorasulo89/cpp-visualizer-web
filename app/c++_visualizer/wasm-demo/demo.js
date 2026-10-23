"use strict";
const $ = (id) => document.getElementById(id);
const EXAMPLE = `#include <iostream>

int main() {
    int limite = 5;
    OSSERVA(limite);
    int somma = 0;
    OSSERVA(somma);
    int i = 1;
    OSSERVA(i);
    while (i <= limite) {
        somma += i;
        OSSERVA(somma);
        ++i;
        OSSERVA(i);
    }
    std::cout << "Somma = " << somma << std::endl;
    OSSERVA(somma);
    return 0;
}`;
let worker = null,
  timer,
  states = [],
  cursor = 0,
  compiledSource = "",
  wasmURL = null;
let mode = "cpp",
  flow = null,
  compiledFlow = null;
let liveStates = [],
  liveOutput = "",
  draftSafe = true,
  saveTimer;
let playbackTimer = null,
  importing = false;
const SPEED_KEY =
  "dentro-il-codice-speed-v1:" + new URL(".", location.href).pathname;
try {
  const speed = localStorage.getItem(SPEED_KEY);
  if (["0.5", "1", "2", "4", "8"].includes(speed)) $("speed").value = speed;
} catch {}
function pausePlayback() {
  clearInterval(playbackTimer);
  playbackTimer = null;
  $("play").textContent = "Riproduci";
  $("play").setAttribute("aria-pressed", "false");
}
function startPlayback() {
  if (!states.length) return;
  if (cursor >= states.length - 1) cursor = 0;
  $("play").textContent = "Pausa";
  $("play").setAttribute("aria-pressed", "true");
  playbackTimer = setInterval(
    () => {
      if (cursor >= states.length - 1) {
        pausePlayback();
        return;
      }
      ++cursor;
      render();
    },
    1000 / Number($("speed").value),
  );
}
$("play").onclick = () => (playbackTimer ? pausePlayback() : startPlayback());
$("speed").onchange = () => {
  try {
    localStorage.setItem(SPEED_KEY, $("speed").value);
  } catch {}
  if (playbackTimer) {
    pausePlayback();
    startPlayback();
  }
};
addEventListener("pagehide", pausePlayback);
const DRAFT_KEY =
  "dentro-il-codice-web-v1:" + new URL(".", location.href).pathname;
let draft = null;
try {
  const legacy = ["localhost", "127.0.0.1"].includes(location.hostname)
    ? localStorage.getItem("dentro-il-codice-web-v1")
    : null;
  draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || legacy);
} catch {
  draftSafe = false;
}
$("code").value = typeof draft?.code === "string" ? draft.code : EXAMPLE;
$("input").value = typeof draft?.input === "string" ? draft.input : "";
function saveDraft() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 1,
        code: $("code").value,
        input: $("input").value,
        flow: flow?.document,
        mode,
      }),
    );
    draftSafe = true;
    $("save-status").textContent = "Bozza salvata su questo dispositivo.";
  } catch {
    draftSafe = false;
    $("save-status").textContent =
      "Salvataggio locale non disponibile. Scarica il codice o il diagramma per conservarlo.";
  }
}
const scheduleSave = () => {
  draftSafe = false;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 300);
};
addEventListener("beforeunload", (event) => {
  saveDraft();
  if (!draftSafe) {
    event.preventDefault();
    event.returnValue = "";
  }
});
function saveFile(content, name, type) {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([content], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function setStatus(text, error = false) {
  $("status").textContent = text;
  $("status").dataset.error = String(error);
}
function setBusy(busy) {
  pausePlayback();
  $("cpp-to-flow").disabled = busy;
  $("play").disabled = busy || !states.length;
  $("run").disabled = busy;
  $("stop").disabled = !busy;
  $("example").disabled = busy;
  $("code").readOnly = busy;
  $("mode-cpp").disabled = busy;
  $("mode-flow").disabled = busy;
  $("input").readOnly = busy;
  flow?.setRunning(busy);
}
function terminate() {
  clearTimeout(timer);
  worker?.terminate();
  worker = null;
  setBusy(false);
}
function clearTrace() {
  pausePlayback();
  states = [];
  cursor = 0;
  if (wasmURL) URL.revokeObjectURL(wasmURL);
  wasmURL = null;
  $("download").disabled = true;
  flow?.clearTrace();
  render();
}
function partialTrace(output = liveOutput) {
  states = [...liveStates];
  const last = states.at(-1);
  if (last || output)
    states.push({
      line: last?.line ?? null,
      name: null,
      values: { ...last?.values },
      output,
      partial: true,
    });
  cursor = Math.max(0, states.length - 1);
  render();
}
function diagnostics(text) {
  if (mode !== "flow" || !compiledFlow) return text;
  return text
    .replace(/programma\.cpp:(\d+):(\d+)/g, (_match, line, column) => {
      const point = compiledFlow.lineMap[Number(line)];
      const original = compiledFlow.originalMap.findIndex(
        (p) => p?.node === point?.node,
      );
      if (point?.node) {
        const found = FlowchartCore.locate(flow.document, point.node);
        if (found) {
          flow.fnId = found.fn.id;
          flow.selected = found.node.id;
          flow.render();
        }
      }
      return original > 0
        ? `programma.cpp:${original}:${column}`
        : `programma.cpp:${line}:${column}`;
    })
    .replace(/^.*(?:__cv_|cv_flow_).*$/gm, "[strumentazione del blocco]");
}
function render() {
  const state = states[cursor];
  $("prev").disabled = !state || cursor === 0;
  $("next").disabled = !state || cursor === states.length - 1;
  $("timeline").disabled = !state;
  $("play").disabled = !state || !!worker;
  $("timeline").max = String(Math.max(0, states.length - 1));
  $("timeline").value = String(cursor);
  $("step").textContent = state
    ? `${cursor + 1} / ${states.length}`
    : "Nessuna esecuzione";
  $("event").textContent = !state
    ? "Compila per generare la traccia."
    : state.partial
      ? "Esecuzione interrotta · ultimo stato disponibile"
      : state.final
        ? "Esecuzione terminata · ultimi valori osservati"
        : mode === "flow"
          ? `Blocco: ${flowLabel(state)}${state.result == null ? "" : state.result ? " · condizione VERA" : " · condizione FALSA"}`
          : `Riga ${state.line} · osservazione di ${state.name}`;
  $("timeline").setAttribute(
    "aria-valuetext",
    state
      ? `${cursor + 1} di ${states.length}. ${$("event").textContent}`
      : "Nessuna esecuzione",
  );
  let sourceLine = state?.line;
  if (mode === "flow" && state && compiledFlow) {
    const point = state.final
      ? { fn: "main", node: "main:end" }
      : compiledFlow.lineMap[state.line];
    const previousPoint = compiledFlow.lineMap[states[cursor - 1]?.line];
    if (point && flow.fnId !== point.fn) {
      flow.fnId = point.fn;
      flow.selected = null;
      flow.render();
    }
    flow.generated = compiledFlow;
    flow.traceState = point
      ? {
          point,
          route:
            previousPoint?.fn === point.fn
              ? FlowchartCore.pathBetween(
                  flow.graph,
                  previousPoint.node,
                  point.node,
                  states[cursor - 1]?.result ?? null,
                )
              : [],
          condition:
            state.result == null
              ? null
              : { line: state.line, action: "test", result: state.result },
        }
      : null;
    flow.paintTrace();
    const active = flow.canvas.querySelector(".flow-active");
    if (active) {
      const box = active.getBoundingClientRect(),
        viewport = flow.canvas.getBoundingClientRect();
      if (box.top < viewport.top || box.bottom > viewport.bottom)
        flow.canvas.scrollTop +=
          box.top - viewport.top - flow.canvas.clientHeight / 3;
    }
    sourceLine = compiledFlow.originalMap.findIndex(
      (p) => p?.node === point?.node,
    );
  }
  $("memory").replaceChildren();
  for (const [name, value] of Object.entries(state?.values || {})) {
    const cell = document.createElement("div");
    const changed = cursor > 0 && states[cursor - 1].values[name] !== value;
    cell.className = `cell${changed ? " changed" : ""}`;
    const label = document.createElement("span");
    label.textContent = name;
    const number = document.createElement("strong");
    number.textContent = String(value);
    cell.append(label, number);
    if (changed) {
      const hint = document.createElement("small");
      hint.textContent = "cambiato";
      cell.append(hint);
    }
    $("memory").append(cell);
  }
  $("console").textContent = state?.output || "—";
  $("source").replaceChildren();
  if (state) {
    const lines = compiledSource.split("\n");
    const start = Math.max(0, (sourceLine || 1) - 60),
      end = Math.min(lines.length, start + 120);
    for (let index = start; index < end; index++) {
      const row = document.createElement("span");
      row.textContent = `${String(index + 1).padStart(2)}  ${lines[index]}`;
      if (index + 1 === sourceLine) row.className = "active";
      $("source").append(row);
    }
  }
  const activeSource = $("source").querySelector(".active");
  if (activeSource) {
    const row = activeSource.getBoundingClientRect(),
      viewport = $("source").getBoundingClientRect();
    if (row.top < viewport.top || row.bottom > viewport.bottom)
      $("source").scrollTop +=
        row.top - viewport.top - $("source").clientHeight / 3;
  }
}
function flowLabel(state) {
  const id = compiledFlow?.lineMap[state.line]?.node;
  if (id === "main:start") return "Inizio main";
  if (id === "main:end") return "Fine main";
  const found = FlowchartCore.locate(flow.document, id);
  return found
    ? FlowchartCore.label(found.node, flow.document)
    : "Osservazione";
}
$("run").onclick = () => {
  terminate();
  clearTrace();
  liveStates = [];
  liveOutput = "";
  $("diagnostics").textContent = "—";
  $("diagnostics").parentElement.open = false;
  saveDraft();
  let sourceToCompile = $("code").value;
  compiledFlow = null;
  if (mode === "flow") {
    try {
      compiledFlow = FlowchartWasm.generate(flow.document);
      const original = flow.getSource();
      compiledFlow.originalMap = original.lineMap;
      compiledSource = original.code;
      sourceToCompile = compiledFlow.code;
    } catch (error) {
      $("diagnostics").textContent = error.message;
      $("diagnostics").parentElement.open = true;
      setStatus(error.message, true);
      return;
    }
  } else compiledSource = sourceToCompile;
  if (!sourceToCompile.trim()) {
    setStatus("Scrivi un programma C++.", true);
    return;
  }
  if (location.protocol === "file:") {
    setStatus(
      "Apri questa pagina con un server HTTP statico (vedi README).",
      true,
    );
    return;
  }
  if (
    !globalThis.isSecureContext ||
    typeof WebAssembly === "undefined" ||
    typeof Worker === "undefined" ||
    !globalThis.crypto?.subtle
  ) {
    setStatus(
      "Usa un browser aggiornato e apri il sito tramite HTTPS oppure sul server locale.",
      true,
    );
    return;
  }
  $("diagnostics").textContent = "—";
  setBusy(true);
  let current;
  try {
    current = worker = new Worker("worker.js", { type: "module" });
  } catch (error) {
    terminate();
    setStatus(`Impossibile avviare il motore: ${error.message}`, true);
    return;
  }
  function armTimeout(ms, message) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      terminate();
      partialTrace();
      setStatus(message, true);
    }, ms);
  }
  armTimeout(
    90000,
    "Caricamento o compilazione oltre 90 secondi. Puoi riprovare.",
  );
  setStatus("Avvio del compilatore WebAssembly…");
  current.onmessage = ({ data }) => {
    if (worker !== current) return;
    if (data.type === "status") {
      setStatus(data.text);
      if (data.phase === "running")
        armTimeout(
          5000,
          "Esecuzione interrotta dopo 5 secondi. Controlla eventuali cicli infiniti.",
        );
    } else if (data.type === "progress") {
      liveStates.push(data.state);
    } else if (data.type === "output") {
      liveOutput += data.chunk;
    } else if (data.type === "done") {
      states = data.states;
      cursor = 0;
      wasmURL = URL.createObjectURL(
        new Blob([data.wasm], { type: "application/wasm" }),
      );
      $("download").disabled = false;
      $("diagnostics").textContent =
        diagnostics(data.log.trim()) || "Nessun errore.";
      terminate();
      render();
      setStatus(
        `Compilato ed eseguito nel browser · ${data.bytes.toLocaleString("it-IT")} byte WebAssembly · ${(data.elapsed / 1000).toFixed(1)} s · ${states.length - 1} osservazioni`,
      );
    } else if (data.type === "error") {
      if (data.states) liveStates = data.states;
      if (typeof data.output === "string") liveOutput = data.output;
      terminate();
      partialTrace();
      $("diagnostics").textContent = diagnostics(
        `${data.log}\n${data.text}`.trim(),
      );
      const phase =
        {
          loading: "il caricamento",
          compiling: "la compilazione",
          running: "l’esecuzione",
        }[data.phase] || "l’esecuzione";
      setStatus(`Errore durante ${phase}: ${data.text}`, true);
      $("diagnostics").parentElement.open = true;
    }
  };
  current.onerror = (event) => {
    if (worker !== current) return;
    terminate();
    partialTrace();
    setStatus(`Errore del motore: ${event.message}`, true);
  };
  current.postMessage({
    code: sourceToCompile,
    input: $("input").value,
    flow: mode === "flow",
    lineMap: compiledFlow?.lineMap,
    flowInfo: compiledFlow?.flow,
  });
};
$("stop").onclick = () => {
  if (importing) {
    importing = false;
    terminate();
    setStatus("Conversione interrotta. Codice e diagramma conservati.");
    return;
  }
  terminate();
  partialTrace();
  setStatus("Esecuzione interrotta. Puoi modificare il codice e riprovare.");
};
$("prev").onclick = () => {
  pausePlayback();
  --cursor;
  render();
};
$("next").onclick = () => {
  pausePlayback();
  ++cursor;
  render();
};
$("timeline").oninput = (event) => {
  pausePlayback();
  cursor = Number(event.target.value);
  render();
};
$("example").onclick = () => {
  clearTrace();
  $("code").value = EXAMPLE;
  saveDraft();
  setStatus("Esempio ripristinato.");
};
$("code").oninput = () => {
  clearTrace();
  scheduleSave();
  setStatus("Codice modificato. Ricompila per aggiornare la traccia.");
};
$("input").oninput = () => {
  clearTrace();
  scheduleSave();
  setStatus("Input modificato. Ricompila per aggiornare la traccia.");
};
$("cpp-to-flow").onclick = () => {
  if (worker || !$("code").value.trim()) {
    setStatus("Scrivi il programma C++ prima della conversione.", true);
    return;
  }
  saveDraft();
  importing = true;
  setBusy(true);
  setStatus("Avvio della conversione locale C++ → Flowchart…");
  let current;
  try {
    current = worker = new Worker("worker.js", { type: "module" });
  } catch (error) {
    importing = false;
    terminate();
    setStatus(error.message, true);
    return;
  }
  timer = setTimeout(() => {
    importing = false;
    terminate();
    setStatus(
      "Conversione oltre 90 secondi. Codice e diagramma conservati.",
      true,
    );
  }, 90000);
  current.onmessage = ({ data }) => {
    if (worker !== current) return;
    if (data.type === "status") setStatus(data.text);
    else if (data.type === "imported") {
      try {
        const document = FlowchartCore.validate(data.document);
        FlowchartCore.generate(document);
        importing = false;
        terminate();
        setMode("flow");
        flow.replace(document);
        setStatus(
          "C++ convertito nel browser. Sorgente conservato; Annulla ripristina il diagramma precedente.",
        );
      } catch (error) {
        importing = false;
        terminate();
        setStatus(error.message, true);
      }
    } else if (data.type === "error") {
      importing = false;
      terminate();
      $("diagnostics").textContent = data.text;
      $("diagnostics").parentElement.open = true;
      setStatus(data.text, true);
    }
  };
  current.onerror = (event) => {
    if (worker === current) {
      importing = false;
      terminate();
      setStatus(event.message, true);
    }
  };
  current.postMessage({ action: "import", code: $("code").value, input: "" });
};
flow = new FlowchartEditor($("flow-pane"), {
  saved: draft?.flow ? JSON.stringify(draft.flow) : null,
  capabilities: {
    advanced: true,
    kinds: [
      "declare",
      "input",
      "output",
      "assign",
      "if",
      "while",
      "for",
      "do",
      "return",
      "break",
      "continue",
      "call",
    ],
    types: ["int", "float", "double", "char", "bool", "string"],
    subroutines: true,
  },
  exampleLabel: "Esempio somma",
  example: FlowchartWasm.example,
  onChange: () => {
    clearTrace();
    compiledFlow = null;
    scheduleSave();
    setStatus("Diagramma modificato. Compila per aggiornare la traccia.");
  },
  onEdit: () => {
    terminate();
    clearTrace();
    setStatus(
      "Puoi modificare il diagramma. Compila per generare una nuova traccia.",
    );
  },
});
if (!draft?.flow) flow.replace(FlowchartWasm.example());
function setMode(value) {
  clearTrace();
  compiledFlow = null;
  mode = value;
  $("cpp-pane").hidden = mode !== "cpp";
  $("flow-pane").hidden = mode !== "flow";
  $("flow-hint").hidden = mode !== "flow";
  $("example").hidden = mode !== "cpp";
  $("mode-cpp").setAttribute("aria-pressed", String(mode === "cpp"));
  $("mode-flow").setAttribute("aria-pressed", String(mode === "flow"));
  const url = new URL(location.href);
  url.searchParams.set("mode", mode);
  history.replaceState(null, "", url);
  saveDraft();
  setStatus(
    mode === "flow"
      ? "Diagramma pronto. Le osservazioni sono inserite automaticamente."
      : "Codice pronto. Usa OSSERVA per registrare i valori.",
  );
}
$("mode-cpp").onclick = () => setMode("cpp");
$("mode-flow").onclick = () => setMode("flow");
setMode(
  (new URLSearchParams(location.search).get("mode") || draft?.mode) === "flow"
    ? "flow"
    : "cpp",
);
$("download-source").onclick = () => {
  try {
    saveFile(
      mode === "flow" ? flow.getSource().code : $("code").value,
      "programma.cpp",
      "text/plain;charset=utf-8",
    );
  } catch (error) {
    setStatus(error.message, true);
  }
};
$("download").onclick = () => {
  const a = document.createElement("a");
  a.href = wasmURL;
  a.download = "programma.wasm";
  a.click();
};
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let applyUpdate = false;
  navigator.serviceWorker
    .register("sw.js")
    .then((reg) => {
      const waiting = () => {
        if (reg.waiting && hadController) {
          $("update").hidden = false;
          $("update").onclick = () => {
            saveDraft();
            terminate();
            applyUpdate = true;
            reg.waiting.postMessage("activate");
          };
        }
      };
      waiting();
      reg.addEventListener("updatefound", () =>
        reg.installing?.addEventListener("statechange", waiting),
      );
    })
    .catch(() => {
      $("save-status").textContent += " Modalità offline non disponibile.";
    });
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing && applyUpdate) {
      refreshing = true;
      location.reload();
    }
  });
}
