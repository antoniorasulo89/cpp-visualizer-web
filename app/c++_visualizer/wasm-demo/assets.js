const cache = new Map();
let manifestPromise;
const base = new URL("toolchain/", import.meta.url);
export async function loadAsset(name) {
  if (cache.has(name)) return cache.get(name);
  const promise = (async () => {
    manifestPromise ||= fetch(new URL("manifest.json", base)).then((r) => {
      if (!r.ok) throw Error("Manifest della toolchain non disponibile");
      return r.json();
    });
    const manifest = await manifestPromise,
      entry = manifest.files[name];
    if (!entry) throw Error("Risorsa non prevista nel manifest");
    const compressed =
      typeof DecompressionStream !== "undefined" && entry.gzipSize;
    self.postMessage({
      type: "status",
      phase: "loading",
      text: `Caricamento ${name} (${Math.ceil((compressed ? entry.gzipSize : entry.size) / 1048576)} MB)…`,
    });
    const response = await fetch(
      new URL(name + (compressed ? ".gz" : ""), base),
    );
    if (!response.ok) throw Error(`Risorsa ${name}: HTTP ${response.status}`);
    const stream = compressed
      ? response.body.pipeThrough(new DecompressionStream("gzip"))
      : response.body;
    const reader = stream.getReader(),
      chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > entry.size) {
        await reader.cancel();
        throw Error("Dimensione risorsa non valida");
      }
      chunks.push(value);
    }
    if (size !== entry.size)
      throw Error("Download incompleto: riprova con una connessione stabile.");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    if (digest !== entry.sha256)
      throw Error(
        "Integrità della toolchain non valida: aggiorna la pagina e riprova.",
      );
    return bytes;
  })();
  cache.set(name, promise);
  return promise;
}
