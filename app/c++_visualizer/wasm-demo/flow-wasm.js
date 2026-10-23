"use strict";
// Shared upstream generator and migration. AST instrumentation in the Worker
// preserves C++ loop scopes without rewriting braces or counting source lines.
const FlowchartWasm = (() => {
  const C = FlowchartCore;
  function example() {
    const doc = C.blank();
    doc.version = 1; // Migrate the original stream-style example through the shared core.
    const n = (kind, fields) => Object.assign(C.newNode(kind), fields);
    doc.functions[0].body = [
      n("declare", { name: "limite", init: "5" }),
      n("declare", { name: "somma", init: "0" }),
      n("declare", { name: "i", init: "1" }),
      n("while", {
        condition: "i <= limite",
        body: [
          n("assign", { expression: "somma += i" }),
          n("assign", { expression: "++i" }),
        ],
      }),
      n("output", { expression: '"Somma = " << somma' }),
    ];
    return doc;
  }
  function generate(doc) {
    const generated = C.generate(doc);
    generated.flow.requiredInputs = generated.lineMap.flatMap((point, line) =>
      point && C.locate(doc, point.node)?.node.kind === "input" ? [line] : [],
    );
    return generated;
  }
  return { generate, example };
})();
if (typeof module !== "undefined") module.exports = FlowchartWasm;
