import {
  Clang,
  setUpSysroot,
  getCompilerInvocation,
} from "./toolchain/index.js";
import { loadAsset } from "./assets.js";

// UTF-8 offsets are supplied by Clang. Keep directives as blank lines so the
// original line numbers and all offsets inside the user body remain stable.
export async function analyze(source) {
  const body = source.replace(
    /^\s*#\s*include\s*[<"]([^>"\n]+)[>"]\s*$/gm,
    (line, header) => {
      if (!["iostream", "string", "iomanip", "type_traits"].includes(header))
        throw Error("Importazione: header non supportato: " + header);
      return line.replace(/[^\r\n]/g, " ");
    },
  );
  if (/^\s*#/m.test(body))
    throw Error(
      "Importazione: macro e direttive diverse dagli include supportati non sono ammesse.",
    );
  const prefix =
    "#include <iostream>\n#include <string>\n#include <iomanip>\n#include <type_traits>\n#define OSSERVA(x) ((void)(x))\nnamespace __cv_user {\n";
  const full = prefix + body + "\n}\n";
  let output = "",
    errors = "";
  const compiler = await Clang({
    wasmBinary: await loadAsset("clang.wasm"),
    thisProgram: "clang++",
    print: (text) => {
      if (output.length + text.length > 12 * 1024 * 1024)
        throw Error("Albero sintattico oltre il limite di 12 MB.");
      output += text + "\n";
    },
    printErr: (text) => {
      if (errors.length < 100000) errors += text + "\n";
    },
  });
  setUpSysroot(compiler, (await loadAsset("sysroot.tar")).buffer, {});
  compiler.FS.writeFile("programma.cpp", full);
  const invocation = await getCompilerInvocation("programma.cpp", full, [
    "-std=c++17",
    "-O0",
    "-fno-exceptions",
  ]);
  const args = invocation.compilerArgs.filter(
    (arg, index, all) =>
      arg !== "-emit-obj" && arg !== "-o" && all[index - 1] !== "-o",
  );
  args.push("-fsyntax-only", "-ast-dump=json", "-ast-dump-filter=__cv_user");
  const code = compiler.callMain(args);
  if (code !== 0)
    throw Error(
      errors.replace(
        /programma.cpp:(\d+):/g,
        (_, line) =>
          "programma.cpp:" +
          Math.max(1, Number(line) - prefix.split("\n").length + 1) +
          ":",
      ),
    );
  let tree;
  try {
    tree = JSON.parse(output);
  } catch {
    throw Error("Clang non ha restituito un programma importabile.");
  }
  return {
    tree,
    bytes: new TextEncoder().encode(full),
    prefixBytes: new TextEncoder().encode(prefix).length,
    source: body,
    prefixLines: prefix.split("\n").length - 1,
  };
}

export function* walk(node) {
  if (!node || typeof node !== "object") return;
  yield node;
  for (const child of node.inner || []) yield* walk(child);
}
const loc = (p) => p?.expansionLoc || p;
export function bounds(node) {
  const a = loc(node?.range?.begin),
    b = loc(node?.range?.end);
  return Number.isInteger(a?.offset) && Number.isInteger(b?.offset)
    ? [a.offset, b.offset + (b.tokLen || 0)]
    : null;
}
export const unwrap = (node) => {
  while (
    [
      "ImplicitCastExpr",
      "ParenExpr",
      "ExprWithCleanups",
      "MaterializeTemporaryExpr",
      "CXXBindTemporaryExpr",
    ].includes(node?.kind) &&
    node.inner?.length === 1
  )
    node = node.inner[0];
  return node;
};
export function textOf(ast, node) {
  const range = bounds(node);
  return range
    ? new TextDecoder().decode(ast.bytes.subarray(...range)).trim()
    : "";
}
export function errorAt(ast, node, message) {
  const range = bounds(node);
  const line = range
    ? new TextDecoder().decode(ast.bytes.subarray(0, range[0])).split("\n")
        .length - ast.prefixLines
    : 1;
  throw Error(
    `Riga ${Math.max(1, line)}: ${message} Il codice originale è conservato.`,
  );
}
