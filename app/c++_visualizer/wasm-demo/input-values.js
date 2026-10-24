export function inputDescription({ kind, bits, signed }) {
  return kind === 1
    ? `numero intero ${signed ? "" : "senza segno "}(${bits} bit)`
    : kind === 2
      ? "numero reale (punto decimale)"
      : kind === 3
        ? "carattere"
        : kind === 4
          ? "parola"
          : kind === 5
            ? "riga di testo"
            : kind === 6
              ? "valore booleano (0 oppure 1)"
              : "dato del programma";
}
export function validateInput(value, spec) {
  if (
    typeof value !== "string" ||
    new TextEncoder().encode(value).length > 4095 ||
    /[\r\n]/.test(value)
  )
    return "Inserisci una sola riga, al massimo 4095 byte.";
  const text = value.trim();
  if (spec.kind !== 5 && !text)
    return "Inserisci un valore oppure scegli Fine input.";
  if (spec.kind === 1) {
    if (!/^[+-]?\d+$/.test(text))
      return "Inserisci un numero intero, senza virgole o punti.";
    const bits = BigInt(spec.bits),
      n = BigInt(text);
    const min = spec.signed ? -(1n << (bits - 1n)) : 0n;
    const max = (1n << (bits - (spec.signed ? 1n : 0n))) - 1n;
    if (n < min || n > max)
      return `Il valore deve essere compreso tra ${min} e ${max}.`;
  }
  if (
    spec.kind === 2 &&
    (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) ||
      !Number.isFinite(Number(text)) ||
      (spec.bits === 32 && !Number.isFinite(Math.fround(Number(text)))))
  )
    return "Inserisci un numero reale valido: usa il punto, per esempio 2.5.";
  if (spec.kind === 3 && new TextEncoder().encode(text).length !== 1)
    return "Inserisci un solo carattere ASCII, per esempio a.";
  if (spec.kind === 4 && /\s/.test(text))
    return "Questa lettura richiede una parola; per una riga con spazi usa getline.";
  if (spec.kind === 6 && !["0", "1"].includes(text))
    return "Inserisci 0 oppure 1.";
  return "";
}
