// Constrain defined linear memories without changing executable instructions.
// Shared/memory64/imported-memory toolchains are intentionally unsupported.
const leb = (n) => {
  const out = [];
  do {
    let b = n & 127;
    n = Math.floor(n / 128);
    out.push(b | (n ? 128 : 0));
  } while (n);
  return out;
};
export function boundMemory(input, maximumPages) {
  const bytes = new Uint8Array(input),
    parts = [bytes.slice(0, 8)],
    memories = [];
  let p = 8;
  const read = () => {
    let value = 0,
      shift = 0,
      b;
    do {
      if (p >= bytes.length || shift > 28) throw Error("LEB non valido");
      b = bytes[p++];
      value += (b & 127) * 2 ** shift;
      shift += 7;
    } while (b & 128);
    return value;
  };
  if (bytes[0] !== 0 || bytes[1] !== 97 || bytes[2] !== 115 || bytes[3] !== 109)
    throw Error("WebAssembly non valido");
  while (p < bytes.length) {
    const id = bytes[p++],
      size = read(),
      start = p,
      end = start + size;
    if (end > bytes.length) throw Error("Sezione WebAssembly incompleta");
    if (id === 5) {
      const count = read(),
        data = [...leb(count)];
      if (count !== 1) throw Error("Attesa una sola memoria WebAssembly");
      for (let i = 0; i < count; i++) {
        const flags = read(),
          min = read();
        if (flags !== 0 && flags !== 1)
          throw Error("Memoria shared/memory64 non supportata");
        const oldMax = flags === 1 ? read() : 65536,
          max = Math.min(oldMax, maximumPages);
        if (min > max) throw Error("Memoria iniziale superiore al limite");
        memories.push({ min, max });
        data.push(1, ...leb(min), ...leb(max));
      }
      parts.push(new Uint8Array([id, ...leb(data.length), ...data]));
    } else {
      parts.push(
        new Uint8Array([id, ...leb(size)]),
        bytes.subarray(start, end),
      );
    }
    p = end;
  }
  if (memories.length !== 1) throw Error("Memoria definita mancante");
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return { bytes: out, memories };
}
