async (page) => {
  const results = [];
  const run = async (code) => {
    if (code !== undefined)
      await page
        .getByRole("textbox", { name: "Codice modificabile" })
        .fill(code);
    await page
      .getByRole("button", { name: "Compila e visualizza", exact: true })
      .click();
    await page.waitForFunction(
      () => !document.getElementById("run").disabled,
      null,
      { timeout: 30000 },
    );
  };
  const assert = (condition, name) => {
    if (!condition) throw new Error(name);
    results.push(name);
  };
  await page.getByRole("button", { name: "Codice C++", exact: true }).click();
  await page
    .getByRole("button", { name: "Ripristina esempio", exact: true })
    .click();
  await run();
  await page.getByRole("slider", { name: "Passo", exact: true }).focus();
  await page.keyboard.press("End");
  assert(
    (await page.locator("#console").innerText()).includes("Somma = 15"),
    "Somma 1..5 = 15",
  );
  assert(
    (await page.locator("#memory").innerText()).includes("15"),
    "Memoria finale somma=15",
  );
  await page.getByRole("button", { name: "← Indietro", exact: true }).click();
  assert(
    (await page.locator("#event").innerText()).includes("Riga 17"),
    "Navigazione indietro",
  );
  await run("int main() { int x = ; }");
  assert(
    (await page.locator("#diagnostics").innerText()).includes(
      "programma.cpp:1:",
    ),
    "Errore di sintassi con riga originale",
  );
  assert(
    await page.locator("#timeline").isDisabled(),
    "Nessuna traccia precedente dopo errore",
  );
  await run(
    "#include <iostream>\nint main() { int a = 7; OSSERVA(a); int b = 3; OSSERVA(b); int prodotto = a*b; OSSERVA(prodotto); std::cout << prodotto << std::endl; return 0; }",
  );
  await page.getByRole("slider", { name: "Passo", exact: true }).focus();
  await page.keyboard.press("End");
  assert(
    (await page.locator("#console").innerText()).trim() === "21",
    "Sorgente nuovo compilato: 7*3=21",
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Scarica .wasm", exact: true })
    .click();
  const download = await downloadPromise;
  assert(
    download.suggestedFilename() === "programma.wasm",
    "Download del modulo compilato",
  );
  await run("int main() { volatile int x = 0; while (true) { x = 1; } }");
  assert(
    (await page.locator("#status").innerText()).includes("5 secondi"),
    "Timeout ciclo infinito",
  );
  await run("int main() { for (int i = 0; i < 1000; ++i) OSSERVA(i); }");
  assert(
    (await page.locator("#status").innerText()).includes("800 osservazioni"),
    "Limite di traccia",
  );
  await run("int main() { return 2; }");
  assert(
    (await page.locator("#status").getAttribute("data-error")) === "true",
    "Uscita non zero rilevata",
  );
  await page
    .getByRole("textbox", { name: "Codice modificabile" })
    .fill("int main() { while (true) {} }");
  await page
    .getByRole("button", { name: "Compila e visualizza", exact: true })
    .click();
  await page.getByRole("button", { name: "Interrompi", exact: true }).click();
  assert(
    (await page.locator("#status").innerText()).includes("interrotta"),
    "Interruzione manuale",
  );
  await page
    .getByRole("button", { name: "Ripristina esempio", exact: true })
    .click();
  await run();
  assert(
    (await page.locator("#status").innerText()).includes("14 osservazioni"),
    "Ripristino e nuova esecuzione dopo errori",
  );
  await page.getByRole("slider", { name: "Passo", exact: true }).focus();
  await page.keyboard.press("End");
  return { passed: results };
};
