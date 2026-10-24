import { bounds, walk, unwrap } from "./clang-ast.js";

// Instrument compiler-proven expression ranges, never a regexp approximation of
// C++. Insertions contain no newlines: diagnostics keep the shared generator map.
export function instrumentFlow(ast, generated) {
  const inserts = new Map(),
    watched = new Map(),
    duplicates = new Set();
  let serial = 0,
    rank = 0;
  const lineAt = (offset) =>
    new TextDecoder()
      .decode(ast.bytes.subarray(ast.prefixBytes, offset))
      .split("\n").length;
  const insert = (at, value, order = 0) => {
    if (at < ast.prefixBytes || at > ast.bytes.length - 2) return;
    if (!inserts.has(at)) inserts.set(at, []);
    inserts.get(at).push({ value, order, rank: rank++ });
  };
  function wrap(n, before, after, order = 0) {
    const range = bounds(n);
    if (!range) return;
    insert(range[0], before, order);
    insert(range[1], after, -order);
  }
  const functions = (ast.tree.inner || []).filter(
    (n) =>
      n.kind === "FunctionDecl" &&
      n.inner?.some((c) => c.kind === "CompoundStmt"),
  );
  for (const fn of functions)
    for (const n of walk(fn)) {
      if (
        ["VarDecl", "ParmVarDecl"].includes(n.kind) &&
        n.name &&
        !n.isImplicit
      )
        watched.set(n.id, { n, guard: "__cv_watch_" + ++serial });
    }
  const guardOf = (n) => {
    n = unwrap(n);
    if (n?.kind === "DeclRefExpr") return watched.get(n.referencedDecl?.id);
    if (["ArraySubscriptExpr", "UnaryOperator"].includes(n?.kind))
      return guardOf(n.inner?.[0]);
    return null;
  };
  function readsAndWrites(n, depth = 0, skipObjectRead = false) {
    if (!n?.kind) return;
    if (generated.automatic && n.range?.begin?.expansionLoc) return;
    const children = n.inner || [],
      range = bounds(n);
    if (n.kind === "ImplicitCastExpr" && n.castKind === "LValueToRValue") {
      const value = unwrap(children[0]),
        guard = guardOf(value),
        key = range?.join(":");
      if (guard && range && !duplicates.has("read" + key)) {
        duplicates.add("read" + key);
        wrap(n, "::__cv_runtime::read((", "))", -1000 + depth);
      }
    }
    const write =
      (n.kind === "BinaryOperator" && n.opcode === "=") ||
      n.kind === "CompoundAssignOperator" ||
      (n.kind === "UnaryOperator" && ["++", "--"].includes(n.opcode));
    if (write) {
      const target = children[0],
        guard = guardOf(target);
      if (guard) {
        if (n.kind === "UnaryOperator") {
          // ++/-- can be postfix: the result can be a temporary. Evaluate the
          // lvalue exactly once and preserve its native postfix/prefix behavior.
          const op = n.opcode === "++" ? "increment" : "decrement";
          const full = bounds(n),
            lhs = bounds(target);
          if (full && lhs) {
            insert(
              full[0],
              `::__cv_runtime::${op}<${n.isPostfix ? "true" : "false"}>(`,
              -2000 + depth,
            );
            insert(lhs[0], "", 0);
            // Remove only the operator token, retaining edits in the operand.
            for (let p = full[0]; p < lhs[0]; p++) replaceByte(p);
            for (let p = lhs[1]; p < full[1]; p++) replaceByte(p);
            insert(full[1], ")", 2000 - depth);
          }
        } else {
          if (n.kind === "CompoundAssignOperator")
            wrap(target, "::__cv_runtime::read((", "))", -1000 + depth);
          wrap(n, "::__cv_runtime::written((", "))", -2000 + depth);
        }
      }
    }
    const operatorName =
      n.kind === "CXXOperatorCallExpr"
        ? [...walk(children[0])].find((c) =>
            c.referencedDecl?.name?.startsWith("operator"),
          )?.referencedDecl.name
        : null;
    if (["operator=", "operator+="].includes(operatorName)) {
      const target = guardOf(children[1]);
      if (target) {
        if (operatorName !== "operator=")
          wrap(children[1], "::__cv_runtime::read((", "))", -1000 + depth);
        wrap(n, "::__cv_runtime::written((", "))", -2000 + depth);
      }
    }
    if (
      !skipObjectRead &&
      ["DeclRefExpr", "ArraySubscriptExpr"].includes(n.kind) &&
      /string/.test(n.type?.desugaredQualType || n.type?.qualType || "") &&
      !/\[/.test(n.type?.qualType || "")
    ) {
      const guard = guardOf(n),
        key = range?.join(":");
      if (guard && range && !duplicates.has("read" + key)) {
        duplicates.add("read" + key);
        wrap(n, "::__cv_runtime::read((", "))", -1000 + depth);
      }
    }
    // Stream extraction initializes its actual lvalue after the read succeeds.
    if (n.kind === "CXXOperatorCallExpr" && children.length === 3) {
      const operator = [...walk(children[0])].find(
        (c) => c.referencedDecl?.name === "operator>>",
      );
      const target = guardOf(children[2]);
      if (operator && target)
        wrap(children[2], "::__cv_runtime::destination((", "))", -3000 + depth);
    }
    if (
      n.kind === "CallExpr" &&
      [...walk(children[0])].some(
        (c) => c.referencedDecl?.name === "getline",
      ) &&
      children[2]
    ) {
      const target = guardOf(children[2]);
      if (target) {
        const callee = bounds(children[0]);
        for (let p = callee[0]; p < callee[1]; p++) replaceByte(p);
        insert(callee[0], "::__cv_runtime::readLine", -3000 + depth);
      }
    }
    const getline =
      n.kind === "CallExpr" &&
      [...walk(children[0])].some((c) => c.referencedDecl?.name === "getline");
    children.forEach((child, index) =>
      readsAndWrites(
        child,
        depth + 1,
        skipObjectRead ||
          (write && index === 0) ||
          (["operator=", "operator+="].includes(operatorName) && index === 1) ||
          (operatorName === "operator>>" && index === 2) ||
          (getline && index === 2),
      ),
    );
  }
  const erased = new Set();
  function replaceByte(at) {
    erased.add(at);
  }
  function finish(n) {
    const range = bounds(n);
    if (!range) return null;
    let end = range[1];
    if (n.kind !== "CompoundStmt") {
      let token = end;
      // Clang's expression range excludes ';', which may follow comments or
      // line breaks in handwritten code. Keep those bytes and their line map.
      while (token < ast.bytes.length) {
        if ([9, 10, 13, 32].includes(ast.bytes[token])) {
          token++;
          continue;
        }
        if (ast.bytes[token] === 47 && ast.bytes[token + 1] === 47) {
          while (token < ast.bytes.length && ast.bytes[token] !== 10) token++;
          continue;
        }
        if (ast.bytes[token] === 47 && ast.bytes[token + 1] === 42) {
          token += 2;
          while (
            token + 1 < ast.bytes.length &&
            !(ast.bytes[token] === 42 && ast.bytes[token + 1] === 47)
          )
            token++;
          token += 2;
          continue;
        }
        break;
      }
      if (ast.bytes[token] === 59) end = token + 1;
    }
    return end;
  }
  const snap = (line) => `::__cv_runtime::snapshot(${line});`;
  function declarations(n) {
    if (generated.automatic) {
      const variables = n.inner || [],
        ids = new Set(variables.map((v) => v.id));
      if (
        variables.some((v) =>
          [...walk(v)].some(
            (c) => c.kind === "DeclRefExpr" && ids.has(c.referencedDecl?.id),
          ),
        )
      )
        throw Error(
          "Tracciamento automatico: separa le dichiarazioni che dipendono l’una dall’altra (esempio: int x; int y=x;). Puoi anche selezionare Manuale (OSSERVA).",
        );
    }
    return (n.inner || [])
      .filter((c) => c.kind === "VarDecl")
      .map((variable) => {
        const guard = watched.get(variable.id);
        if (!guard) return "";
        const line = lineAt(bounds(variable)[0]);
        const deferred = generated.flow?.deferred?.some((d) => d.line === line);
        return `::__cv_runtime::Watch<std::remove_reference_t<decltype(${variable.name})>> ${guard.guard}(${JSON.stringify(variable.name)},&${variable.name},${variable.init && !deferred ? "true" : "false"},${deferred ? "false" : "true"});`;
      })
      .join("");
  }
  function sequence(n) {
    for (const child of n.inner || []) statement(child);
  }
  function controlBody(n) {
    // A handwritten single-statement body needs a scope for all inserted
    // statements, including snapshots before break/continue and nested else.
    if (generated.automatic && n?.kind !== "CompoundStmt" && bounds(n)) {
      insert(bounds(n)[0], "{ ", -9000);
      insert(finish(n), " }", -18000);
    }
    statement(n);
  }
  function statement(n) {
    if (generated.automatic && n?.range?.begin?.expansionLoc) return;
    const range = bounds(n);
    if (!range) return;
    const children = n.inner || [],
      line = lineAt(range[0]),
      point = generated.lineMap?.[line] || (generated.automatic ? {} : null);
    if (n.kind === "CompoundStmt") {
      sequence(n);
      return;
    }
    if (["IfStmt", "WhileStmt"].includes(n.kind)) {
      wrap(children[0], `::__cv_runtime::test(${line},(`, "))", -4000);
      children.slice(1).forEach(controlBody);
      return;
    }
    if (n.kind === "ForStmt") {
      if (Object.keys(children[1] || {}).length)
        throw Error("Dichiarazioni nella condizione FOR non supportate.");
      if (children[0]?.kind === "DeclStmt") {
        // Move only the AST-proven FOR prefix. Keep the initializer (and edits
        // inside it) exactly once, with its watcher in the same lexical scope.
        const init = children[0],
          start = bounds(init)[0],
          end = finish(init);
        for (let p = range[0]; p < start; p++) replaceByte(p);
        insert(range[0], "{ ", -6000);
        insert(end, declarations(init) + "for (;", -10000);
        insert(finish(n), " }", -18000);
      }
      if (bounds(children[2]))
        wrap(children[2], `::__cv_runtime::test(${line},(`, "))", -4000);
      controlBody(children[4]);
      return;
    }
    if (n.kind === "DoStmt") {
      insert(range[0], snap(line), -5000);
      wrap(
        children[1],
        `::__cv_runtime::test(${lineAt(bounds(children[1])[0])},(`,
        "))",
        -4000,
      );
      controlBody(children[0]);
      return;
    }
    if (n.kind === "ReturnStmt") {
      if (children[0])
        wrap(children[0], `::__cv_runtime::returned(${line},(`, "))", -5000);
      else insert(range[0], snap(line), -5000);
      return;
    }
    if (["BreakStmt", "ContinueStmt"].includes(n.kind)) {
      insert(range[0], snap(line), -5000);
      return;
    }
    if (!point) return;
    for (const descriptor of generated.flow?.deferred || []) {
      if (descriptor.activate !== line) continue;
      const variable = [...watched.values()].find(
        (v) => lineAt(bounds(v.n)?.[0]) === descriptor.line,
      );
      if (variable) insert(range[0], `${variable.guard}.visible=true;`, -5000);
    }
    const end = finish(n);
    // A preceding statement can end at the exact byte where the next one
    // begins ("int x; x=1;" without whitespace). Finish its observers and
    // scopes before opening any expression wrapper for that next statement.
    if (n.kind === "DeclStmt") insert(end, declarations(n), -20000);
    const expression = unwrap(n);
    const standaloneInput =
      generated.automatic &&
      ((expression?.kind === "CXXOperatorCallExpr" &&
        [...walk(expression.inner?.[0])].some(
          (c) => c.referencedDecl?.name === "operator>>",
        )) ||
        (expression?.kind === "CallExpr" &&
          [...walk(expression.inner?.[0])].some(
            (c) => c.referencedDecl?.name === "getline",
          )));
    if (
      (standaloneInput || generated.flow?.requiredInputs?.includes(line)) &&
      [...walk(n)].some(
        (c) =>
          c.referencedDecl?.name === "operator>>" ||
          c.referencedDecl?.name === "getline",
      )
    )
      insert(end, "::__cv_runtime::requireInput();", -19500);
    if (point.phase !== "prepare" && n.kind !== "NullStmt")
      insert(end, snap(line), -19000);
  }
  for (const fn of functions) {
    const body = fn.inner.find((c) => c.kind === "CompoundStmt"),
      range = bounds(body);
    const params = fn.inner
      .filter((c) => c.kind === "ParmVarDecl")
      .map(
        (p) =>
          `::__cv_runtime::Watch<std::remove_reference_t<decltype(${p.name})>> ${watched.get(p.id).guard}(${JSON.stringify(p.name)},&${p.name},true,true);`,
      )
      .join("");
    insert(
      range[0] + 1,
      `::__cv_runtime::Frame __cv_frame(${JSON.stringify(fn.name)});${params}${snap(lineAt(range[0]))}`,
      -6000,
    );
    if (
      fn.type.qualType.startsWith("void ") ||
      (generated.automatic && fn.name === "main")
    )
      insert(range[1] - 1, snap(lineAt(range[1] - 1)), 5000);
    readsAndWrites(body);
    sequence(body);
  }
  const parts = [];
  for (
    let i = ast.prefixBytes;
    i < ast.prefixBytes + new TextEncoder().encode(ast.source).length;
    i++
  ) {
    if (inserts.has(i))
      parts.push(
        new TextEncoder().encode(
          inserts
            .get(i)
            .sort((a, b) => a.order - b.order || a.rank - b.rank)
            .map((e) => e.value)
            .join(""),
        ),
      );
    if (!erased.has(i)) parts.push(ast.bytes.subarray(i, i + 1));
  }
  const size = parts.reduce((n, p) => n + p.length, 0);
  if (size > 262144) throw Error("Strumentazione oltre il limite di 256 KB.");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return new TextDecoder().decode(bytes);
}
