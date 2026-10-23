async (page) => {
  const passed = [];
  const assert = (ok, name) => {
    if (!ok) throw new Error(name);
    passed.push(name);
  };
  let serial = 0;
  const n = (kind, fields = {}) => ({ id: "test" + ++serial, kind, ...fields });
  const decl = (name, init) =>
    n("declare", {
      name,
      init,
      type: "int",
      mode: "value",
      size: "",
      constant: false,
    });
  const doc = (body) => ({
    format: "dentro-il-codice-flowchart",
    version: 1,
    functions: [
      { id: "main", name: "main", returnType: "int", params: [], body },
    ],
  });
  const load = async (document) => {
    await page.locator("#flow-pane input[type=file]").setInputFiles({
      name: "test.flow.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(document)),
    });
    await page.waitForFunction(
      () =>
        document.querySelector("#flow-pane input[type=file]").value === "" &&
        document.getElementById("timeline").disabled,
    );
  };
  const run = async () => {
    await page
      .getByRole("button", { name: "Compila e visualizza", exact: true })
      .click();
    await page.waitForFunction(
      () => !document.getElementById("run").disabled,
      null,
      { timeout: 30000 },
    );
  };
  const end = async () => {
    await page.getByRole("slider", { name: "Passo", exact: true }).focus();
    await page.keyboard.press("End");
  };
  await page.getByRole("button", { name: "Flowchart", exact: true }).click();
  await page
    .getByRole("button", { name: "Esempio somma", exact: true })
    .click();
  await run();
  assert(
    (await page.locator("#status").innerText()).includes("22 osservazioni"),
    "Somma: traccia automatica per blocco",
  );
  await end();
  assert(
    (await page.locator("#console").innerText()).includes("Somma = 15"),
    "Somma: output reale 15",
  );
  assert(
    (await page.locator('[data-node="main:end"].flow-active').count()) === 1,
    "Fine diagramma evidenziata",
  );
  assert(
    await page.locator(".flow-canvas").evaluate((el) => el.scrollTop > 0),
    "Scorrimento automatico al blocco attivo",
  );
  await page.getByRole("slider", { name: "Passo", exact: true }).focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Avanti →", exact: true }).click();
  assert(
    (await page.locator("#event").innerText()).includes("VERA"),
    "Condizione vera visibile",
  );
  assert(
    (await page.locator(".flow-node.flow-true").count()) === 1,
    "Blocco condizione verde",
  );
  assert(
    (await page.locator(".flow-edge.flow-chosen.flow-true").count()) > 0,
    "Ramo vero evidenziato",
  );
  await page.getByRole("slider", { name: "Passo", exact: true }).focus();
  await page.keyboard.press("End");
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "← Indietro", exact: true }).click();
  assert(
    (await page.locator("#event").innerText()).includes("FALSA"),
    "Ultimo controllo falso",
  );
  assert(
    (await page.locator(".flow-edge.flow-chosen.flow-false").count()) > 0,
    "Ramo falso evidenziato",
  );
  assert(
    (await page.locator("#console").innerText()).trim() === "—",
    "Console precedente all’output tornando indietro",
  );
  const cond = n("if", {
    condition: "x++ == 1",
    then: [n("assign", { expression: "r = 7" })],
    else: [n("assign", { expression: "r = 99" })],
  });
  await load(
    doc([
      decl("x", "1"),
      decl("r", "0"),
      cond,
      n("output", { expression: 'r << " " << x' }),
    ]),
  );
  await run();
  await end();
  assert(
    (await page.locator("#console").innerText()).trim() === "7 2",
    "Decisione e incremento valutati una sola volta",
  );
  const loop = n("for", {
    init: "int i = 0",
    condition: "i < 5",
    update: "++i",
    body: [
      n("if", { condition: "i == 1", then: [n("continue")], else: [] }),
      n("if", { condition: "i == 4", then: [n("break")], else: [] }),
      n("assign", { expression: "s += i" }),
    ],
  });
  await load(doc([decl("s", "0"), loop, n("output", { expression: "s" })]));
  await run();
  await end();
  assert(
    (await page.locator("#console").innerText()).trim() === "5",
    "For, continue e break: risultato 5",
  );
  assert(
    !(await page.locator("#memory").innerText()).includes("\ni\n"),
    "Variabile del for rimossa alla fine del suo ambito",
  );
  await load(
    doc([
      decl("x", "0"),
      n("do", {
        condition: "x < 2",
        body: [n("assign", { expression: "++x" })],
      }),
      n("output", { expression: "x" }),
    ]),
  );
  await run();
  await end();
  assert(
    (await page.locator("#console").innerText()).trim() === "2",
    "Do while: risultato 2",
  );
  await load(
    doc([
      decl("dato", "0"),
      n("input", { target: "dato", prompt: "Numero: " }),
      n("output", { expression: "dato * 2" }),
    ]),
  );
  await page
    .getByRole("textbox", {
      name: "Input del programma (prima dell’avvio)",
      exact: true,
    })
    .fill("9");
  await run();
  await end();
  assert(
    (await page.locator("#console").innerText()).trim() === "Numero: 18",
    "Input da browser e output 18",
  );
  await page
    .getByRole("textbox", {
      name: "Input del programma (prima dell’avvio)",
      exact: true,
    })
    .fill("");
  await run();
  assert(
    (await page.locator("#status").innerText()).includes("Input esaurito"),
    "Input mancante segnalato",
  );
  await load(doc([decl("dato", "")]));
  await run();
  assert(
    (await page.locator("#status").innerText()).includes("inizializza"),
    "Dichiarazione non inizializzata rifiutata",
  );
  const unsupported = doc([]);
  unsupported.functions.push({
    id: "other",
    name: "calcola",
    returnType: "void",
    params: [],
    body: [],
  });
  await load(unsupported);
  await run();
  assert(
    (await page.locator("#status").innerText()).includes(
      "subroutine non sono ancora supportate",
    ),
    "Subroutine rifiutata esplicitamente",
  );
  await page
    .getByRole("button", { name: "Esempio somma", exact: true })
    .click();
  await run();
  await end();
  return { passed };
};
