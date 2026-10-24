import { bounds, errorAt, textOf, unwrap, walk } from "./clang-ast.js";

// Port of upstream flowchart_import.py. Clang WASM supplies the AST; source is
// never executed for conversion. Unsupported statements abort the entire import.
export function importFlow(ast, { validateOnly = false } = {}) {
  let serial = 0;
  const functions = new Map(),
    names = new Map();
  const text = (node) => textOf(ast, node).replace(/::__cv_user::/g, "::");
  const fail = (node, message) => errorAt(ast, node, message);
  const node = (kind, fields = {}) => {
    if (++serial > 200)
      throw Error("La conversione supera il limite di 200 blocchi.");
    if (
      Object.values(fields).some(
        (v) => typeof v === "string" && v.length > 1000,
      )
    )
      throw Error("Un blocco supera il limite di 1.000 caratteri.");
    return { id: "import" + serial, kind, ...fields };
  };
  const name = (n) => {
    const value = n.name || "";
    if (
      !/^[A-Za-z_]\w*$/.test(value) ||
      value.startsWith("__") ||
      ["cv", "cin", "cout", "std"].includes(value)
    )
      fail(n, "Nome riservato o non rappresentabile.");
    return value;
  };
  const type = (n) => {
    const qualified = (n.type?.qualType || "").replaceAll("std::", "");
    if (
      (qualified.match(/\*/g) || []).length > 1 ||
      (qualified.includes("*") && /[&\[]/.test(qualified)) ||
      qualified.includes("&&") ||
      (qualified.match(/\[/g) || []).length > 1
    )
      fail(
        n,
        "Tipo non rappresentabile: usa puntatori a un solo livello, senza combinazioni con riferimenti o array.",
      );
    const base = qualified.replace(/\bconst\b|[&*]|\[\d+\]|\s/g, "");
    if (
      !["int", "float", "double", "char", "bool", "string", "void"].includes(
        base,
      )
    )
      fail(n, "Tipo non rappresentabile: " + qualified);
    return [base, qualified];
  };
  const operator = (n) =>
    n?.kind === "CXXOperatorCallExpr"
      ? [...walk(n.inner?.[0])].find((c) =>
          c.referencedDecl?.name?.startsWith("operator"),
        )?.referencedDecl.name
      : "";
  function stream(n, op, streamName) {
    n = unwrap(n);
    if (operator(n) === op) {
      const left = stream(n.inner[1], op, streamName);
      return left && [...left, n.inner[2]];
    }
    return n?.kind === "DeclRefExpr" && n.referencedDecl?.name === streamName
      ? []
      : null;
  }
  function call(n, result = "") {
    n = unwrap(n);
    if (n?.kind !== "CallExpr") return null;
    const children = n.inner || [];
    const decl = [...walk(children[0])]
      .map((c) => c.referencedDecl)
      .find((d) => functions.has(d?.id));
    if (!decl) return null;
    if (children.some((c) => c.kind === "CXXDefaultArgExpr"))
      fail(n, "Parametri predefiniti non ancora importabili.");
    return node("call", {
      callee: functions.get(decl.id),
      args: children.slice(1).map(text).join(", "),
      result,
    });
  }
  function declaration(n) {
    return (n.inner || []).map((variable) => {
      if (variable.kind !== "VarDecl" || variable.storageClass === "static")
        fail(variable, "Dichiarazione locale non importabile.");
      const variableName = name(variable),
        [base, qualified] = type(variable);
      if (variableName === "main" || /\*\s*const/.test(qualified))
        fail(variable, "Nome main o puntatore const non importabile.");
      const mode = qualified.includes("&")
        ? "reference"
        : qualified.includes("*")
          ? "pointer"
          : "value";
      let size = "";
      if (qualified.includes("[")) {
        const suffix = new TextDecoder().decode(
          ast.bytes.subarray(variable.loc.offset, bounds(variable)[1]),
        );
        size =
          suffix.match(/^[A-Za-z_]\w*\s*\[([^\]]*)\]/)?.[1]?.trim() ||
          qualified.match(/\[(\d+)\]/)?.[1] ||
          "";
      }
      const initializer = variable.init
        ? (variable.inner || []).find((c) => bounds(c))
        : null;
      let init = initializer ? text(initializer) : "";
      if (init === variableName && base === "string") init = "";
      else if (init.startsWith(variableName + "(") && init.endsWith(")"))
        init =
          base === "string"
            ? "string(" + init.slice(variableName.length + 1, -1) + ")"
            : init.slice(variableName.length + 1, -1);
      if (init.startsWith("{") && init.endsWith("}"))
        init =
          init.slice(1, -1).trim() || (base === "string" ? "string()" : "0");
      const called =
        initializer && !size && mode === "value"
          ? call(initializer, variableName)
          : null;
      return called
        ? {
            ...called,
            declareType: base,
            constant: qualified.includes("const"),
          }
        : node("declare", {
            name: variableName,
            type: base,
            mode,
            size,
            init,
            constant: qualified.includes("const"),
          });
    });
  }
  function body(n, depth = 0) {
    if (depth > 12) fail(n, "Superato il limite di annidamento.");
    return (n.kind === "CompoundStmt" ? n.inner || [] : [n]).flatMap((c) =>
      statement(c, depth),
    );
  }
  function statement(n, depth) {
    const kind = n.kind,
      children = n.inner || [];
    if (kind === "NullStmt" || /^OSSERVA\b/.test(text(n))) return [];
    // Direct C++ tracing preserves lexical blocks in the original AST. They
    // can be validated recursively even though the diagram format cannot
    // represent a standalone scope. Never export the flattened validation data.
    if (validateOnly && kind === "CompoundStmt") return body(n, depth + 1);
    if (kind === "DeclStmt") return declaration(n);
    if (["IfStmt", "WhileStmt"].includes(kind)) {
      if (n.hasInit || n.hasVar)
        fail(n, "Dichiarazioni nella condizione non importabili.");
      return [
        node(
          kind === "IfStmt" ? "if" : "while",
          kind === "IfStmt"
            ? {
                condition: text(children[0]),
                then: body(children[1], depth + 1),
                else: children[2] ? body(children[2], depth + 1) : [],
              }
            : {
                condition: text(children[0]),
                body: body(children[1], depth + 1),
              },
        ),
      ];
    }
    if (kind === "ForStmt") {
      if (children.length !== 5 || Object.keys(children[1]).length)
        fail(
          n,
          "Usa un FOR con inizializzazione, condizione e aggiornamento separati.",
        );
      return [
        node("for", {
          init: text(children[0]).replace(/;$/, ""),
          condition: text(children[2]) || "true",
          update: text(children[3]),
          body: body(children[4], depth + 1),
        }),
      ];
    }
    if (kind === "DoStmt")
      return [
        node("do", {
          condition: text(children[1]),
          body: body(children[0], depth + 1),
        }),
      ];
    if (kind === "ReturnStmt")
      return [node("return", { expression: text(children[0]) })];
    if (["BreakStmt", "ContinueStmt"].includes(kind))
      return [node(kind === "BreakStmt" ? "break" : "continue")];
    if (kind.endsWith("Stmt"))
      fail(n, kind + " non rappresentabile con i blocchi disponibili.");
    const expression = unwrap(n),
      outputs = stream(expression, "operator<<", "cout");
    if (outputs) {
      const result = [];
      let rows = [];
      for (const output of outputs) {
        const value = unwrap(output);
        if (
          value.kind === "DeclRefExpr" &&
          value.referencedDecl?.kind === "FunctionDecl" &&
          value.referencedDecl.name === "endl"
        ) {
          result.push(
            node("output", {
              expression: rows.join("\n") || '""',
              ending: "OUTLN",
            }),
          );
          rows = [];
        } else rows.push(text(output));
      }
      if (rows.length)
        result.push(
          node("output", { expression: rows.join("\n"), ending: "OUT" }),
        );
      return result;
    }
    const inputs = stream(expression, "operator>>", "cin");
    if (inputs) {
      const targets = inputs.map(text);
      if (targets.some((t) => !/^[A-Za-z_]\w*(?:\[[^\[\]]+\])?$/.test(t)))
        fail(n, "INPUT importabile solo su variabili o celle di array.");
      return [
        node("input", {
          target: targets.join("\n"),
          prompt: "",
          grouping: "chain",
        }),
      ];
    }
    const called = call(expression);
    if (called) return [called];
    if (
      kind === "CallExpr" &&
      [...walk(children[0])].some((c) => c.referencedDecl?.name === "getline")
    ) {
      if (
        children.length !== 3 ||
        !["cin", "std::cin"].includes(text(children[1]))
      )
        fail(
          n,
          "Usa getline(cin, variabile), senza delimitatori personalizzati.",
        );
      return [
        node("input", { target: text(children[2]), prompt: "", mode: "line" }),
      ];
    }
    if (kind === "BinaryOperator" && n.opcode === "=") {
      const c = call(children[1], text(children[0]));
      if (c) return [c];
    }
    return [node("assign", { expression: text(n) })];
  }
  const definitions = [];
  for (const n of ast.tree.inner || []) {
    if (
      n.kind === "FunctionDecl" &&
      n.inner?.some((c) => c.kind === "CompoundStmt")
    ) {
      const value = name(n);
      if (names.has(value)) fail(n, "Funzioni sovraccaricate non importabili.");
      names.set(
        value,
        value === "main" ? "main" : "fn" + (definitions.length + 1),
      );
      definitions.push(n);
    } else if (
      ![
        "FunctionDecl",
        "UsingDirectiveDecl",
        "UsingDecl",
        "UsingShadowDecl",
        "EmptyDecl",
      ].includes(n.kind)
    )
      fail(
        n,
        "Globali, statiche, alias e altre dichiarazioni globali non importabili.",
      );
  }
  if (!names.has("main")) throw Error("Manca int main().");
  for (const n of ast.tree.inner || [])
    if (n.kind === "FunctionDecl" && names.has(n.name))
      functions.set(n.id, names.get(n.name));
  const result = definitions.map((fn) => {
    const returnType = fn.type.qualType
      .split("(")[0]
      .trim()
      .replaceAll("std::", "");
    if (
      !["void", "int", "float", "double", "char", "bool", "string"].includes(
        returnType,
      )
    )
      fail(fn, "Tipo di ritorno non rappresentabile.");
    const params = (fn.inner || [])
      .filter((c) => c.kind === "ParmVarDecl")
      .map((p) => {
        const [base, q] = type(p);
        if (/\*\s*const/.test(q) || p.init)
          fail(p, "Puntatori const e parametri predefiniti non importabili.");
        return {
          name: name(p),
          type: base,
          constant: q.includes("const"),
          mode: text(p).includes("[")
            ? "array"
            : q.includes("&")
              ? "reference"
              : q.includes("*")
                ? "pointer"
                : "value",
        };
      });
    if (fn.name === "main" && (returnType !== "int" || params.length))
      fail(fn, "Usa int main() senza parametri.");
    const compound = fn.inner.find((c) => c.kind === "CompoundStmt");
    if (
      fn.name !== "main" &&
      returnType !== "void" &&
      ![...walk(compound)].some((c) => c.kind === "ReturnStmt")
    )
      fail(fn, "Aggiungi return nella funzione.");
    return {
      id: names.get(fn.name),
      name: fn.name,
      returnType,
      params,
      body: body(compound),
    };
  });
  if (result.length > 20 || result.some((fn) => fn.params.length > 12))
    throw Error("Superati i limiti di subroutine o parametri.");
  if (validateOnly) return;
  result.sort((a, b) => (a.id !== "main") - (b.id !== "main"));
  return {
    format: "dentro-il-codice-flowchart",
    version: 3,
    scope: "cpp",
    functions: result,
  };
}
