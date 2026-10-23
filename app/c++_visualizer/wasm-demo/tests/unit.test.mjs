import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { boundMemory } from "../scripts/wasm-limits.mjs";
import { TraceStore, visibleText } from "../trace-store.js";
const root = new URL("../", import.meta.url),
  sandbox = { TextEncoder, console };
vm.createContext(sandbox);
vm.runInContext(
  (await readFile(new URL("../flowchart-core.js", root), "utf8")) +
    "\n" +
    (await readFile(new URL("flow-wasm.js", root), "utf8")) +
    "\nglobalThis.C=FlowchartCore;globalThis.W=FlowchartWasm;",
  sandbox,
);
test("200 dichiarazioni rimangono lineari e tutte le righe hanno una mappa", () => {
  const doc = sandbox.C.blank();
  doc.functions[0].body = Array.from({ length: 200 }, (_, i) => ({
    ...sandbox.C.newNode("declare"),
    name: "v" + i,
    init: String(i),
  }));
  const generated = sandbox.W.generate(doc);
  assert.ok(Buffer.byteLength(generated.code) < 50000);
  assert.equal(generated.code.split("\n").length, generated.lineMap.length - 1);
});
test("for con cast accettato e nome interno non riservato all’utente", () => {
  const doc = sandbox.C.blank();
  doc.functions[0].body = [
    { ...sandbox.C.newNode("declare"), name: "cv_trace", init: "0" },
    {
      ...sandbox.C.newNode("for"),
      init: "cv_trace = static_cast<int>(0)",
      condition: "cv_trace < 2",
      update: "++cv_trace",
    },
  ];
  assert.doesNotThrow(() => sandbox.W.generate(doc));
});
test("massimo fisico imposto a clang e lld nel binario", async () => {
  for (const name of ["clang.wasm", "lld.wasm"]) {
    const bytes = await readFile(new URL("toolchain/" + name, root));
    const result = boundMemory(bytes, 8192);
    assert.equal(result.memories[0].max, 8192);
    assert.deepEqual(Buffer.from(result.bytes), bytes);
  }
});
test("parser dei limiti rifiuta moduli corrotti", () => {
  assert.throws(() => boundMemory(new Uint8Array([0]), 1024));
});

test("F4: budget sui valori pendenti, sostituzioni, reset e stato finale", () => {
  const trace = new TraceStore({ maxBytes: 256, maxStates: 2, maxValues: 2 });
  trace.set("a", 1);
  trace.set("a", 2);
  trace.set("b", 3);
  assert.throws(() => trace.set("c", 4), /200 variabili/);
  assert.throws(() => trace.set("a", "x".repeat(200)), /8 MB/);
  assert.equal(trace.values.a, 2); // Failed writes leave the previous state intact.
  trace.reset();
  trace.set("c", 4);
  assert.deepEqual(Object.keys(trace.values), ["c"]);
  trace.record({ values: { ...trace.values } });
  assert.throws(
    () => trace.record({ final: true, output: "x".repeat(200) }),
    /8 MB/,
  );
  assert.equal(trace.states.length, 1);
  trace.record({ values: {} });
  assert.throws(() => trace.record({ values: {} }), /800 osservazioni/);
  trace.record({ final: true });
  assert.equal(trace.states.length, 3);
});

test("F8: escape reversibilmente distinguibili per NUL, backslash e UTF-8", () => {
  assert.equal(visibleText("a\0b\n\t"), "a\\0b\\n\\t");
  assert.equal(visibleText("\\0"), "\\\\0");
  assert.equal(visibleText("città\x01"), "città\\x01");
});
