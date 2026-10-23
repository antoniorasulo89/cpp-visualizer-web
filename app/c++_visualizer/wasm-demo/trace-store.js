// Bound data at the JS/WASM boundary, including pending values and the final
// state. Generated C++ helpers are not trusted to enforce these limits.
export class TraceStore {
  constructor({
    maxBytes = 8 * 1024 * 1024,
    maxStates = 800,
    maxValues = 200,
  } = {}) {
    this.maxBytes = maxBytes;
    this.maxStates = maxStates;
    this.maxValues = maxValues;
    this.values = Object.create(null);
    this.states = [];
    this.bytes = 0;
    this.valueBytes = 4; // Empty JSON object, estimated as UTF-16.
    this.sizes = new Map();
  }
  set(name, value) {
    if (!this.sizes.has(name) && this.sizes.size >= this.maxValues)
      throw Error("Superato il limite di 200 variabili attive.");
    const size = JSON.stringify({ [name]: value }).length * 2;
    const next = this.valueBytes - (this.sizes.get(name) || 0) + size;
    if (this.bytes + next > this.maxBytes) this.tooLarge();
    this.values[name] = value;
    this.sizes.set(name, size);
    this.valueBytes = next;
  }
  reset() {
    for (const name of Object.keys(this.values)) delete this.values[name];
    this.sizes.clear();
    this.valueBytes = 4;
  }
  record(state) {
    // The final summary is additional to the 800 observations, but its bytes
    // belong to exactly the same budget as every other state.
    if (this.states.length >= this.maxStates + (state.final ? 1 : 0))
      throw Error("Superato il limite di 800 osservazioni.");
    const size = JSON.stringify(state).length * 2;
    if (this.bytes + size > this.maxBytes) this.tooLarge();
    this.states.push(state);
    this.bytes += size;
  }
  tooLarge() {
    throw Error(
      "La traccia supera il limite di 8 MB. Riduci i passi o l’output.",
    );
  }
}

export function visibleText(text) {
  const escapes = {
    "\0": "\\0",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
    "\\": "\\\\",
  };
  return text.replace(
    /[\\\u0000-\u001f\u007f]/g,
    (char) =>
      escapes[char] || "\\x" + char.charCodeAt(0).toString(16).padStart(2, "0"),
  );
}
