import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  readdir,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { boundMemory } from "./wasm-limits.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const vendor = path.join(root, "toolchain");
async function resetGenerated(name) {
  const target = path.resolve(root, name);
  if (
    !["toolchain", "release"].includes(name) ||
    path.dirname(target) !== path.resolve(root)
  )
    throw Error("Percorso di build non valido");
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
}
await resetGenerated("toolchain");
const packageRoot = path.join(root, "node_modules/browsercc");
const manifest = { version: "browsercc-0.1.1", files: {} };
for (const name of [
  "clang.js",
  "lld.js",
  "index.js",
  "clang.wasm",
  "lld.wasm",
  "sysroot.tar",
]) {
  let data = await readFile(path.join(packageRoot, "dist", name));
  const upstreamSha256 = createHash("sha256").update(data).digest("hex");
  if (name.endsWith(".wasm")) data = Buffer.from(boundMemory(data, 8192).bytes); // 512 MiB/module
  if (name === "index.js") {
    let text = data.toString("utf8");
    text =
      '// Local changes: verified local assets, bounded WASM memories, return binary.\nimport {loadAsset} from "../assets.js";\n' +
      text;
    text = text.replaceAll(
      'thisProgram: "clang++",',
      'wasmBinary: await loadAsset("clang.wasm"),\n        thisProgram: "clang++",',
    );
    text = text.replaceAll(
      'thisProgram: "wasm-ld",',
      'wasmBinary: await loadAsset("lld.wasm"),\n        thisProgram: "wasm-ld",',
    );
    text = text.replace(
      'const sysroot = await (await fetch(new URL("sysroot.tar", import.meta.url).href)).arrayBuffer();',
      'const sysroot = (await loadAsset("sysroot.tar")).buffer;',
    );
    text = text.replace(
      "module: await WebAssembly.compile(output),",
      "module: await WebAssembly.compile(output),\n        bytes: output,",
    );
    text = text.replaceAll(
      'stderr += data + "\\n";',
      'if (stderr.length + data.length > 100000) throw new Error("Diagnostica superiore al limite di 100 KB.");\n            stderr += data + "\\n";',
    );
    data = Buffer.from(text);
  }
  await writeFile(path.join(vendor, name), data);
  manifest.files[name] = {
    size: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
    upstreamSha256,
  };
  if (name.endsWith(".wasm") || name.endsWith(".tar")) {
    const gz = gzipSync(data, { level: 9 });
    await writeFile(path.join(vendor, name + ".gz"), gz);
    manifest.files[name].gzipSize = gz.length;
  }
}
await copyFile(
  path.join(packageRoot, "LICENSE"),
  path.join(vendor, "LICENSE.browsercc"),
);
await copyFile(
  path.join(root, "licenses/LLVM.txt"),
  path.join(vendor, "LICENSE.llvm"),
);
await copyFile(
  path.join(root, "node_modules/@bjorn3/browser_wasi_shim/LICENSE-APACHE"),
  path.join(vendor, "LICENSE.wasi"),
).catch(async () => {
  await copyFile(
    path.join(root, "node_modules/@bjorn3/browser_wasi_shim/LICENSE"),
    path.join(vendor, "LICENSE.wasi"),
  );
});
await build({
  absWorkingDir: root,
  entryPoints: [
    path.join(root, "node_modules/@bjorn3/browser_wasi_shim/dist/index.js"),
  ],
  bundle: true,
  format: "esm",
  outfile: path.join(vendor, "wasi.js"),
  legalComments: "eof",
});
for (const file of await readdir(path.join(root, "licenses")))
  await copyFile(path.join(root, "licenses", file), path.join(vendor, file));
await writeFile(
  path.join(vendor, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
const release = path.join(root, "release");
await resetGenerated("release");
// Only named public files enter the static release; never node_modules or tests.
const own = [
  "index.html",
  "demo.css",
  "demo.js",
  "skins.css",
  "skins.js",
  "worker.js",
  "flow-wasm.js",
  "clang-ast.js",
  "flow-import.js",
  "flow-instrument.js",
  "trace-store.js",
  "assets.js",
  "runtime.hpp",
  "README.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
];
for (const file of own)
  await copyFile(
    path.join(root, file),
    path.join(release, "wasm-demo", file),
  ).catch(async (e) => {
    if (e.code === "ENOENT") {
      await mkdir(path.join(release, "wasm-demo"), { recursive: true });
      await copyFile(
        path.join(root, file),
        path.join(release, "wasm-demo", file),
      );
    } else throw e;
  });
await mkdir(path.join(release, "wasm-demo/toolchain"), { recursive: true });
for (const file of await readdir(vendor))
  await copyFile(
    path.join(vendor, file),
    path.join(release, "wasm-demo/toolchain", file),
  );
for (const file of [
  "flowchart-core.js",
  "flowchart-editor.js",
  "flowchart.css",
])
  await copyFile(path.join(root, "..", file), path.join(release, file));
await writeFile(path.join(release, ".nojekyll"), "");
await writeFile(
  path.join(release, "index.html"),
  '<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dentro il codice</title><meta http-equiv="refresh" content="0;url=wasm-demo/"><a href="wasm-demo/">Apri Dentro il codice</a></html>',
);
const core = own.concat([
  "toolchain/manifest.json",
  "toolchain/index.js",
  "toolchain/clang.js",
  "toolchain/lld.js",
  "toolchain/wasi.js",
  "../flowchart-core.js",
  "../flowchart-editor.js",
  "../flowchart.css",
]);
const hash = createHash("sha256");
for (const file of core) hash.update(await readFile(path.resolve(root, file)));
const template = await readFile(
  path.join(root, "scripts/sw.template.js"),
  "utf8",
);
hash.update(JSON.stringify(manifest));
hash.update(template);
const version = hash.digest("hex").slice(0, 16);
const sw = template
  .replace("__VERSION__", version)
  .replace("__CORE__", JSON.stringify(core));
await writeFile(path.join(root, "sw.js"), sw);
await writeFile(path.join(release, "wasm-demo/sw.js"), sw);
console.log(
  JSON.stringify({ version, assets: manifest.files, release }, null, 2),
);
